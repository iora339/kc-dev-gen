import { Fragment, useState } from "react";
import type { Candidate, Equipment, Ship, ShipType } from "../types";

export type CostSortKey = "fuel" | "ammo" | "steel" | "bauxite" | "devmat";
export type SortKey = CostSortKey | "successRate" | "failRate";

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

const TABLE_LABELS: Record<string, string> = { "鋼燃": "鋼材・燃料" };

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

// 対象の艦種が丸ごと含まれる場合は艦種名にまとめて表示する
function summarizeShips(ids: number[], ships: Ship[], shipTypes: ShipType[]): string[] {
  const idSet = new Set(ids);
  const byType = new Map<number, Ship[]>();
  for (const s of ships) {
    if (!byType.has(s.shipType)) byType.set(s.shipType, []);
    byType.get(s.shipType)!.push(s);
  }
  const typeNameById = new Map(shipTypes.map((t) => [t.id, t.name]));
  const covered = new Set<number>();
  const names: string[] = [];
  for (const [type, list] of byType) {
    if (list.length > 0 && list.every((s) => idSet.has(s.id))) {
      names.push(typeNameById.get(type) ?? `艦種${type}`);
      list.forEach((s) => covered.add(s.id));
    }
  }
  const remaining = orderByShipFamily(ids.filter((id) => !covered.has(id)), ships);
  for (const id of remaining) {
    const name = ships.find((s) => s.id === id)?.name;
    if (name) names.push(name);
  }
  return names;
}

export function ResultCard({ candidate, targets, ships, shipTypes, equipment, hqLevel, sortKey, onSortChange, minCosts }: Props) {
  const [showShips, setShowShips] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [showExcluded, setShowExcluded] = useState(false);

  const { label, shipIds, excludedShipIds, table, resources, result } = candidate;
  const { expectedCost, failRate, successRate, slotMap } = result;

  const shipNames = orderByShipFamily(shipIds, ships).map((id) => ships.find((s) => s.id === id)?.name).filter(Boolean) as string[];
  const excludedShipNames = summarizeShips(excludedShipIds, ships, shipTypes);
  const representativeName = label;
  const otherCount = shipNames.length > 1 ? shipNames.length - 1 : 0;

  const canDevelop = (eq: Equipment) =>
    resources.fuel >= eq.req.fuel * 10 &&
    resources.ammo >= eq.req.ammo * 10 &&
    resources.steel >= eq.req.steel * 10 &&
    resources.bauxite >= eq.req.bauxite * 10 &&
    hqLevel >= eq.rarity * 10;

  const allSlots = Object.entries(slotMap)
    .map(([id, slots]) => ({ eq: equipment.find((e) => e.id === Number(id))!, slots }))
    .filter((x) => x.eq && x.slots > 0 && canDevelop(x.eq))
    .sort((a, b) => b.slots - a.slots);

  const isTarget = (id: number) => targets.some((t) => t.id === id);

  return (
    <div style={{ background: "var(--surface-2)", border: "0.5px solid var(--border)", borderRadius: 12, padding: "1.25rem 1.5rem", position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 16, fontWeight: 500 }}>{representativeName}</span>
        {otherCount > 0 && (
          <div style={{ position: "relative" }}>
            <button
              onClick={() => { setShowShips((v) => !v); setShowDetail(false); }}
              style={{ fontSize: 12, padding: "2px 8px", borderRadius: "var(--radius)", border: "0.5px solid var(--border-strong)", background: "var(--surface-1)", color: "var(--text-secondary)", cursor: "pointer" }}
            >
              他{otherCount}
            </button>
            {showShips && (
              <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, background: "var(--surface-2)", border: "0.5px solid var(--border-strong)", borderRadius: "var(--radius)", padding: "10px 14px", zIndex: 10, whiteSpace: "nowrap", fontSize: 13, boxShadow: "0 2px 8px rgba(0,0,0,0.12)" }}>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>秘書艦候補</div>
                {shipNames.map((name) => <div key={name} style={{ lineHeight: 1.8 }}>{name}</div>)}
              </div>
            )}
          </div>
        )}
        <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>/ {TABLE_LABELS[table] ?? table}テーブル</span>
        {excludedShipIds.length > 0 && (
          <div style={{ position: "relative", marginLeft: "auto" }}>
            <button
              onClick={() => { setShowExcluded((v) => !v); setShowShips(false); setShowDetail(false); }}
              style={{ fontSize: 11, padding: "2px 8px", borderRadius: "var(--radius)", border: "0.5px solid var(--text-warning)", background: "transparent", color: "var(--text-warning)", cursor: "pointer" }}
            >
              除外艦 {excludedShipIds.length}
            </button>
            {showExcluded && (
              <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, background: "var(--surface-2)", border: "0.5px solid var(--border-strong)", borderRadius: "var(--radius)", padding: "10px 14px", zIndex: 10, whiteSpace: "nowrap", fontSize: 13, boxShadow: "0 2px 8px rgba(0,0,0,0.12)" }}>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>旗艦にすべきでない艦</div>
                {excludedShipNames.map((name) => <div key={name} style={{ lineHeight: 1.8 }}>{name}</div>)}
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
              <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, background: "var(--surface-2)", border: "0.5px solid var(--border-strong)", borderRadius: "var(--radius)", padding: "12px 16px", zIndex: 10, minWidth: 220, fontSize: 13, boxShadow: "0 2px 8px rgba(0,0,0,0.12)" }}>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>全開発可能装備</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {allSlots.filter((x) => isTarget(x.eq.id)).map(({ eq, slots }) => (
                    <div key={eq.id} style={{ display: "flex", justifyContent: "space-between", gap: 20, color: "var(--text-accent)", fontWeight: 500 }}>
                      <span>{eq.name}</span><span>{(slots / 50 * 100).toFixed(0)}%</span>
                    </div>
                  ))}
                  {allSlots.some((x) => !isTarget(x.eq.id)) && (
                    <div style={{ borderTop: "0.5px solid var(--border)", margin: "4px 0" }} />
                  )}
                  {allSlots
                    .filter((x) => !isTarget(x.eq.id))
                    .sort((a, b) => a.eq.type - b.eq.type || a.eq.id - b.eq.id)
                    .map(({ eq, slots }) => (
                    <div key={eq.id} style={{ display: "flex", justifyContent: "space-between", gap: 20, color: "var(--text-primary)" }}>
                      <span>{eq.name}</span><span>{(slots / 50 * 100).toFixed(0)}%</span>
                    </div>
                  ))}
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
                <span style={{ fontSize: 13, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{eq.name}</span>
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
