// 装備のアイコン種別(Equipment.iconType)ごとのボタン配色。
// TYPE_COLORS に無い iconType は DEFAULT_COLOR にフォールバックする
export type ColorDef = { bg: string; border: string; text: string; selectedBg: string; selectedBorder: string; selectedText: string };

// 各種別は「識別色(anchor)」1色で定義し、背景・枠・文字は surface / text-primary との
// color-mix で導出する。CSS 変数がテーマで切り替わると混色結果も追従するため、
// ライト=淡色チップ / ダーク=暗色チップ に自動対応する（テーマ分岐のコードは持たない）。
// 混色は一貫して oklch で行う（sRGB だと白/濃色へ混ぜる途中でグレーを通り色が濁るため、
// 知覚均一な oklch で彩度を保った澄んだ色にする）。
const color = (anchor: string): ColorDef => {
  // anchor の彩度(chroma)を 1.3 倍に増幅した鮮やか版。元の色が鈍いと混色しても灰色がかる（くすむ）ため、
  // 相対色構文で chroma を上げてから使う（sRGB 外は自動でガマットにクランプされ最大彩度になる）。
  const vivid = `oklch(from ${anchor} l calc(c * 1.3) h)`;
  // 選択時のベタ塗り。明度に上限(0.55)を設け、黄など明るい identity 色でも白文字が
  // 全色相で AA(4.5:1) 以上になるようにする。
  const selectedBg = `oklch(from ${anchor} min(l, 0.55) calc(c * 1.3) h)`;
  return {
    bg: `color-mix(in oklch, ${vivid} 13%, var(--surface-2))`,
    // 枠は半透明の --border ではなく不透明サーフェスと混ぜ、発色をはっきりさせる
    border: `color-mix(in oklch, ${vivid} 88%, var(--surface-2))`,
    // vivid 比を下げるほど --text-primary 寄り＝ライトでは濃く/ダークでは明るくなり、両テーマで輪郭が締まる
    text: `color-mix(in oklch, ${vivid} 31%, var(--text-primary))`,
    selectedBg,
    selectedBorder: `color-mix(in oklch, ${selectedBg} 72%, #000)`,
    selectedText: "#fff",
  };
};

export const TYPE_COLORS: Record<number, ColorDef> = {
  1:  color("#e07668"), // 小口径主砲
  2:  color("#d05a5a"), // 中口径主砲
  3:  color("#c04848"), // 大口径主砲
  4:  color("#e0d41e"), // 副砲
  5:  color("#5c85b5"), // 魚雷
  6:  color("#5aac52"), // 艦上戦闘機
  7:  color("#e06858"), // 艦上爆撃機
  8:  color("#6f98e0"), // 艦上攻撃機
  9:  color("#d4b830"), // 艦上偵察機
  10: color("#68a848"), // 水上機(水偵・水爆・観測機)
  11: color("#e2a838"), // 電探
  12: color("#d85838"), // 三式弾
  13: color("#bcbcbc"), // 徹甲弾
  15: color("#78b850"), // 機銃
  16: color("#54b054"), // 高角砲
  17: color("#4898c8"), // 爆雷
  18: color("#60aad0"), // ソナー
  19: color("#d8c030"), // 機関部強化(缶)
  20: color("#a87850"), // 上陸用舟艇
  21: color("#4caa48"), // オートジャイロ(カ号観測機等)
  22: color("#5cb8d8"), // 連絡機
  23: color("#b088c8"), // バルジ
  24: color("#e88840"), // 探照灯
  25: color("#9a9a9a"), // ドラム缶(輸送用)
  30: color("#8a9648"), // 高射装置
  37: color("#5a9548"), // 陸上攻撃機
  38: color("#4c9c48"), // 局地戦闘機
  42: color("#78a8d8"), // 潜水艦搭載電探
  44: color("#6cb050"), // 陸上戦闘機(三式戦等)
  47: color("#7868b8"), // 対潜哨戒機
  49: color("#6050a8"), // 大型陸上機
  50: color("#8c4bb0"), // 水上偵察機(夜偵)
  54: color("#8a95a0"), // 発煙装置(煙幕)
};

export const DEFAULT_COLOR: ColorDef = color("#8892a0");
