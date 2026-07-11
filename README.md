# kc-dev-gen

艦これ（艦隊これくしょん）の装備開発に必要な秘書艦種・開発テーブル・投入資源の組み合わせを検索する React SPA です。

目当ての装備を複数選択すると、その装備を同時に開発できる（秘書艦種 × 開発テーブル × 資源量、および艦別の開発率補正を考慮した）候補レシピを、資材期待消費が少ない順に一覧表示します。

## 動作環境

- Node.js（npm 付属のもの）

## 導入手順

```bash
npm install       # 依存関係のインストール（初回のみ）
npm run dev       # Vite dev server（デフォルト http://localhost:5173）
```

### スクリプト

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | Vite dev server の起動 |
| `npm run build` | `tsc -b && vite build`（型チェック + 本番ビルド） |
| `npm run lint` | `eslint .` |
| `npm run preview` | ビルド後のプレビュー |


## データ生成（`data/*.csv` → `public/*.json`）

アプリは `public/*.json` を fetch して動作します。ソースは `data/` 配下の CSV と、艦これログイン時のapi_start2/getDataのレスポンスJSON（リポジトリには含まれません）です。変換は手動でスクリプトを実行します。

| スクリプト | 入力 | 出力 |
| --- | --- | --- |
| `scripts/convert-master.js` | `<path/to/api_start2/getDataのレスポンスJSON>` | `public/equipment.json`, `public/equipment-type.json`, `public/ship-type.json`, `public/ships.json` |
| `scripts/convert-dev-table.js` | `data/dev-table.csv` | `public/dev-table.json` |
| `scripts/convert-overrides.js` | `data/overrides-ship.csv`, `data/overrides-ship-pending.csv`, `data/overrides-resource.csv` | `public/overrides.json`, `public/overrides-pending.json` |

実行例:

```bash
node scripts/convert-master.js <path/to/master.json>
node scripts/convert-dev-table.js
node scripts/convert-overrides.js
```

> [!IMPORTANT]
> `convert-master.js` を最初に実行してください。他のスクリプトが `public/equipment.json` 等を参照するため、実行順を守らないと変換に失敗します。
>
> CSV 変換中に艦名・装備名・艦種名が解決できないと `未マッチ` 警告が出ます。`data/*.csv` の表記ゆれ、または master データ未反映が原因です。

`public/overrides-pending.json` は暫定検証データのみを含み、確定データ（`public/overrides.json`）とは別ファイルです。アプリ上で「暫定データを使用」チェックを入れたときのみ、この2つを結合して計算に使用します。

暫定データが計算結果に影響する装備や艦には、結果カードに ⚠ マークが表示されます。このマークは「確定データのみの場合との計算結果が異なる」ことを示しており、今後の検証によって数値が変更・削除される可能性があります。

## アーキテクチャ

### 計算モデル（`src/calc.ts`）

開発は「秘書艦種（砲戦系 / 水雷系 / 空母系 / 潜水系）× 開発テーブル（鋼燃 / 弾薬 / ボーキ）」の12通りの組み合わせごとに、装備別の基礎開発率（`devTableData`、% の半分の値 = スロット数として保持、満スロット = 50）が決まっています。そこに艦別・資源別の `Override`（特定艦を秘書艦にする、または一定以上の資源を投入すると、ある装備の開発率が別の装備に付け替わる効果）を適用してスロット構成を調整します。

**処理の流れ**（`calcOptimal` / `isCombinable` 共通）:

1. `computeBaseMinReq`: 最低投入量（各10）・選択装備の必要資源・資源条件 override の発動条件の3者 max から最低投入資源を算出
2. `adjustForTable`: その資源を、各テーブルが選ばれる条件を満たすまで最小限引き上げ
3. `buildBaseSlots` → `applyOverrides`: テーブル基礎値に override を適用してスロット数マップを作る
4. `calcResult`: スロット数から対象開発率・開発失敗率・期待消費資材（`devmat` = 資材消費期待値）を算出

**主要な関数**:

- `groupOverridesByKey`: override を `秘書艦種_テーブル` キーで事前グループ化（毎回のフィルタ処理を避けるため）
- `isCombinable`: 選択中装備同士が同時開発可能か軽量判定（`EquipmentSelector` のボタン無効化に使用）
- `calcOptimal`: 12通りの組み合わせ全探索 + 艦別 override 適用結果を計算し、候補（`Candidate`）を生成・重複スロット構成をグループ化・資材消費昇順でソート
- `canDevelop`: 資源と司令部Lv から装備が開発可能か判定（`ResultCard` でも使用）

Override には「艦種丸ごと対象」「艦単体対象」「資源条件のみ対象（`shipIds` 無し）」があり、`shipIds` の有無で判定ロジックが分岐します。

### データ層（`src/useData.ts`, `src/types.ts`）

`useData` フックが起動時に `public/*.json` を並列 fetch します。`Override.shipIds` が空配列の場合は資源条件のみで判定、非空の場合は艦ID一致で判定します（`Ship.afterId` による改造チェーンの展開は CSV → JSON 変換時に `convert-overrides.js` の `resolveShipNames` で解決済み）。

### UI（`src/App.tsx`, `src/components/`）

- `EquipmentSelector`: カテゴリタブ + 装備ボタン一覧。同時開発不可能な組み合わせはボタンを disable（選択中の装備は解除できるよう disable しない）
- `ResultCard`: 1候補（1レシピ）の表示カード。艦名グルーピング（改造チェーンをまとめる、艦種丸ごとなら艦種名に集約）、除外艦ポップアップ、装備別詳細ポップアップを持つ
  - 除外艦の条件: override 適用で結果が悪化する艦、または合計成功率は同じでも選択装備が開発不可になる艦
  - 除外艦グループの「増減する装備」は最頻値方式で代表値を取り、少数の特殊艦に引きずられず一般的な艦の増減を表示
  - 暫定データの影響を受ける装備・艦には ⚠ マークが表示される
- 色分けは装備の `iconType` ごとの配色と、CSS 変数による override 増減の色分けに依存

### 命名・単位の注意

- スロット値は常に「% の半分」（満スロット = 50、100% = 50）。UI 表示時に `×2` して % に変換する箇所があります
- 資源要求 `Equipment.req` は `×10` した値が実際の必要資源量です
- `rarity` は司令部Lv要件計算に使います（`rarity * 10` が必要Lv。司令部Lv40以上で全ての装備が開発可能）
