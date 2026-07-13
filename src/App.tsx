import { useState, useMemo, useRef, useEffect, type CSSProperties, type RefObject } from "react";
import { useData } from "./useData";
import { calcOptimal, isCombinable, groupOverridesByKey, equipmentExpectedNail } from "./calc";
import type { Candidate, Equipment, Ship } from "./types";
import { EquipmentSelector } from "./components/EquipmentSelector";
import { useIsSingleColumn } from "./hooks/useIsSingleColumn";
import { TYPE_COLORS, DEFAULT_COLOR } from "./components/typeColors";
import { ResultCard, type CostSortKey, type SortKey } from "./components/ResultCard";
import { popupStyle } from "./components/popup";

// 装備選択タブの分類。typeIds は master 由来の装備カテゴリID（Equipment.type）。
// typeIds が空の「その他」は、どのカテゴリにも属さない開発可能装備の受け皿
const EQUIPMENT_CATEGORIES: { label: string; typeIds: number[] }[] = [
  { label: "小口径", typeIds: [1] },
  { label: "中口径", typeIds: [2] },
  { label: "大口径", typeIds: [3] },
  { label: "副砲", typeIds: [4] },
  { label: "魚雷", typeIds: [5, 22, 32] },
  { label: "艦戦", typeIds: [6] },
  { label: "艦爆", typeIds: [7] },
  { label: "艦攻", typeIds: [8] },
  { label: "他艦載機", typeIds: [9, 94, 25, 26] },
  { label: "水上機", typeIds: [10, 11, 41, 45] },
  { label: "電探", typeIds: [12, 13, 93] },
  { label: "対潜", typeIds: [14, 15, 40] },
  { label: "強化弾", typeIds: [18, 19, 20] },
  { label: "機銃", typeIds: [21] },
  { label: "陸上機", typeIds: [47, 48, 49, 53] },
  { label: "その他", typeIds: [] },
];

// 現在のソート基準を「結果 N件」の横に表示するためのラベル
function sortKeyLabel(sortKey: SortKey, equipmentById: Map<number, Equipment>): string {
  if (sortKey === "successRate") return "対象開発率が高い順";
  if (sortKey === "failRate") return "開発失敗率が高い順";
  if (sortKey.startsWith("nail-")) {
    const name = equipmentById.get(Number(sortKey.slice("nail-".length)))?.name ?? "";
    return `${name}の釘が少ない順`;
  }
  const costLabels: Record<CostSortKey, string> = { fuel: "燃料", ammo: "弾薬", steel: "鋼材", bauxite: "ボーキ", devmat: "釘" };
  return `${costLabels[sortKey as CostSortKey]}が少ない順`;
}

// 暫定データポップアップの横位置。通常はアンカー中央揃え、480px以下ではそれだと画面右に
// はみ出すため画面左端16px基準に切り替える（ポップアップ幅 min(380px, 100vw-32px) と対で機能する）。
// 狭幅時のオフセットはrender中にrefを読めないため、ポップアップを開くクリック時に measure() で測定する
function usePendingPopupPosition(anchorRef: RefObject<HTMLSpanElement | null>): { position: CSSProperties; measure: () => void } {
  const isNarrow = useIsSingleColumn(480);
  const [narrowLeft, setNarrowLeft] = useState(0);
  const measure = () => {
    if (anchorRef.current) setNarrowLeft(16 - anchorRef.current.getBoundingClientRect().left);
  };
  const position: CSSProperties = isNarrow
    ? { left: narrowLeft }
    : { left: "50%", transform: "translateX(-50%)" };
  return { position, measure };
}

export default function App() {
  const { data, error } = useData();
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [hqLevel, setHqLevel] = useState(120);
  const [sortKey, setSortKey] = useState<SortKey>("devmat");
  const [usePendingData, setUsePendingData] = useState(false);
  const [showPendingInfo, setShowPendingInfo] = useState(false);
  const pendingInfoRef = useRef<HTMLSpanElement>(null);
  const pendingPopup = usePendingPopupPosition(pendingInfoRef);

  // 暫定データの説明ポップアップは外側クリックで閉じる
  useEffect(() => {
    if (!showPendingInfo) return;
    const onOutsideClick = (e: MouseEvent) => {
      if (pendingInfoRef.current && !pendingInfoRef.current.contains(e.target as Node)) {
        setShowPendingInfo(false);
      }
    };
    document.addEventListener("mousedown", onOutsideClick);
    return () => document.removeEventListener("mousedown", onOutsideClick);
  }, [showPendingInfo]);

  // 暫定使用時は確定分の後ろに暫定分を結合する（overrides-pending.jsonは暫定分のみを持つ）
  const activeOverrides = useMemo(() => {
    if (!data) return [];
    return usePendingData ? [...data.overrides, ...data.overridesPending] : data.overrides;
  }, [data, usePendingData]);

  const equipmentById = useMemo(
    () => new Map<number, Equipment>(data?.equipment.map((e) => [e.id, e])),
    [data]
  );
  const shipById = useMemo(
    () => new Map<number, Ship>(data?.ships.map((s) => [s.id, s])),
    [data]
  );

  // 説明ポップアップ用の暫定データ一覧。艦名は未改形態のみ表示する（改装後は自動的に含まれる）
  const pendingSummary = useMemo(() => {
    if (!data) return [];
    const equipName = (id: number) => equipmentById.get(id)?.name ?? "";
    return data.overridesPending.map((o, i) => {
      const idSet = new Set(o.shipIds);
      const rootNames = o.shipIds
        .filter((id) => !o.shipIds.some((other) => shipById.get(other)?.afterId === id && idSet.has(other)))
        .map((id) => shipById.get(id)?.name)
        .filter((name): name is string => !!name);
      return {
        key: i,
        ships: rootNames.join("・"),
        // 列幅が狭いため表示専用の短縮表記にする（ResultCardの「鋼材・燃料」とは別）
        table: o.table === "鋼燃" ? "鋼・燃" : o.table,
        // スロット値は%の半分なので、%表示のため×2する
        rows: [
          ...(o.to.id !== null ? [{ item: equipName(o.to.id), delta: o.to.slots * 2 }] : []),
          ...o.from.map((f) => ({ item: equipName(f.id), delta: -f.slots * 2 })),
        ],
      };
    });
  }, [data, shipById, equipmentById]);
  const overridesByKey = useMemo(
    () => groupOverridesByKey(activeOverrides),
    [activeOverrides]
  );

  const calcResult = useMemo(() => {
    if (!data || selectedIds.length === 0) return null;
    return calcOptimal(selectedIds, hqLevel, equipmentById, shipById, overridesByKey, data.devTableData);
  }, [selectedIds, hqLevel, data, equipmentById, shipById, overridesByKey]);

  const candidates: Candidate[] | null = calcResult && !("error" in calcResult) ? calcResult.candidates : null;
  const calcError = calcResult && "error" in calcResult ? calcResult.error : null;

  // コスト項目ごとの全候補中の最小値（ResultCardで該当値を太字強調するのに使う）
  const minCosts = useMemo(() => {
    if (!candidates || candidates.length === 0) return null;
    const keys = ["fuel", "ammo", "steel", "bauxite", "devmat"] as const;
    const result = {} as Record<CostSortKey, number>;
    for (const key of keys) {
      result[key] = Math.min(...candidates.map((c) => c.result.expectedCost[key]));
    }
    return result;
  }, [candidates]);

  // 開発可能な装備 = 開発テーブルに基礎値がある装備 + overrideの付け替え先になっている装備
  const developableIds = useMemo(() => {
    if (!data) return new Set<number>();
    const ids = new Set<number>();
    for (const [id, tableVals] of Object.entries(data.devTableData)) {
      if (Object.values(tableVals).some((v) => v > 0)) ids.add(Number(id));
    }
    for (const ov of activeOverrides) {
      if (ov.to.id !== null) ids.add(ov.to.id);
    }
    return ids;
  }, [data, activeOverrides]);

  // 選択中の装備と同時に開発できない装備は選択ボタンを無効化する
  const disabledIds = useMemo(() => {
    if (!data) return new Set<number>();
    const disabled = new Set<number>();
    for (const id of developableIds) {
      if (selectedIds.includes(id)) continue;
      const combinable = isCombinable([...selectedIds, id], hqLevel, equipmentById, overridesByKey, data.devTableData);
      if (!combinable) disabled.add(id);
    }
    return disabled;
  }, [data, developableIds, selectedIds, hqLevel, equipmentById, overridesByKey]);

  function toggleEquip(id: number) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
    // 装備別釘ソート("nail-<装備ID>")の対象装備を選択解除したら既定の資材ソートに戻す
    // （"nail-<id>"がsortKeyになり得るのはidが選択中の間だけなので、一致すれば必ず解除操作）
    setSortKey((prev) => (prev === `nail-${id}` ? "devmat" : prev));
  }

  function clearEquip() {
    setSelectedIds([]);
    setSortKey((prev) => (prev.startsWith("nail-") ? "devmat" : prev));
  }

  if (error) return <div style={{ padding: "2rem", color: "var(--text-danger)" }}>{error}</div>;
  if (!data) return <div style={{ padding: "2rem", color: "var(--text-muted)" }}>読み込み中...</div>;

  const selectedEquip = selectedIds.flatMap((id) => {
    const eq = equipmentById.get(id);
    return eq ? [eq] : [];
  });

  // 開発率系(対象開発率・開発失敗率)は高いほど望ましいため降順、コスト系は昇順で並べる。
  // "nail-<装備ID>" は装備単体を狙った場合の期待釘消費（昇順）でのソート
  const displayedCandidates = candidates
    ? [...candidates].sort((a, b) => {
        if (sortKey === "successRate") return b.result.successRate - a.result.successRate;
        if (sortKey === "failRate") return b.result.failRate - a.result.failRate;
        if (sortKey.startsWith("nail-")) {
          const eqId = Number(sortKey.slice("nail-".length));
          return equipmentExpectedNail(a.result, eqId) - equipmentExpectedNail(b.result, eqId);
        }
        // ここまでで successRate/failRate/nail-* は分岐済みのため、残りは CostSortKey のみ
        const costKey = sortKey as CostSortKey;
        return a.result.expectedCost[costKey] - b.result.expectedCost[costKey];
      })
    : candidates;

  return (
    <div className="app-container" style={{ fontFamily: "var(--font-sans)", maxWidth: 1200, margin: "0 auto", minHeight: "100vh", boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
      <h1 style={{ fontSize: 23, fontWeight: 700, letterSpacing: "0.01em", color: "var(--text-primary)", margin: "0 0 1.5rem" }}>艦これ　開発レシピ検索ツール</h1>
      <div className="main-grid" style={{ display: "grid", gap: "2rem", alignItems: "start" }}>
        <div>
          <EquipmentSelector
            equipment={data.equipment}
            developableIds={developableIds}
            selectedIds={selectedIds}
            disabledIds={disabledIds}
            categories={EQUIPMENT_CATEGORIES}
            onToggle={toggleEquip}
          />
          <div style={{ marginTop: 16 }}>
            <p style={{ fontSize: 14, color: "var(--text-muted)", margin: "0 0 8px", display: "flex", alignItems: "center", gap: 10, minHeight: 23 }}>
              対象装備 <span style={{ color: "var(--text-accent)" }}>{selectedIds.length}件</span>
              {selectedIds.length > 0 && (
                <button
                  onClick={clearEquip}
                  style={{ fontSize: 12, padding: "2px 8px", borderRadius: "var(--radius)", border: "0.5px solid var(--border-strong)", background: "transparent", color: "var(--text-secondary)", cursor: "pointer" }}
                >
                  すべて解除
                </button>
              )}
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16, minHeight: 32 }}>
              {selectedIds.length === 0 ? (
                <span style={{ fontSize: 14, color: "var(--text-muted)" }}>装備を選択してください</span>
              ) : (
                selectedEquip.map((eq) => {
                  const c = TYPE_COLORS[eq.iconType] ?? DEFAULT_COLOR;
                  return (
                    <span
                      key={eq.id}
                      onClick={() => toggleEquip(eq.id)}
                      style={{ display: "inline-flex", alignItems: "center", gap: 5, background: c.bg, color: c.text, fontSize: 14, padding: "4px 10px", borderRadius: "var(--radius)", cursor: "pointer" }}
                    >
                      {eq.name} ✕
                    </span>
                  );
                })
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <label style={{ fontSize: 14, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>司令部Lv</label>
              <input
                type="number"
                value={hqLevel}
                min={1}
                max={120}
                // 空欄(Number("")=0)や範囲外の直接入力は1〜120に補正する
                onChange={(e) => setHqLevel(Math.min(120, Math.max(1, Number(e.target.value) || 1)))}
                style={{ width: 90, fontSize: 15 }}
              />
              <span ref={pendingInfoRef} style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", position: "relative" }}>
                <input
                  type="checkbox"
                  checked={usePendingData}
                  onChange={(e) => setUsePendingData(e.target.checked)}
                  style={{ cursor: "pointer" }}
                />
                <span
                  onClick={() => {
                    pendingPopup.measure();
                    setShowPendingInfo((v) => !v);
                  }}
                  style={{ fontSize: 14, color: "var(--text-secondary)", cursor: "pointer", textDecoration: "underline dotted" }}
                >
                  暫定データを使用
                </span>
                {showPendingInfo && (
                  <div style={popupStyle({ top: "calc(100% + 4px)", ...pendingPopup.position, width: "min(380px, calc(100vw - 32px))", lineHeight: 1.7, color: "var(--text-primary)", whiteSpace: "normal" })}>
                    検証データが不足していますが、<a href="https://github.com/poooi/poi-server/wiki" target="_blank" rel="noopener noreferrer" style={{ color: "var(--text-accent)" }}>poi data dumps</a>（2026-7-10時点）を元に暫定の開発率データを作成しました。チェックすると以下が計算に含まれ、<span style={{ display: "inline-block", color: "var(--text-warning)" }}>⚠︎</span>マークが表示されるようになります。今後の検証によって、数値が変更・削除される可能性が大いにありますのでご注意ください。
                    <table style={{ borderCollapse: "collapse", marginTop: 8, width: "100%", fontSize: 12, lineHeight: 1.5, tableLayout: "fixed" }}>
                      <thead>
                        <tr>
                          {([["秘書艦", 96], ["テーブル", 58], ["装備", undefined], ["増減", 40]] as const).map(([h, w]) => (
                            <th key={h} style={{ width: w, textAlign: "left", color: "var(--text-muted)", fontWeight: 400, padding: "2px 6px", borderBottom: "0.5px solid var(--border-strong)", whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {pendingSummary.map((g) =>
                          g.rows.map((r, ri) => (
                            <tr key={`${g.key}-${ri}`}>
                              {ri === 0 && (
                                <td rowSpan={g.rows.length} style={{ padding: "3px 6px", borderBottom: "0.5px solid var(--border)", verticalAlign: "middle", overflowWrap: "break-word" }}>{g.ships}</td>
                              )}
                              {ri === 0 && (
                                <td rowSpan={g.rows.length} style={{ padding: "3px 6px", borderBottom: "0.5px solid var(--border)", verticalAlign: "middle", whiteSpace: "nowrap" }}>{g.table}</td>
                              )}
                              <td style={{ padding: "3px 6px", borderBottom: "0.5px solid var(--border)", color: r.delta > 0 ? "var(--text-success)" : "var(--text-danger)" }}>{r.item}</td>
                              <td style={{ padding: "3px 6px", borderBottom: "0.5px solid var(--border)", whiteSpace: "nowrap", textAlign: "right", color: r.delta > 0 ? "var(--text-success)" : "var(--text-danger)" }}>{r.delta > 0 ? `+${r.delta}` : r.delta}%</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {calcError && <p style={{ fontSize: 13, color: "var(--text-danger)" }}>{calcError}</p>}
          {!calcError && (
            <>
              <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
                結果 <span style={{ color: "var(--text-primary)" }}>{candidates?.length ?? 0}件</span>
                {candidates && candidates.length > 0 && (
                  // 既定(釘)以外のソート中はクリックで既定に戻せる
                  sortKey === "devmat" ? (
                    <span style={{ marginLeft: 6 }}>⇅：{sortKeyLabel(sortKey, equipmentById)}</span>
                  ) : (
                    <span
                      onClick={() => setSortKey("devmat")}
                      title="クリックで既定の釘ソートに戻す"
                      style={{ marginLeft: 6, cursor: "pointer", textDecoration: "underline dotted", color: "var(--text-accent)" }}
                    >
                      ⇅：{sortKeyLabel(sortKey, equipmentById)}
                    </span>
                  )
                )}
              </p>
              {selectedIds.length === 0 ? null : candidates!.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--text-muted)" }}>全装備を同時に開発できるレシピはありません。</p>
              ) : (
                displayedCandidates!.map((c, i) => (
                  <ResultCard
                    // 選択装備や暫定データの切替時はカードを作り直し、開いていたポップアップ等の内部状態を持ち越さない
                    key={`${selectedIds.join(",")}-${usePendingData}-${i}`}
                    candidate={c}
                    targets={selectedEquip}
                    ships={data.ships}
                    shipTypes={data.shipTypes}
                    equipment={data.equipment}
                    hqLevel={hqLevel}
                    sortKey={sortKey}
                    // 同じ項目をもう一度クリックしたら既定の資材ソートに戻す
                    onSortChange={(key) => setSortKey((prev) => (prev === key ? "devmat" : key))}
                    minCosts={minCosts}
                  />
                ))
              )}
            </>
          )}
        </div>
      </div>
      <footer style={{ marginTop: "auto", paddingTop: "2rem", fontSize: 12, color: "var(--text-muted)" }}>
        <p style={{ margin: "0 0 4px" }}>ご意見ご要望はこちらに：<a href="https://marshmallow-qa.com/lmingitwavpu1ou?t=0HNCFk&utm_medium=url_text&utm_source=promotion" target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>マシュマロ（匿名メッセージ）</a></p>
        <p style={{ margin: "0 0 4px" }}>開発率参考サイト：<a href="https://bbs.nga.cn/read.php?tid=34725123" target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>https://bbs.nga.cn/read.php?tid=34725123</a></p>
        <p style={{ margin: 0, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8 }}>
          <a href="https://github.com/iora339/kc-dev-gen" target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>GitHub</a>
          <span style={{ color: "var(--text-muted)" }}>/</span>
          <span>v0.5.0</span>
        </p>
      </footer>
    </div>
  );
}
