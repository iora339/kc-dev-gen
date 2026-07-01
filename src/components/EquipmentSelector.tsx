import { useState } from "react";
import type { Equipment } from "../types";
import { TYPE_COLORS, DEFAULT_COLOR } from "./typeColors";

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

  function toggleCat(label: string) {
    setActiveCats((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  const allActive = activeCats.size === 0;

  const developable = equipment.filter((e) => developableIds.has(e.id));

  const categorized = categories.map((cat) => {
    if (cat.typeIds.length === 0) {
      const otherTypeIds = new Set(categories.flatMap((c) => c.typeIds));
      return { ...cat, items: developable.filter((e) => !otherTypeIds.has(e.type)).sort((a, b) => a.type - b.type || a.id - b.id) };
    }
    return { ...cat, items: developable.filter((e) => cat.typeIds.includes(e.type)).sort((a, b) => a.type - b.type || a.id - b.id) };
  }).filter((c) => c.items.length > 0);

  const visible = allActive ? categorized : categorized.filter((c) => activeCats.has(c.label));

  return (
    <div>
      <p style={{ fontSize: 14, color: "var(--text-muted)", margin: "0 0 10px" }}>装備を選択</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        <button
          onClick={() => setActiveCats(new Set())}
          style={{
            fontSize: 13, padding: "4px 14px", borderRadius: "var(--radius)",
            border: `0.5px solid ${allActive ? "var(--border-accent)" : "var(--border-strong)"}`,
            background: allActive ? "var(--bg-accent)" : "transparent",
            color: allActive ? "var(--text-accent)" : "var(--text-secondary)",
            cursor: "pointer",
          }}
        >
          全て
        </button>
        {categorized.map((cat) => (
          <button
            key={cat.label}
            onClick={() => toggleCat(cat.label)}
            style={{
              fontSize: 13, padding: "4px 14px", borderRadius: "var(--radius)",
              border: `0.5px solid ${activeCats.has(cat.label) ? "var(--border-accent)" : "var(--border-strong)"}`,
              background: activeCats.has(cat.label) ? "var(--bg-accent)" : "transparent",
              color: activeCats.has(cat.label) ? "var(--text-accent)" : "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            {cat.label}
          </button>
        ))}
      </div>
      <div style={{
        display: "flex", flexDirection: "column", gap: 10,
        height: 400, minHeight: 120, maxHeight: "80vh", overflowY: "auto", resize: "vertical",
        border: "0.5px solid var(--border)", borderRadius: 12, padding: 14,
      }}>
        {visible.map((cat, i) => (
          <div key={cat.label}>
            {i > 0 && <div style={{ borderTop: "0.5px solid var(--border)", margin: "6px 0" }} />}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {cat.items.map((eq) => {
                const selected = selectedIds.includes(eq.id);
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
