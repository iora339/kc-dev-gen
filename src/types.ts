// 秘書艦種と、投入資源で決まる開発テーブル。
// この 4×3=12 通りの組み合わせごとに装備別の基礎開発率が決まる
export const SECRETARY_TYPES = ["砲戦系", "水雷系", "空母系", "潜水系"] as const;
export const TABLES = ["鋼燃", "弾薬", "ボーキ"] as const;

export type SecretaryType = (typeof SECRETARY_TYPES)[number];
export type TableType = (typeof TABLES)[number];

// 資源量（燃料・弾薬・鋼材・ボーキサイト）。文脈により「投入資源」「最低必要量」の両方で使う
export interface Resources {
  fuel: number;
  ammo: number;
  steel: number;
  bauxite: number;
}

export interface Equipment {
  id: number;
  name: string;
  // 装備カテゴリID（EquipmentSelectorのタブ分類に使用）
  type: number;
  // アイコン種別ID（typeColors.tsの配色キー）
  iconType: number;
  // レア度ではなく司令部Lv要件の元値（rarity×10 が開発に必要な司令部Lv）
  rarity: number;
  // 開発の最低投入資源。×10した値が実際の必要資源量
  req: Resources;
}

export interface Ship {
  id: number;
  name: string;
  shipType: number;
  // 改造後の艦ID（最終改造形態なら null）。改造チェーンのグルーピング表示や、
  // 改造前艦を候補の代表ラベルに優先する判定に使う
  afterId: number | null;
  // ゲーム内図鑑順(api_sortno)のソートキー。艦一覧の表示順を決定的にするために使う
  sortId: number;
}

export interface ShipType {
  id: number;
  name: string;
  code: string;
}

// 開発率の付け替え補正。「特定艦を秘書艦にする」または「一定以上の資源を投入する」と、
// from装備の開発率(スロット)の一部がto装備に移る
export interface Override {
  id: number;
  // 対象艦ID一覧（改造チェーンはCSV→JSON変換時に展開済み）。
  // 空配列なら艦を問わず minResources の資源条件のみで判定する
  shipIds: number[];
  secretary: SecretaryType;
  table: TableType;
  // 付け替え先。id が null の場合は変換時に装備名が未解決（未マッチ）だったもので、計算では無視される
  to: { id: number | null; slots: number };
  // 付け替え元（複数装備から少しずつ移ることがある）
  from: { id: number; slots: number }[];
  // shipIds が空の場合の発動条件（この資源量以上の投入で発動）
  minResources: Resources;
  // true なら暫定検証データ（overrides-pending.json 由来、UIのチェックボックスで有効化）
  provisional?: boolean;
}

// 装備ID → { "秘書艦種_テーブル" キー → 基礎開発率(%) }。
// buildBaseSlots で ÷2 されてスロット数に変換される
export type DevTableData = Record<number, Record<string, number>>;

// 装備ID → スロット数。スロット数は「%の半分」（満スロット合計=50=100%）
export interface SlotMap {
  [equipId: number]: number;
}

// 1つの「秘書艦種×テーブル×資源量」構成に対する計算結果
export interface CalcResult {
  // 選択装備の合計スロット数（対象開発率 = successSlots/50）
  successSlots: number;
  // 対象開発率（0〜1）
  successRate: number;
  // 資源不足・司令部Lv不足で開発失敗になる装備の合計スロット数
  failSlots: number;
  // 開発失敗率（0〜1）。失敗時は資材を消費しないため、高いほど期待資材消費は減る
  failRate: number;
  // 対象装備の開発成功1回あたりの期待消費資源。devmat は開発資材の期待消費数
  expectedCost: Resources & { devmat: number };
  slotMap: SlotMap;
}

// 候補レシピ1件（ResultCard 1枚に対応）
export interface Candidate {
  // 表示ラベル。艦別overrideなしなら秘書艦種名、ありなら代表艦名
  label: string;
  // このレシピが有効な秘書艦のID一覧（空ならその秘書艦種の任意の艦でよい）
  shipIds: number[];
  // overrideの適用でむしろ結果が悪化するため秘書艦から除外すべき艦のID一覧
  excludedShipIds: number[];
  table: TableType;
  // 投入資源量
  resources: Resources;
  result: CalcResult;
  // この艦専用のoverride適用前（他の艦にも共通するoverrideは適用済み）のslotMap。詳細表示での増減差分表示に使う
  baseSlotMap: SlotMap;
  // excludedShipIds各艦のoverride適用後slotMap。除外艦ポップアップでの増減差分表示に使う
  excludedShipSlotMaps: Record<number, SlotMap>;
}
