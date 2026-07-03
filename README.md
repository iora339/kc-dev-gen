# kc-dev-gen

艦これ（艦隊これくしょん）の装備開発に必要な秘書艦種・開発テーブル・投入資源の組み合わせを検索する React SPA です。

目当ての装備を複数選択すると、その装備を同時に開発できる（秘書艦種 × 開発テーブル × 資源量、および艦別の開発率補正を考慮した）候補レシピを、資材期待消費が少ない順に一覧表示します。

## Requirements

- Node.js（npm 付属のもの）

## Getting Started

```bash
npm install       # 依存関係のインストール（初回のみ）
npm run dev       # Vite dev server（デフォルト http://localhost:5173）
```

### Scripts

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | Vite dev server の起動 |
| `npm run build` | `tsc -b && vite build`（型チェック + 本番ビルド） |
| `npm run lint` | `eslint .` |
| `npm run preview` | ビルド後のプレビュー |


## データ生成（`data/*.csv` → `public/*.json`）

アプリは `public/*.json` を fetch して動作します。ソースは `data/` 配下の CSV と、艦これゲームサーバーから取得した master JSON（`api_start2` 相当。ライセンス上の理由からリポジトリには含まれません）です。変換は手動でスクリプトを実行します。

| スクリプト | 入力 | 出力 |
| --- | --- | --- |
| `scripts/convert-master.js` | `<path/to/start2.json>`（`api_start2` 相当） | `public/equipment.json`, `public/equipment-type.json`, `public/ship-type.json`, `public/ships.json` |
| `scripts/convert-dev-table.js` | `data/dev-table.csv` | `public/dev-table.json` |
| `scripts/convert-overrides.js` | `data/overrides-ship.csv`, `data/overrides-ship-pending.csv`, `data/overrides-resource.csv` | `public/overrides.json`, `public/overrides-pending.json` |

実行例:

```bash
node scripts/convert-master.js <path/to/start2.json>
node scripts/convert-dev-table.js
node scripts/convert-overrides.js
```

> [!IMPORTANT]
> `convert-master.js` を最初に実行してください。他のスクリプトが `public/equipment.json` 等を参照するため、実行順を守らないと変換に失敗します。
>
> CSV 変換中に艦名・装備名・艦種名が解決できないと `未マッチ` 警告が出ます。`data/*.csv` の表記ゆれ、または master データ未反映が原因です。

`public/overrides-pending.json` は暫定検証データのみを含み、確定データ（`public/overrides.json`）とは別ファイルです。アプリ上で「暫定データを使用」チェックを入れたときのみ、この2つを結合して計算に使用します。

## Architecture

### 計算モデル（`src/calc.ts`）

開発は「秘書艦種（砲戦系 / 水雷系 / 空母系 / 潜水系）× 開発テーブル（鋼燃 / 弾薬 / ボーキ）」の12通りの組み合わせごとに、装備別の基礎開発率（`devTableData`、% の半分の値 = スロット数として保持、満スロット = 50）が決まっています。そこに艦別・資源別の `Override`（特定艦を秘書艦にする、または一定以上の資源を投入すると、ある装備の開発率が別の装備に付け替わる効果）を適用してスロット構成を調整します。

- `groupOverridesByKey`: override を `秘書艦種_テーブル` キーでグループ化（毎回のフィルタ処理を避けるため）
- `adjustForTable`: 選択装備の必要資源から、各テーブルが選ばれる条件を満たす最小資源量を逆算
- `buildBaseSlots` → `applyOverrides`: テーブル基礎値に override を適用してスロット数マップを作る
- `calcResult`: スロット数から対象開発率・開発失敗率・期待消費資材（`devmat` = 資材消費期待値）を算出
- `isCombinable`: 選択中装備同士が同時開発可能か軽量判定（`EquipmentSelector` のボタン無効化に使用）
- `calcOptimal`: 12通りの組み合わせ全探索 + 艦別 override 適用結果を計算し、候補（`Candidate`）を生成・重複スロット構成をグループ化・資材消費昇順でソート

Override には「艦種丸ごと対象」「艦単体対象」「資源条件のみ対象（`shipIds` 無し）」があり、`shipIds` の有無で判定ロジックが分岐します。

### データ層（`src/useData.ts`, `src/types.ts`）

`useData` フックが起動時に `public/*.json` を並列 fetch します。`Override.shipIds` が空配列の場合は資源条件のみで判定、非空の場合は艦ID一致で判定します（`Ship.afterId` による改造チェーンの展開は CSV → JSON 変換時に `convert-overrides.js` の `resolveShipNames` で解決済み）。

### UI（`src/App.tsx`, `src/components/`）

- `EquipmentSelector`: カテゴリタブ + 装備ボタン一覧。同時開発不可能な組み合わせはボタンを disable
- `ResultCard`: 1候補（1レシピ）の表示カード。艦名グルーピング（改造チェーンをまとめる、艦種丸ごとなら艦種名に集約）、除外艦（override適用でむしろ悪化する艦）ポップアップ、装備別詳細ポップアップを持つ
- 色分けは装備の `iconType` ごとの配色と、CSS変数による override 増減の色分けに依存

### 命名・単位の注意

- スロット値は常に「% の半分」（満スロット = 50、100% = 50）。UI 表示時に `×2` して % に変換する箇所があります
- 資源要求 `Equipment.req` は `×10` した値が実際の必要資源量です
- `rarity` はレア度ではなく司令部Lv要件計算に使います（`rarity * 10` が必要Lv）
