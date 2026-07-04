import { useState, useMemo, useRef, useEffect } from "react";
import { useData } from "./useData";
import { calcOptimal, isCombinable, groupOverridesByKey } from "./calc";
import type { Candidate, Equipment, Ship } from "./types";
import { EquipmentSelector } from "./components/EquipmentSelector";
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
  { label: "艦戦", typeIds: [6] },
  { label: "艦爆", typeIds: [7] },
  { label: "艦攻", typeIds: [8] },
  { label: "艦偵", typeIds: [9, 94] },
  { label: "魚雷", typeIds: [5, 22, 32] },
  { label: "水上機", typeIds: [10, 11, 41, 45] },
  { label: "電探", typeIds: [12, 13, 93] },
  { label: "強化弾", typeIds: [18, 19, 20] },
  { label: "対潜", typeIds: [14, 15, 40] },
  { label: "対潜飛行機", typeIds: [25, 26] },
  { label: "機銃", typeIds: [21] },
  { label: "陸上機", typeIds: [47, 48, 49, 53] },
  { label: "その他", typeIds: [] },
];

export default function App() {
  const { data, error } = useData();
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [hqLevel, setHqLevel] = useState(120);
  const [sortKey, setSortKey] = useState<SortKey>("devmat");
  const [usePendingData, setUsePendingData] = useState(false);
  const [showPendingInfo, setShowPendingInfo] = useState(false);
  const pendingInfoRef = useRef<HTMLSpanElement>(null);

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
  }

  function clearEquip() {
    setSelectedIds([]);
  }

  if (error) return <div style={{ padding: "2rem", color: "var(--text-danger)" }}>{error}</div>;
  if (!data) return <div style={{ padding: "2rem", color: "var(--text-muted)" }}>読み込み中...</div>;

  const selectedEquip = selectedIds.flatMap((id) => {
    const eq = equipmentById.get(id);
    return eq ? [eq] : [];
  });

  // 開発率系(対象開発率・開発失敗率)は高いほど望ましいため降順、コスト系は昇順で並べる
  const displayedCandidates = candidates
    ? [...candidates].sort((a, b) =>
        sortKey === "successRate" ? b.result.successRate - a.result.successRate
        : sortKey === "failRate" ? b.result.failRate - a.result.failRate
        : a.result.expectedCost[sortKey] - b.result.expectedCost[sortKey])
    : candidates;

  return (
    <div style={{ padding: "2rem", fontFamily: "var(--font-sans)", maxWidth: 1100, margin: "0 auto", minHeight: "100vh", boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 1.5rem" }}>艦これ　開発レシピ検索</h1>
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
            <p style={{ fontSize: 14, color: "var(--text-muted)", margin: "0 0 8px", display: "flex", alignItems: "center", gap: 10 }}>
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
                  onClick={() => setShowPendingInfo((v) => !v)}
                  style={{ fontSize: 14, color: "var(--text-secondary)", cursor: "pointer", textDecoration: "underline dotted" }}
                >
                  暫定データを使用
                </span>
                {showPendingInfo && (
                  <div style={popupStyle({ top: "calc(100% + 4px)", left: "50%", transform: "translateX(-50%)", width: 380, lineHeight: 1.7, color: "var(--text-primary)", whiteSpace: "normal" })}>
                    まだ検証データが不足している状況ですが、<a href="https://github.com/poooi/poi-server/wiki" target="_blank" rel="noopener noreferrer" style={{ color: "var(--text-accent)" }}>poi data dumps</a>のデータ（2026-7-2時点）を元に暫定の開発率情報を作成しました。チェックすると以下が計算に含まれるようになります。今後の検証によって、数値が変更・削除される可能性が大いにありますのでご注意ください。
                    <table style={{ borderCollapse: "collapse", marginTop: 8, width: "100%", fontSize: 12, lineHeight: 1.5, tableLayout: "fixed" }}>
                      <thead>
                        <tr>
                          {([["秘書艦", 96], ["テーブル", 48], ["装備", undefined], ["増減", 40]] as const).map(([h, w]) => (
                            <th key={h} style={{ width: w, textAlign: "left", color: "var(--text-muted)", fontWeight: 400, padding: "2px 6px", borderBottom: "0.5px solid var(--border-strong)" }}>{h}</th>
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
        <p style={{ margin: "0 0 4px" }}>確率参考サイト：<a href="https://bbs.nga.cn/read.php?tid=34725123" target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>https://bbs.nga.cn/read.php?tid=34725123</a></p>
        <p style={{ margin: 0, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8 }}>
          <a href="https://github.com/iora339/kc-dev-gen" target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>GitHub</a>
          <span style={{ color: "var(--text-muted)" }}>/</span>
          <span>v0.1.1</span>
        </p>
      </footer>
    </div>
  );
}
