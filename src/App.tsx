import { useState, useMemo } from "react";
import { useData } from "./useData";
import { calcOptimal, isCombinable, groupOverridesByKey } from "./calc";
import type { Candidate, Equipment, Ship } from "./types";
import { EquipmentSelector } from "./components/EquipmentSelector";
import { TYPE_COLORS, DEFAULT_COLOR } from "./components/typeColors";
import { ResultCard, type CostSortKey } from "./components/ResultCard";

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
  const [costSortKey, setCostSortKey] = useState<CostSortKey | null>(null);

  const equipmentById = useMemo(
    () => new Map<number, Equipment>(data?.equipment.map((e) => [e.id, e])),
    [data]
  );
  const shipById = useMemo(
    () => new Map<number, Ship>(data?.ships.map((s) => [s.id, s])),
    [data]
  );
  const overridesByKey = useMemo(
    () => groupOverridesByKey(data?.overrides ?? []),
    [data]
  );

  const calcResult = useMemo(() => {
    if (!data || selectedIds.length === 0) return null;
    return calcOptimal(selectedIds, hqLevel, equipmentById, shipById, overridesByKey, data.devTableData);
  }, [selectedIds, hqLevel, data, equipmentById, shipById, overridesByKey]);

  const candidates: Candidate[] | null = calcResult && !("error" in calcResult) ? calcResult.candidates : null;
  const calcError = calcResult && "error" in calcResult ? calcResult.error : null;

  const minCosts = useMemo(() => {
    if (!candidates || candidates.length === 0) return null;
    const keys = ["fuel", "ammo", "steel", "bauxite", "devmat"] as const;
    const result = {} as Record<CostSortKey, number>;
    for (const key of keys) {
      result[key] = Math.min(...candidates.map((c) => c.result.expectedCost[key]));
    }
    return result;
  }, [candidates]);

  const developableIds = useMemo(() => {
    if (!data) return new Set<number>();
    const ids = new Set<number>();
    for (const [id, tableVals] of Object.entries(data.devTableData)) {
      if (Object.values(tableVals).some((v) => v > 0)) ids.add(Number(id));
    }
    for (const ov of data.overrides) {
      if (ov.to.id !== null) ids.add(ov.to.id);
    }
    return ids;
  }, [data]);

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

  const selectedEquip = selectedIds.map((id) => equipmentById.get(id)!).filter(Boolean);

  const displayedCandidates = costSortKey && candidates
    ? [...candidates].sort((a, b) => a.result.expectedCost[costSortKey] - b.result.expectedCost[costSortKey])
    : candidates;

  return (
    <div style={{ padding: "2rem", fontFamily: "var(--font-sans)", maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 1.5rem" }}>開発レシピジェネレータ</h1>
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
                onChange={(e) => setHqLevel(Number(e.target.value))}
                style={{ width: 90, fontSize: 15 }}
              />
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
                    key={`${selectedIds.join(",")}-${i}`}
                    candidate={c}
                    targets={selectedEquip}
                    ships={data.ships}
                    shipTypes={data.shipTypes}
                    equipment={data.equipment}
                    hqLevel={hqLevel}
                    sortKey={costSortKey}
                    onSortChange={(key) => setCostSortKey((prev) => (prev === key ? null : key))}
                    minCosts={minCosts}
                  />
                ))
              )}
            </>
          )}
        </div>
      </div>
      <footer style={{ marginTop: "2rem", fontSize: 12, color: "var(--text-muted)" }}>
        開発確率参考：<a href="https://bbs.nga.cn/read.php?tid=34725123" target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>https://bbs.nga.cn/read.php?tid=34725123</a>
      </footer>
    </div>
  );
}
