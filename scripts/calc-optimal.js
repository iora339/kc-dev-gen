import { readFileSync } from "fs";

const equipment = JSON.parse(readFileSync("data/equipment.json", "utf-8"));
const devTable = JSON.parse(readFileSync("data/dev-table.json", "utf-8"));

// dev-table.jsonをpoolRows形式に変換
const poolRows = equipment
  .filter((eq) => devTable[eq.id])
  .map((eq) => ({ name: eq.name, slots: devTable[eq.id] }));

// 秘書艦種と艦種の対応
const SECRETARY_SHIP_TYPES = {
  砲戦系: ["CA", "FBB", "BB", "XBB", "AR"],
  水雷系: ["DE", "DD", "CL", "CLT", "AP", "CT", "AO"],
  空母系: ["CAV", "CVL", "BBV", "CV", "AV", "LHA", "CVB", "AS"],
  潜水系: ["SS", "SSV"],
};

const targetName = process.argv[2];
const hqLevel = Number(process.argv[3] ?? 120);

if (!targetName) {
  console.error("Usage: node scripts/calc-optimal.js <装備名> [司令部レベル]");
  process.exit(1);
}

const targetEq = equipment.find((e) => e.name === targetName);
if (!targetEq) {
  console.error(`装備が見つかりません: ${targetName}`);
  process.exit(1);
}

const targetRow = poolRows.find((r) => r.name === targetName);
if (!targetRow) {
  console.error(`dev-table.csvに装備が見つかりません: ${targetName}`);
  process.exit(1);
}

// レベルチェック
const requiredLevel = targetEq.rarity * 10;
if (hqLevel < requiredLevel) {
  console.error(`司令部レベル不足: 必要${requiredLevel} / 現在${hqLevel}`);
  process.exit(1);
}

// req×10が最低限必要な資源（最低値は10）
const minReq = {
  fuel: Math.max(targetEq.req.fuel * 10, 10),
  ammo: Math.max(targetEq.req.ammo * 10, 10),
  steel: Math.max(targetEq.req.steel * 10, 10),
  bauxite: Math.max(targetEq.req.bauxite * 10, 10),
};

console.log(`\n対象装備: ${targetName}`);
console.log(`必要資材×10: 燃${minReq.fuel} 弾${minReq.ammo} 鋼${minReq.steel} ボ${minReq.bauxite}`);
console.log(`レアリティ: ${targetEq.rarity} (必要司令部Lv: ${requiredLevel})\n`);

const results = [];

for (const [devTable, slotCount2x] of Object.entries(targetRow.slots)) {
  if (slotCount2x === 0) continue;

  const slotCount = slotCount2x / 2; // 50スロット換算

  // devTableは "砲戦系_鋼燃" などの形式
  const table = devTable.split("_")[1]; // 鋼燃/弾薬/ボーキ
  const secretaryType = devTable.split("_")[0]; // 砲戦系/水雷系/空母系/潜水系

  // テーブル条件を満たす最小資源（minReq以上かつテーブル条件を満たす）
  let fuel = minReq.fuel;
  let ammo = minReq.ammo;
  let steel = minReq.steel;
  let bauxite = minReq.bauxite;

  if (table === "鋼燃") {
    const maxOther = Math.max(ammo, bauxite);
    if (Math.max(fuel, steel) < maxOther) {
      steel = maxOther;
    }
  } else if (table === "弾薬") {
    const maxOther = Math.max(fuel, steel, bauxite);
    if (ammo <= maxOther) ammo = maxOther + 1;
  } else if (table === "ボーキ") {
    const maxOther = Math.max(fuel, ammo, steel);
    if (bauxite <= maxOther) bauxite = maxOther + 1;
  }

  // 入力資源でreqチェックを通る装備のスロット数合計（成功スロット数）
  const successSlots = poolRows.reduce((sum, row) => {
    const eq = equipment.find((e) => e.name === row.name);
    if (!eq) return sum;
    const passes =
      fuel >= eq.req.fuel * 10 &&
      ammo >= eq.req.ammo * 10 &&
      steel >= eq.req.steel * 10 &&
      bauxite >= eq.req.bauxite * 10 &&
      hqLevel >= eq.rarity * 10;
    return sum + (passes ? row.slots[devTable] / 2 : 0);
  }, 0);

  const ratio = successSlots / slotCount;
  const expectedCost = {
    fuel: fuel * ratio,
    ammo: ammo * ratio,
    steel: steel * ratio,
    bauxite: bauxite * ratio,
    devmat: 1 * ratio,
  };

  results.push({ devTable, secretaryType, table, fuel, ammo, steel, bauxite, slotCount, successSlots, expectedCost });
}

if (results.length === 0) {
  console.log("この開発テーブルにはdev-table.csvにデータがありません。");
  process.exit(0);
}

const totalExpected = (r) => r.expectedCost.fuel + r.expectedCost.ammo + r.expectedCost.steel + r.expectedCost.bauxite;
results.sort((a, b) => totalExpected(a) - totalExpected(b));

console.log("=== 最適レシピ候補（期待消費資源の少ない順）===\n");
for (const r of results) {
  const shipTypes = SECRETARY_SHIP_TYPES[r.secretaryType]?.join(", ") ?? "";
  console.log(`【${r.devTable}】秘書艦種: ${shipTypes}`);
  console.log(`  投入資源: 燃${r.fuel} 弾${r.ammo} 鋼${r.steel} ボ${r.bauxite}`);
  console.log(`  スロット: ${r.slotCount}/50 (成功スロット: ${r.successSlots}/50)`);
  console.log(`  期待消費資源: 燃${r.expectedCost.fuel.toFixed(1)} 弾${r.expectedCost.ammo.toFixed(1)} 鋼${r.expectedCost.steel.toFixed(1)} ボ${r.expectedCost.bauxite.toFixed(1)} 開発資材${r.expectedCost.devmat.toFixed(1)}`);
  console.log();
}
