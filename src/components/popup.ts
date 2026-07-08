import type { CSSProperties } from "react";

// ポップアップ共通スタイル（App の暫定データ説明・ResultCard の各ポップアップで共用）。
// 表示位置やサイズは position で上書きする
export const popupStyle = (position: CSSProperties): CSSProperties => ({
  position: "absolute", background: "var(--surface-2)", border: "0.5px solid var(--border-strong)",
  borderRadius: "var(--radius)", padding: "10px 14px 14px", zIndex: 10, whiteSpace: "nowrap",
  fontSize: 13, boxShadow: "0 2px 8px rgba(0,0,0,0.12)", ...position,
});

export const popupHeadingStyle: CSSProperties = { fontSize: 12, color: "var(--text-muted)", marginBottom: 6 };
