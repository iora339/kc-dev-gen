export type ColorDef = { bg: string; border: string; text: string; selectedBg: string; selectedBorder: string; selectedText: string };

export const TYPE_COLORS: Record<number, ColorDef> = {
  1:  { bg: "#fdecea", border: "#e89090", text: "#a33028", selectedBg: "#e89090", selectedBorder: "#a33028", selectedText: "#fff" }, // 小口径主砲
  2:  { bg: "#fdecea", border: "#d87070", text: "#8b2020", selectedBg: "#d87070", selectedBorder: "#8b2020", selectedText: "#fff" }, // 中口径主砲
  3:  { bg: "#fde0de", border: "#c85050", text: "#7a1818", selectedBg: "#c85050", selectedBorder: "#7a1818", selectedText: "#fff" }, // 大口径主砲
  4:  { bg: "#fdfad0", border: "#e8d020", text: "#807000", selectedBg: "#e8d020", selectedBorder: "#807000", selectedText: "#fff" }, // 副砲
  5:  { bg: "#e2e9f4", border: "#5c85b5", text: "#1f3a55", selectedBg: "#5c85b5", selectedBorder: "#1f3a55", selectedText: "#fff" }, // 魚雷
  6:  { bg: "#e6f7e6", border: "#6cc060", text: "#1f7a20", selectedBg: "#6cc060", selectedBorder: "#1f7a20", selectedText: "#fff" }, // 艦上戦闘機
  7:  { bg: "#fce8e6", border: "#e06858", text: "#a02818", selectedBg: "#e06858", selectedBorder: "#a02818", selectedText: "#fff" }, // 艦上爆撃機
  8:  { bg: "#e6eefc", border: "#6f98e0", text: "#1f4890", selectedBg: "#6f98e0", selectedBorder: "#1f4890", selectedText: "#fff" }, // 艦上攻撃機
  9:  { bg: "#fdf8d8", border: "#e8d040", text: "#807010", selectedBg: "#e8d040", selectedBorder: "#807010", selectedText: "#fff" }, // 艦上偵察機
  10: { bg: "#e6f5e0", border: "#6cb050", text: "#2f6018", selectedBg: "#6cb050", selectedBorder: "#2f6018", selectedText: "#fff" }, // 水上偵察機
  11: { bg: "#fdefd6", border: "#e2a838", text: "#7a5008", selectedBg: "#e2a838", selectedBorder: "#7a5008", selectedText: "#fff" }, // 電探(小型)
  50: { bg: "#e9e0ee", border: "#846092", text: "#3e2a50", selectedBg: "#846092", selectedBorder: "#3e2a50", selectedText: "#fff" }, // 水上偵察機(夜偵)
  15: { bg: "#e8f5e0", border: "#78b850", text: "#3a7018", selectedBg: "#78b850", selectedBorder: "#3a7018", selectedText: "#fff" }, // 機銃
  16: { bg: "#e8f5e8", border: "#60c060", text: "#206020", selectedBg: "#60c060", selectedBorder: "#206020", selectedText: "#fff" }, // 高角砲
  17: { bg: "#dceef8", border: "#4898c8", text: "#185880", selectedBg: "#4898c8", selectedBorder: "#185880", selectedText: "#fff" }, // 爆雷
  12: { bg: "#fbdcd6", border: "#d85838", text: "#8a2810", selectedBg: "#d85838", selectedBorder: "#8a2810", selectedText: "#fff" }, // 三式弾
  13: { bg: "#f7f6f2", border: "#b0ac9c", text: "#4a4740", selectedBg: "#b0ac9c", selectedBorder: "#4a4740", selectedText: "#fff" }, // 徹甲弾
  18: { bg: "#e0f0f8", border: "#60aad0", text: "#1a6890", selectedBg: "#60aad0", selectedBorder: "#1a6890", selectedText: "#fff" }, // ソナー
  19: { bg: "#fdf8d0", border: "#e8d030", text: "#807008", selectedBg: "#e8d030", selectedBorder: "#807008", selectedText: "#fff" }, // 機関部強化(缶)
  20: { bg: "#f0e6d8", border: "#a87850", text: "#5a3818", selectedBg: "#a87850", selectedBorder: "#5a3818", selectedText: "#fff" }, // 上陸用舟艇
  23: { bg: "#f0e6f5", border: "#b088c8", text: "#603878", selectedBg: "#b088c8", selectedBorder: "#603878", selectedText: "#fff" }, // バルジ
  24: { bg: "#fde8d8", border: "#e88840", text: "#a04808", selectedBg: "#e88840", selectedBorder: "#a04808", selectedText: "#fff" }, // 探照灯
  25: { bg: "#e8e8e8", border: "#a0a0a0", text: "#505050", selectedBg: "#a0a0a0", selectedBorder: "#505050", selectedText: "#fff" }, // ドラム缶(輸送用)
  30: { bg: "#e2ead0", border: "#748038", text: "#384610", selectedBg: "#748038", selectedBorder: "#384610", selectedText: "#fff" }, // 高射装置
  54: { bg: "#e6e8ea", border: "#8a95a0", text: "#404850", selectedBg: "#8a95a0", selectedBorder: "#404850", selectedText: "#fff" }, // 発煙装置(煙幕)
  21: { bg: "#e0f5e0", border: "#4caa48", text: "#1f6a1a", selectedBg: "#4caa48", selectedBorder: "#1f6a1a", selectedText: "#fff" }, // カ号観測機
  22: { bg: "#e0f4fa", border: "#5cb8d8", text: "#1a6888", selectedBg: "#5cb8d8", selectedBorder: "#1a6888", selectedText: "#fff" }, // 連絡機
  37: { bg: "#e2f0dc", border: "#5a9548", text: "#2a5818", selectedBg: "#5a9548", selectedBorder: "#2a5818", selectedText: "#fff" }, // 陸上攻撃機
  38: { bg: "#dcf0d8", border: "#4c9c48", text: "#1f5c18", selectedBg: "#4c9c48", selectedBorder: "#1f5c18", selectedText: "#fff" }, // 局地戦闘機
  42: { bg: "#e2eef8", border: "#78a8d8", text: "#2a5888", selectedBg: "#78a8d8", selectedBorder: "#2a5888", selectedText: "#fff" }, // 潜水艦搭載電探
  44: { bg: "#e6f5e0", border: "#6cb050", text: "#2f6018", selectedBg: "#6cb050", selectedBorder: "#2f6018", selectedText: "#fff" }, // 陸上戦闘機(三式戦等)
  47: { bg: "#e8e4f8", border: "#7060b0", text: "#382080", selectedBg: "#7060b0", selectedBorder: "#382080", selectedText: "#fff" }, // 対潜哨戒機
  49: { bg: "#e4e0f8", border: "#6050a8", text: "#301870", selectedBg: "#6050a8", selectedBorder: "#301870", selectedText: "#fff" }, // 大型陸上機
};

export const DEFAULT_COLOR: ColorDef = { bg: "#f2f3f4", border: "#aab0b8", text: "#4a5568", selectedBg: "#aab0b8", selectedBorder: "#4a5568", selectedText: "#fff" };
