// 装備のアイコン種別(Equipment.iconType)ごとのボタン配色。
// TYPE_COLORS に無い iconType は DEFAULT_COLOR にフォールバックする
export type ColorDef = { bg: string; border: string; text: string; selectedBg: string; selectedBorder: string; selectedText: string };

// 選択時は枠色を背景に、文字色を枠線にした反転配色（白文字）にする
const color = (bg: string, border: string, text: string): ColorDef =>
  ({ bg, border, text, selectedBg: border, selectedBorder: text, selectedText: "#fff" });

export const TYPE_COLORS: Record<number, ColorDef> = {
  1:  color("#fdecea", "#e89090", "#a33028"), // 小口径主砲
  2:  color("#fdecea", "#d87070", "#8b2020"), // 中口径主砲
  3:  color("#fde0de", "#c85050", "#7a1818"), // 大口径主砲
  4:  color("#fdfad0", "#e8d020", "#807000"), // 副砲
  5:  color("#e2e9f4", "#5c85b5", "#1f3a55"), // 魚雷
  6:  color("#e6f7e6", "#6cc060", "#1f7a20"), // 艦上戦闘機
  7:  color("#fce8e6", "#e06858", "#a02818"), // 艦上爆撃機
  8:  color("#e6eefc", "#6f98e0", "#1f4890"), // 艦上攻撃機
  9:  color("#fdf8d8", "#e8d040", "#807010"), // 艦上偵察機
  10: color("#e6f5e0", "#6cb050", "#2f6018"), // 水上機(水偵・水爆・観測機)
  11: color("#fdefd6", "#e2a838", "#7a5008"), // 電探
  12: color("#fbdcd6", "#d85838", "#8a2810"), // 三式弾
  13: color("#f7f6f2", "#b0ac9c", "#4a4740"), // 徹甲弾
  15: color("#e8f5e0", "#78b850", "#3a7018"), // 機銃
  16: color("#e8f5e8", "#60c060", "#206020"), // 高角砲
  17: color("#dceef8", "#4898c8", "#185880"), // 爆雷
  18: color("#e0f0f8", "#60aad0", "#1a6890"), // ソナー
  19: color("#fdf8d0", "#e8d030", "#807008"), // 機関部強化(缶)
  20: color("#f0e6d8", "#a87850", "#5a3818"), // 上陸用舟艇
  21: color("#e0f5e0", "#4caa48", "#1f6a1a"), // オートジャイロ(カ号観測機等)
  22: color("#e0f4fa", "#5cb8d8", "#1a6888"), // 連絡機
  23: color("#f0e6f5", "#b088c8", "#603878"), // バルジ
  24: color("#fde8d8", "#e88840", "#a04808"), // 探照灯
  25: color("#e8e8e8", "#a0a0a0", "#505050"), // ドラム缶(輸送用)
  30: color("#e2ead0", "#748038", "#384610"), // 高射装置
  37: color("#e2f0dc", "#5a9548", "#2a5818"), // 陸上攻撃機
  38: color("#dcf0d8", "#4c9c48", "#1f5c18"), // 局地戦闘機
  42: color("#e2eef8", "#78a8d8", "#2a5888"), // 潜水艦搭載電探
  44: color("#e6f5e0", "#6cb050", "#2f6018"), // 陸上戦闘機(三式戦等)
  47: color("#e8e4f8", "#7060b0", "#382080"), // 対潜哨戒機
  49: color("#e4e0f8", "#6050a8", "#301870"), // 大型陸上機
  50: color("#e9e0ee", "#846092", "#3e2a50"), // 水上偵察機(夜偵)
  54: color("#e6e8ea", "#8a95a0", "#404850"), // 発煙装置(煙幕)
};

export const DEFAULT_COLOR: ColorDef = color("#f2f3f4", "#aab0b8", "#4a5568");
