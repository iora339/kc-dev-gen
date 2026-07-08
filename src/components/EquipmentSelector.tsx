import { useMemo, useState, type CSSProperties } from "react";
import type { Equipment } from "../types";
import { TYPE_COLORS, DEFAULT_COLOR } from "./typeColors";
import { useIsSingleColumn } from "../hooks/useIsSingleColumn";

interface Props {
  equipment: Equipment[];
  developableIds: Set<number>;
  selectedIds: number[];
  disabledIds: Set<number>;
  categories: { label: string; typeIds: number[] }[];
  onToggle: (id: number) => void;
}

export function EquipmentSelector({ equipment, developableIds, selectedIds, disabledIds, categories, onToggle }: Props) {
  const [activeCats, setActiveCats] = useState<Set<string>>(new Set());
  // 「選択可能のみ」: 同時開発不可（disabledIds）の装備を一覧から非表示にする絞り込み。カテゴリ絞り込みと併用可能
  const [onlySelectable, setOnlySelectable] = useState(false);
  const isSingleColumn = useIsSingleColumn();

  function toggleCat(label: string) {
    setActiveCats((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  // activeCats が空 = 絞り込みなし（「全て」状態）として全カテゴリを表示する
  const allActive = activeCats.size === 0;

  const categorized = useMemo(() => {
    const developable = equipment.filter((e) => developableIds.has(e.id));
    // typeIds が空のカテゴリは「その他」: どのカテゴリにも属さない装備の受け皿
    const knownTypeIds = new Set(categories.flatMap((c) => c.typeIds));
    return categories
      .map((cat) => {
        const matches = cat.typeIds.length === 0
          ? (e: Equipment) => !knownTypeIds.has(e.type)
          : (e: Equipment) => cat.typeIds.includes(e.type);
        return { ...cat, items: developable.filter(matches).sort((a, b) => a.type - b.type || a.id - b.id) };
      })
      .filter((c) => c.items.length > 0);
  }, [equipment, developableIds, categories]);

  const filteredByCategory = allActive ? categorized : categorized.filter((c) => activeCats.has(c.label));
  // disabledIds には選択中の装備は含まれない（App.tsx側で除外済み）ため、
  // 単純に除くだけで「選択中 or 選択可能」な装備のみが残る
  const visible = onlySelectable
    ? filteredByCategory
        .map((cat) => ({ ...cat, items: cat.items.filter((e) => !disabledIds.has(e.id)) }))
        .filter((cat) => cat.items.length > 0)
    : filteredByCategory;

  // カテゴリタグは青系(accent)、「選択可能のみ」は区別のため緑系(success)で表示する
  const tabStyle = (active: boolean, variant: "accent" | "success" = "accent"): CSSProperties => {
    const border = variant === "success" ? "var(--border-success-accent)" : "var(--border-accent)";
    const bg = variant === "success" ? "var(--bg-success-accent)" : "var(--bg-accent)";
    const color = variant === "success" ? "var(--text-success)" : "var(--text-accent)";
    return {
      fontSize: 13, padding: "4px 14px", borderRadius: "var(--radius)",
      border: `0.5px solid ${active ? border : "var(--border-strong)"}`,
      background: active ? bg : "transparent",
      color: active ? color : "var(--text-secondary)",
      cursor: "pointer",
    };
  };

  return (
    <div>
      <p style={{ fontSize: 14, color: "var(--text-muted)", margin: "0 0 10px" }}>装備を選択</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        <button onClick={() => setActiveCats(new Set())} style={tabStyle(allActive)}>
          全て
        </button>
        {categorized.map((cat) => (
          <button key={cat.label} onClick={() => toggleCat(cat.label)} style={tabStyle(activeCats.has(cat.label))}>
            {cat.label}
          </button>
        ))}
        <button
          onClick={() => setOnlySelectable((v) => !v)}
          style={{ ...tabStyle(onlySelectable, "success"), marginLeft: "auto" }}
        >
          選択可能のみ
        </button>
      </div>
      <div style={{
        display: "flex", flexDirection: "column", gap: 10,
        height: isSingleColumn ? 400 : "50vh", minHeight: 120, maxHeight: "80vh", overflowY: "auto", resize: "vertical",
        border: "0.5px solid var(--border)", borderRadius: 12, padding: 14,
      }}>
        {visible.map((cat, i) => (
          <div key={cat.label}>
            {i > 0 && <div style={{ borderTop: "0.5px solid var(--border)", margin: "6px 0" }} />}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {cat.items.map((eq) => {
                const selected = selectedIds.includes(eq.id);
                // 選択中の装備は同時開発不可でも disable しない（解除操作を塞がないため）
                const disabled = !selected && disabledIds.has(eq.id);
                const c = TYPE_COLORS[eq.iconType] ?? DEFAULT_COLOR;
                return (
                  <button
                    key={eq.id}
                    disabled={disabled}
                    onClick={() => onToggle(eq.id)}
                    title={disabled ? "選択中の装備と同時には開発できません" : undefined}
                    style={{
                      fontSize: 13, padding: "4px 10px", borderRadius: "var(--radius)",
                      border: `0.5px solid ${disabled ? "var(--border)" : selected ? c.selectedBorder : c.border}`,
                      background: disabled ? "var(--surface-1)" : selected ? c.selectedBg : c.bg,
                      color: disabled ? "var(--text-muted)" : selected ? c.selectedText : c.text,
                      cursor: disabled ? "not-allowed" : "pointer",
                      opacity: disabled ? 0.5 : 1,
                    }}
                  >
                    {eq.name}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
