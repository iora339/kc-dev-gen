import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { Candidate, Equipment, Ship, ShipType, SlotMap } from "../types";
import { canDevelop } from "../calc";
import { popupStyle, popupHeadingStyle } from "./popup";

export type CostSortKey = "fuel" | "ammo" | "steel" | "bauxite" | "devmat";
export type SortKey = CostSortKey | "successRate" | "failRate";

// 複数のslotMapに登場する装備IDの和集合を返す（増減比較の対象を漏れなく拾うため）
function unionSlotIds(...maps: SlotMap[]): number[] {
  const ids = new Set<number>();
  for (const m of maps) {
    for (const id of Object.keys(m)) ids.add(Number(id));
  }
  return [...ids];
}

// 増減の符号に応じた色を返す（減少=赤・増加=緑・変化なし=defaultColor）
function deltaColor(delta: number, defaultColor: string): string {
  return delta < 0 ? "var(--text-danger)" : delta > 0 ? "var(--text-success)" : defaultColor;
}

// 増減%を符号付き文字列にする（例: +2% / -2% / 0%）。増加時のみ + を付与する
function deltaText(delta: number): string {
  return `${delta > 0 ? "+" : ""}${delta.toFixed(0)}%`;
}

// 最も多くの要素が取る値（最頻値）を返す。同数の場合は先に出現した値を優先する。
// 除外艦グループの「一般的な艦の増減」を求めるのに使い、少数の特殊艦（天津風等）の
// 値に引きずられないようにする
function mostCommon(values: number[]): number {
  const counts = new Map<number, number>();
  let best = values[0];
  let bestCount = 0;
  for (const v of values) {
    const c = (counts.get(v) ?? 0) + 1;
    counts.set(v, c);
    if (c > bestCount) { best = v; bestCount = c; }
  }
  return best;
}

interface Props {
  candidate: Candidate;
  targets: Equipment[];
  ships: Ship[];
  shipTypes: ShipType[];
  equipment: Equipment[];
  hqLevel: number;
  sortKey: SortKey;
  onSortChange: (key: SortKey) => void;
  minCosts: Record<CostSortKey, number> | null;
}

// 表示専用のテーブル名の上書き。ここに無いテーブルはデータ上の名前をそのまま表示する
const TABLE_LABELS: Record<string, string> = { "鋼燃": "鋼材・燃料" };

// 暫定検証データ(provisional override)による補正を示す⚠バッジ。
// U+FE0E(異体字セレクタ)で単色字形を強制してCSSの色指定を効かせ、
// inline-blockで親要素のtext-decoration(下線)が及ばないようにする
function ProvisionalBadge() {
  return (
    <span title="暫定検証データによる補正" style={{ display: "inline-block", color: "var(--text-warning)", cursor: "help", marginLeft: 3 }}>
      {"⚠︎"}
    </span>
  );
}

// 装備名と値（開発率や増減%）を左右に並べる1行。ポップアップ内の一覧表示で共用する
function SlotRow({ name, text, color, bold, provisional }: { name: string; text: string; color: string; bold?: boolean; provisional?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 20, color, fontWeight: bold ? 500 : undefined }}>
      <span>{name}{provisional && <ProvisionalBadge />}</span><span>{text}</span>
    </div>
  );
}

// afterIdでつながる艦（睦月/睦月改/睦月改二 等）がまとまるように並び替える
// 最終改造形同士が互いのafterIdを指す（改二乙⇔改二丙のような分岐）データもあるため、
// 有向チェーンではなく無向グラフの連結成分として艦系列を求める
function orderByShipFamily(ids: number[], ships: Ship[]): number[] {
  const shipById = new Map(ships.map((s) => [s.id, s]));
  const adjacency = new Map<number, number[]>();
  const afterIdTargets = new Set<number>();
  for (const s of ships) {
    if (s.afterId === null || s.afterId === s.id || !shipById.has(s.afterId)) continue;
    afterIdTargets.add(s.afterId);
    if (!adjacency.has(s.id)) adjacency.set(s.id, []);
    if (!adjacency.has(s.afterId)) adjacency.set(s.afterId, []);
    adjacency.get(s.id)!.push(s.afterId);
    adjacency.get(s.afterId)!.push(s.id);
  }

  const rootOfId = new Map<number, number>();
  const depthOfId = new Map<number, number>();
  const visitedGlobal = new Set<number>();

  function processComponent(start: number) {
    const component: number[] = [];
    const seen = new Set<number>([start]);
    const queue = [start];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      component.push(cur);
      for (const next of adjacency.get(cur) ?? []) {
        if (!seen.has(next)) { seen.add(next); queue.push(next); }
      }
    }
    const root = component.find((n) => !afterIdTargets.has(n)) ?? Math.min(...component);

    const depthSeen = new Set<number>([root]);
    const depthQueue: Array<[number, number]> = [[root, 0]];
    while (depthQueue.length > 0) {
      const [cur, depth] = depthQueue.shift()!;
      rootOfId.set(cur, root);
      depthOfId.set(cur, depth);
      for (const next of adjacency.get(cur) ?? []) {
        if (!depthSeen.has(next)) { depthSeen.add(next); depthQueue.push([next, depth + 1]); }
      }
    }
    component.forEach((n) => visitedGlobal.add(n));
  }

  for (const id of ids) {
    if (!visitedGlobal.has(id)) processComponent(id);
  }

  const groups = new Map<number, number[]>();
  for (const id of ids) {
    const root = rootOfId.get(id) ?? id;
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(id);
  }
  // sortId(=api_sortno、ゲーム内図鑑順)でグループを並べる。各グループ内は改修段階順を維持する。
  // shipType(stype ID)は図鑑順と一致しない（揚陸艦17 < 装甲空母18 等）ため使わない
  const sortedRoots = [...groups.keys()].sort((a, b) => {
    const sa = shipById.get(a);
    const sb = shipById.get(b);
    return (sa?.sortId ?? a) - (sb?.sortId ?? b);
  });
  const ordered: number[] = [];
  for (const root of sortedRoots) {
    const members = groups.get(root)!;
    members.sort((a, b) => (depthOfId.get(a) ?? 0) - (depthOfId.get(b) ?? 0));
    ordered.push(...members);
  }
  return ordered;
}

// 対象の艦種が丸ごと含まれる場合は艦種名にまとめて表示する（配下の艦IDも保持し、クリック時の詳細表示に使う）
function summarizeShipGroups(ids: number[], ships: Ship[], shipTypes: ShipType[]): { label: string; shipIds: number[] }[] {
  const idSet = new Set(ids);
  const byType = new Map<number, Ship[]>();
  for (const s of ships) {
    if (!byType.has(s.shipType)) byType.set(s.shipType, []);
    byType.get(s.shipType)!.push(s);
  }
  const typeNameById = new Map(shipTypes.map((t) => [t.id, t.name]));
  const covered = new Set<number>();
  // 艦種まとめは先に表示し、艦種内最小sortId（図鑑順）で並べる
  const groups: { label: string; shipIds: number[] }[] = [];
  const coveredTypes = [...byType.entries()]
    .filter(([, list]) => list.length > 0 && list.every((s) => idSet.has(s.id)))
    .map(([type, list]) => ({ type, list, minSortId: Math.min(...list.map((s) => s.sortId)) }))
    .sort((a, b) => a.minSortId - b.minSortId);
  for (const { type, list } of coveredTypes) {
    groups.push({ label: typeNameById.get(type) ?? `艦種${type}`, shipIds: list.map((s) => s.id) });
    list.forEach((s) => covered.add(s.id));
  }
  // 個別艦は艦種まとめの後にsortId（図鑑順）で並べる
  const remaining = orderByShipFamily(ids.filter((id) => !covered.has(id)), ships);
  for (const id of remaining) {
    const ship = ships.find((s) => s.id === id);
    if (ship) groups.push({ label: ship.name, shipIds: [id] });
  }
  return groups;
}

export function ResultCard({ candidate, targets, ships, shipTypes, equipment, hqLevel, sortKey, onSortChange, minCosts }: Props) {
  const [showShips, setShowShips] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [showExcluded, setShowExcluded] = useState(false);
  const [selectedExcludedGroup, setSelectedExcludedGroup] = useState<{ label: string; shipIds: number[] } | null>(null);
  const excludedGroupRef = useRef<HTMLDivElement>(null);

  // 除外艦の「増減する装備」ポップアップは外側クリックで閉じる
  useEffect(() => {
    if (!selectedExcludedGroup) return;
    const onOutsideClick = (e: MouseEvent) => {
      if (excludedGroupRef.current && !excludedGroupRef.current.contains(e.target as Node)) {
        setSelectedExcludedGroup(null);
      }
    };
    document.addEventListener("mousedown", onOutsideClick);
    return () => document.removeEventListener("mousedown", onOutsideClick);
  }, [selectedExcludedGroup]);

  const { label, shipIds, excludedShipIds, table, resources, result, baseSlotMap, excludedShipSlotMaps, provisionalEqIds, excludedShipProvisionalEqIds } = candidate;
  // provisionalEqIds が空でなければ暫定データがこの候補の数値に影響している
  const hasProvisional = provisionalEqIds.length > 0;
  const { expectedCost, failRate, successRate, slotMap } = result;

  const shipById = useMemo(() => new Map(ships.map((s) => [s.id, s])), [ships]);
  const equipmentById = useMemo(() => new Map(equipment.map((e) => [e.id, e])), [equipment]);

  // 系列グラフ構築を伴うため、ポップアップ開閉等の再レンダーで再計算しないよう useMemo にする
  const shipNames = useMemo(
    () => orderByShipFamily(shipIds, ships).map((id) => shipById.get(id)?.name).filter(Boolean) as string[],
    [shipIds, ships, shipById]
  );
  const excludedShipGroups = useMemo(
    () => summarizeShipGroups(excludedShipIds, ships, shipTypes),
    [excludedShipIds, ships, shipTypes]
  );
  const otherCount = shipNames.length > 1 ? shipNames.length - 1 : 0;

  // overrideによって0%まで下がった装備も表示するため、現在値・override適用前どちらかで枠がある装備を対象にする
  const allSlots = useMemo(
    () =>
      unionSlotIds(slotMap, baseSlotMap)
        .map((id) => ({ eq: equipmentById.get(id)!, slots: slotMap[id] || 0, baseSlots: baseSlotMap[id] || 0 }))
        .filter((x) => x.eq && (x.slots > 0 || x.baseSlots > 0) && canDevelop(x.eq, resources, hqLevel))
        .sort((a, b) => b.slots - a.slots),
    [slotMap, baseSlotMap, equipmentById, resources, hqLevel]
  );

  const isTarget = (id: number) => targets.some((t) => t.id === id);
  const provisionalEqIdSet = useMemo(() => new Set(provisionalEqIds), [provisionalEqIds]);

  // override前後の増減を色分け・(+2%)等の表記にして返す（対象装備・その他装備の詳細表示で共用）
  function formatSlotDelta(slots: number, baseSlots: number, defaultColor: string) {
    const pct = slots / 50 * 100;
    const delta = pct - baseSlots / 50 * 100;
    const text = `${pct.toFixed(0)}%${delta !== 0 ? `(${deltaText(delta)})` : ""}`;
    return { color: deltaColor(delta, defaultColor), text };
  }

  // 除外艦ポップアップ用に増減量のみ（合計値なし）を色分けして返す
  function formatSlotDeltaOnly(slots: number, baseSlots: number) {
    const delta = (slots - baseSlots) / 50 * 100;
    return { color: deltaColor(delta, "var(--text-primary)"), text: deltaText(delta) };
  }

  // 除外艦グループ（艦種名でまとめた表示上のグループ）の「一般的な艦」の増減を抽出する。
  // 各装備のスロット値はグループ内の最頻値を代表とするため、少数の特殊艦（天津風の8cm高角砲
  // 追加-2%等）が混ざっても多数派の値が表示される。特殊艦だけが変化させる装備は最頻値が
  // 基準値と一致するので表示されない
  function getExcludedShipChanges(group: { label: string; shipIds: number[] }) {
    const memberSlotMaps = group.shipIds.map((id) => excludedShipSlotMaps[id] || {});
    // グループ内のいずれかの艦で暫定overrideの影響を受けた装備は⚠バッジの対象にする
    const provisionalIds = new Set(group.shipIds.flatMap((id) => excludedShipProvisionalEqIds[id] ?? []));
    return unionSlotIds(baseSlotMap, ...memberSlotMaps)
      .map((id) => {
        const slots = mostCommon(memberSlotMaps.map((m) => m[id] || 0));
        return { eq: equipmentById.get(id)!, slots, baseSlots: baseSlotMap[id] || 0, provisional: provisionalIds.has(id) };
      })
      .filter((x) => x.eq && x.slots !== x.baseSlots && canDevelop(x.eq, resources, hqLevel))
      .sort((a, b) => (b.slots - b.baseSlots) - (a.slots - a.baseSlots));
  }

  return (
    <div style={{ background: "var(--surface-2)", border: "0.5px solid var(--border)", borderRadius: 12, padding: "1.25rem 1.5rem", position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 16, fontWeight: 500 }}>{label}{hasProvisional && <ProvisionalBadge />}</span>
        {otherCount > 0 && (
          <div style={{ position: "relative" }}>
            <button
              onClick={() => { setShowShips((v) => !v); setShowDetail(false); }}
              style={{ fontSize: 12, padding: "2px 8px", borderRadius: "var(--radius)", border: "0.5px solid var(--border-strong)", background: "var(--surface-1)", color: "var(--text-secondary)", cursor: "pointer" }}
            >
              他{otherCount}
            </button>
            {showShips && (
              <div style={popupStyle({ top: "calc(100% + 4px)", left: 0 })}>
                <div style={popupHeadingStyle}>秘書艦候補</div>
                {shipNames.map((name) => <div key={name} style={{ lineHeight: 1.8 }}>{name}{hasProvisional && <ProvisionalBadge />}</div>)}
              </div>
            )}
          </div>
        )}
        <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>/ {TABLE_LABELS[table] ?? table}テーブル</span>
        {excludedShipIds.length > 0 && (
          <div style={{ position: "relative", marginLeft: "auto" }}>
            <button
              onClick={() => { setShowExcluded((v) => !v); setShowShips(false); setShowDetail(false); setSelectedExcludedGroup(null); }}
              style={{ fontSize: 11, padding: "2px 8px", borderRadius: "var(--radius)", border: "0.5px solid var(--text-warning)", background: "transparent", color: "var(--text-warning)", cursor: "pointer" }}
            >
              除外艦 {excludedShipIds.length}
            </button>
            {showExcluded && (
              <div style={popupStyle({ top: "calc(100% + 4px)", right: 0 })}>
                <div style={popupHeadingStyle}>旗艦にすべきでない艦</div>
                {excludedShipGroups.map((group) => (
                  <div key={group.label} ref={selectedExcludedGroup?.label === group.label ? excludedGroupRef : undefined} style={{ position: "relative" }}>
                    <div
                      onClick={() => setSelectedExcludedGroup((prev) => (prev?.label === group.label ? null : group))}
                      title="クリックで増減する装備を表示"
                      style={{ lineHeight: 1.8, cursor: "pointer", textDecoration: "underline dotted", color: selectedExcludedGroup?.label === group.label ? "var(--text-accent)" : "inherit" }}
                    >
                      {group.label}{group.shipIds.some((id) => (excludedShipProvisionalEqIds[id] ?? []).length > 0) && <ProvisionalBadge />}
                    </div>
                    {selectedExcludedGroup?.label === group.label && (
                      <div style={popupStyle({ top: 0, right: "calc(100% + 8px)", zIndex: 11 })}>
                        <div style={popupHeadingStyle}>{group.label} / 増減する装備</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                          {getExcludedShipChanges(group).map(({ eq, slots, baseSlots, provisional }) => {
                            const { color, text } = formatSlotDeltaOnly(slots, baseSlots);
                            return <SlotRow key={eq.id} name={eq.name} text={text} color={color} provisional={provisional} />;
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ background: "var(--surface-1)", borderRadius: "var(--radius)", padding: "8px 12px", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 3 }}>投入資源</div>
            <div style={{ fontSize: 14 }}>燃{resources.fuel} 弾{resources.ammo} 鋼{resources.steel} ボ{resources.bauxite}</div>
          </div>
          <div style={{ display: "flex", gap: 20, textAlign: "right" }}>
            <div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 3 }}>対象開発率</div>
              <div
                onClick={() => onSortChange("successRate")}
                title="クリックでこの項目の降順に並び替え"
                style={{ display: "inline-block", fontSize: 14, fontWeight: sortKey === "successRate" ? 700 : 500, color: "var(--text-success)", cursor: "pointer", textDecoration: sortKey === "successRate" ? "underline" : "none" }}
              >{(successRate * 100).toFixed(1)}%</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 3 }}>開発失敗率</div>
              <div
                onClick={() => onSortChange("failRate")}
                title="クリックでこの項目の降順に並び替え"
                style={{ display: "inline-block", fontSize: 14, fontWeight: sortKey === "failRate" ? 700 : 500, color: "var(--text-danger)", cursor: "pointer", textDecoration: sortKey === "failRate" ? "underline" : "none" }}
              >{(failRate * 100).toFixed(1)}%</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ background: "var(--surface-1)", borderRadius: "var(--radius)", padding: "10px 12px", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>装備別開発率</div>
          <div style={{ position: "relative" }}>
            <button
              onClick={() => { setShowDetail((v) => !v); setShowShips(false); }}
              style={{ fontSize: 12, padding: "2px 10px", borderRadius: "var(--radius)", border: "0.5px solid var(--border-strong)", background: "transparent", color: "var(--text-secondary)", cursor: "pointer" }}
            >
              詳細
            </button>
            {showDetail && (
              <div style={popupStyle({ top: "calc(100% + 4px)", right: 0, padding: "12px 16px", minWidth: 220 })}>
                <div style={{ ...popupHeadingStyle, marginBottom: 10 }}>全開発可能装備</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {allSlots.filter((x) => isTarget(x.eq.id)).map(({ eq, slots, baseSlots }) => {
                    const { color, text } = formatSlotDelta(slots, baseSlots, "var(--text-accent)");
                    return <SlotRow key={eq.id} name={eq.name} text={text} color={color} bold provisional={provisionalEqIdSet.has(eq.id)} />;
                  })}
                  {allSlots.some((x) => !isTarget(x.eq.id)) && (
                    <div style={{ borderTop: "0.5px solid var(--border)", margin: "4px 0" }} />
                  )}
                  {allSlots
                    .filter((x) => !isTarget(x.eq.id))
                    .sort((a, b) => a.eq.type - b.eq.type || a.eq.id - b.eq.id)
                    .map(({ eq, slots, baseSlots }) => {
                      const { color, text } = formatSlotDelta(slots, baseSlots, "var(--text-primary)");
                      return <SlotRow key={eq.id} name={eq.name} text={text} color={color} provisional={provisionalEqIdSet.has(eq.id)} />;
                    })}
                  {failRate > 0 && (
                    <>
                      <div style={{ borderTop: "0.5px solid var(--border)", margin: "4px 0" }} />
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 20, color: "var(--text-muted)" }}>
                        <span>開発失敗</span><span>{(failRate * 100).toFixed(0)}%</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr) auto", alignItems: "center", columnGap: 8, rowGap: 7 }}>
          {targets.map((eq) => {
            const slots = slotMap[eq.id] || 0;
            const pct = slots / 50 * 100;
            return (
              <Fragment key={eq.id}>
                <span style={{ fontSize: 13, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{eq.name}{provisionalEqIdSet.has(eq.id) && <ProvisionalBadge />}</span>
                <div style={{ height: 5, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: "var(--fill-accent)" }} />
                </div>
                <span style={{ fontSize: 13, minWidth: 32, textAlign: "right" }}>{pct.toFixed(0)}%</span>
              </Fragment>
            );
          })}
        </div>
      </div>

      <div style={{ borderTop: "0.5px solid var(--border)", paddingTop: 10, fontSize: 13, color: "var(--text-secondary)" }}>
        期待消費：
        {([
          ["fuel", "燃", expectedCost.fuel, expectedCost.fuel.toFixed(0)],
          ["ammo", "弾", expectedCost.ammo, expectedCost.ammo.toFixed(0)],
          ["steel", "鋼", expectedCost.steel, expectedCost.steel.toFixed(0)],
          ["bauxite", "ボ", expectedCost.bauxite, expectedCost.bauxite.toFixed(0)],
          ["devmat", "資材", expectedCost.devmat, expectedCost.devmat.toFixed(2)],
        ] as const).map(([key, label, rawValue, text], i) => {
          // 全候補中の最小値は太字で強調する
          const isMin = minCosts !== null && rawValue === minCosts[key];
          return (
            <span
              key={key}
              onClick={() => onSortChange(key)}
              title="クリックでこの項目の昇順に並び替え"
              style={{
                cursor: "pointer",
                color: sortKey === key ? "var(--text-accent)" : "inherit",
                fontWeight: sortKey === key || isMin ? 700 : 400,
                textDecoration: sortKey === key ? "underline" : "none",
                marginLeft: i > 0 ? 6 : 0,
              }}
            >
              {label}{text}
            </span>
          );
        })}
      </div>
    </div>
  );
}
