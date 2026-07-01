import { useState } from "react";
import type { Equipment } from "../types";

type ColorDef = { bg: string; border: string; text: string; selectedBg: string; selectedBorder: string; selectedText: string };

const TYPE_COLORS: Record<number, ColorDef> = {
  1:  { bg: "#fdecea", border: "#e89090", text: "#a33028", selectedBg: "#e89090", selectedBorder: "#a33028", selectedText: "#fff" }, // 小口径主砲
  2:  { bg: "#fdecea", border: "#d87070", text: "#8b2020", selectedBg: "#d87070", selectedBorder: "#8b2020", selectedText: "#fff" }, // 中口径主砲
  3:  { bg: "#fde0de", border: "#c85050", text: "#7a1818", selectedBg: "#c85050", selectedBorder: "#7a1818", selectedText: "#fff" }, // 大口径主砲
  4:  { bg: "#fdf8e0", border: "#e0c840", text: "#807010", selectedBg: "#e0c840", selectedBorder: "#807010", selectedText: "#fff" }, // 副砲
  5:  { bg: "#e0f5f0", border: "#55b8a0", text: "#18806a", selectedBg: "#55b8a0", selectedBorder: "#18806a", selectedText: "#fff" }, // 魚雷
  6:  { bg: "#e8f0fc", border: "#7aa8e8", text: "#2255aa", selectedBg: "#7aa8e8", selectedBorder: "#2255aa", selectedText: "#fff" }, // 艦上戦闘機
  7:  { bg: "#fdf3e3", border: "#e8b060", text: "#a06818", selectedBg: "#e8b060", selectedBorder: "#a06818", selectedText: "#fff" }, // 艦上爆撃機
  8:  { bg: "#fde8e0", border: "#e87850", text: "#a03818", selectedBg: "#e87850", selectedBorder: "#a03818", selectedText: "#fff" }, // 艦上攻撃機
  9:  { bg: "#fdf3e3", border: "#e8c080", text: "#906820", selectedBg: "#e8c080", selectedBorder: "#906820", selectedText: "#fff" }, // 艦上偵察機
  10: { bg: "#e8f4fc", border: "#80c8e8", text: "#1870a0", selectedBg: "#80c8e8", selectedBorder: "#1870a0", selectedText: "#fff" }, // 水上偵察機
  11: { bg: "#e5f5e5", border: "#70bb70", text: "#267a26", selectedBg: "#70bb70", selectedBorder: "#267a26", selectedText: "#fff" }, // 電探(小型)
  15: { bg: "#f5f8e0", border: "#a8c840", text: "#607010", selectedBg: "#a8c840", selectedBorder: "#607010", selectedText: "#fff" }, // 機銃
  16: { bg: "#e8f5e8", border: "#60c060", text: "#206020", selectedBg: "#60c060", selectedBorder: "#206020", selectedText: "#fff" }, // 高角砲
  17: { bg: "#dceef8", border: "#4898c8", text: "#185880", selectedBg: "#4898c8", selectedBorder: "#185880", selectedText: "#fff" }, // 爆雷
  18: { bg: "#e0f0f8", border: "#60aad0", text: "#1a6890", selectedBg: "#60aad0", selectedBorder: "#1a6890", selectedText: "#fff" }, // ソナー
  37: { bg: "#f0eafa", border: "#9878d0", text: "#5030a0", selectedBg: "#9878d0", selectedBorder: "#5030a0", selectedText: "#fff" }, // 陸上攻撃機
  38: { bg: "#ece8fa", border: "#8068c0", text: "#402890", selectedBg: "#8068c0", selectedBorder: "#402890", selectedText: "#fff" }, // 局地戦闘機
  44: { bg: "#e8eaf8", border: "#7080c8", text: "#304090", selectedBg: "#7080c8", selectedBorder: "#304090", selectedText: "#fff" }, // 陸上戦闘機(三式戦等)
  47: { bg: "#e8e4f8", border: "#7060b0", text: "#382080", selectedBg: "#7060b0", selectedBorder: "#382080", selectedText: "#fff" }, // 対潜哨戒機
  49: { bg: "#e4e0f8", border: "#6050a8", text: "#301870", selectedBg: "#6050a8", selectedBorder: "#301870", selectedText: "#fff" }, // 大型陸上機
};

const DEFAULT_COLOR: ColorDef = { bg: "#f2f3f4", border: "#aab0b8", text: "#4a5568", selectedBg: "#aab0b8", selectedBorder: "#4a5568", selectedText: "#fff" };

interface Props {
  equipment: Equipment[];
  developableIds: Set<number>;
  selectedIds: number[];
  categories: { label: string; typeIds: number[] }[];
  onToggle: (id: number) => void;
}

export function EquipmentSelector({ equipment, developableIds, selectedIds, categories, onToggle }: Props) {
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
            border: "0.5px solid var(--border-strong)",
            background: allActive ? "#2C2C2A" : "transparent",
            color: allActive ? "#F1EFE8" : "var(--text-secondary)",
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
              border: "0.5px solid var(--border-strong)",
              background: activeCats.has(cat.label) ? "#2C2C2A" : "transparent",
              color: activeCats.has(cat.label) ? "#F1EFE8" : "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            {cat.label}
          </button>
        ))}
      </div>
      <div style={{
        display: "flex", flexDirection: "column", gap: 10,
        maxHeight: 260, overflowY: "auto",
        border: "0.5px solid var(--border)", borderRadius: 12, padding: 14,
      }}>
        {visible.map((cat, i) => (
          <div key={cat.label}>
            {i > 0 && <div style={{ borderTop: "0.5px solid var(--border)", margin: "6px 0" }} />}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {cat.items.map((eq) => {
                const selected = selectedIds.includes(eq.id);
                const c = TYPE_COLORS[eq.iconType] ?? DEFAULT_COLOR;
                return (
                  <button
                    key={eq.id}
                    onClick={() => onToggle(eq.id)}
                    style={{
                      fontSize: 13, padding: "4px 10px", borderRadius: "var(--radius)",
                      border: `0.5px solid ${selected ? c.selectedBorder : c.border}`,
                      background: selected ? c.selectedBg : c.bg,
                      color: selected ? c.selectedText : c.text,
                      cursor: "pointer",
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
