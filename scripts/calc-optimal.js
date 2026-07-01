import { readFileSync } from "fs";

const equipment = JSON.parse(readFileSync("data/equipment.json", "utf-8"));
const devTableData = JSON.parse(readFileSync("data/dev-table.json", "utf-8"));
const overridesData = JSON.parse(readFileSync("data/overrides.json", "utf-8"));
const ships = JSON.parse(readFileSync("data/ships.json", "utf-8"));

const equipmentById = new Map(equipment.map((e) => [e.id, e]));
const shipById = new Map(ships.map((s) => [s.id, s]));

const SECRETARY_TYPES = ["砲戦系", "水雷系", "空母系", "潜水系"];
const TABLES = ["鋼燃", "弾薬", "ボーキ"];

// 引数解析: 末尾が数値なら司令部レベル、残りが装備名
const args = process.argv.slice(2);
const lastArg = args[args.length - 1];
const hqLevel = args.length > 0 && /^\d+$/.test(lastArg) ? Number(args.pop()) : 120;
const targetNames = args;

if (targetNames.length === 0) {
  console.error("Usage: node scripts/calc-optimal.js <装備名1> [装備名2...] [司令部Lv]");
  process.exit(1);
}

// 対象装備を解決
const targets = targetNames.map((name) => {
  const eq = equipment.find((e) => e.name === name);
  if (!eq) { console.error(`装備が見つかりません: ${name}`); process.exit(1); }
  if (hqLevel < eq.rarity * 10) {
    console.error(`司令部レベル不足 (${name}): 必要${eq.rarity * 10} / 現在${hqLevel}`);
    process.exit(1);
  }
  return eq;
});

// 全対象装備のreq×10の最大値
const baseMinReq = {
  fuel: Math.max(...targets.map((e) => Math.max(e.req.fuel * 10, 10))),
  ammo: Math.max(...targets.map((e) => Math.max(e.req.ammo * 10, 10))),
  steel: Math.max(...targets.map((e) => Math.max(e.req.steel * 10, 10))),
  bauxite: Math.max(...targets.map((e) => Math.max(e.req.bauxite * 10, 10))),
};

// テーブル条件に合わせて資源を調整
function adjustForTable(minReq, table) {
  let { fuel, ammo, steel, bauxite } = minReq;
  if (table === "鋼燃") {
    const maxOther = Math.max(ammo, bauxite);
    if (Math.max(fuel, steel) < maxOther) steel = maxOther;
  } else if (table === "弾薬") {
    const maxOther = Math.max(fuel, steel, bauxite);
    if (ammo <= maxOther) ammo = maxOther + 1;
  } else if (table === "ボーキ") {
    const maxOther = Math.max(fuel, ammo, steel);
    if (bauxite <= maxOther) bauxite = maxOther + 1;
  }
  return { fuel, ammo, steel, bauxite };
}

// 指定テーブルのベーススロットマップを構築 { equipId: slots }
function buildBaseSlots(secretaryType, table) {
  const key = `${secretaryType}_${table}`;
  const slotMap = {};
  for (const eq of equipment) {
    const val = devTableData[eq.id]?.[key];
    if (val) slotMap[eq.id] = val / 2;
  }
  return slotMap;
}

// overridesを適用してスロットマップを更新
function applyOverrides(slotMap, secretaryType, table, resources, shipId = null) {
  const slots = { ...slotMap };
  const relevant = overridesData.filter(
    (o) => o.secretary === secretaryType && o.table === table
  );

  for (const o of relevant) {
    if (o.to.id === null) continue;

    let applies = false;
    if (o.shipIds.length > 0) {
      applies = shipId !== null && o.shipIds.includes(shipId);
    } else {
      applies =
        resources.fuel >= o.minResources.fuel &&
        resources.ammo >= o.minResources.ammo &&
        resources.steel >= o.minResources.steel &&
        resources.bauxite >= o.minResources.bauxite;
    }
    if (!applies) continue;

    for (const f of o.from) {
      if (slots[f.id] != null) slots[f.id] = Math.max(0, slots[f.id] - f.slots);
    }
    slots[o.to.id] = (slots[o.to.id] || 0) + o.to.slots;
  }

  return slots;
}

// 全対象装備がスロットに存在しreqを満たすか確認
function allTargetsAvailable(slots, resources) {
  return targets.every(
    (eq) =>
      (slots[eq.id] || 0) > 0 &&
      resources.fuel >= eq.req.fuel * 10 &&
      resources.ammo >= eq.req.ammo * 10 &&
      resources.steel >= eq.req.steel * 10 &&
      resources.bauxite >= eq.req.bauxite * 10
  );
}

// 成功率・開発失敗率・期待消費資源を計算
function calcResult(slots, resources) {
  const successSlots = targets.reduce((sum, eq) => sum + (slots[eq.id] || 0), 0);
  const successRate = successSlots / 50;
  if (successRate === 0) return null;

  // 開発失敗スロット: req×10またはHQレベルを満たさない装備のスロット数
  const failSlots = Object.entries(slots).reduce((sum, [eqId, slotCount]) => {
    const eq = equipmentById.get(Number(eqId));
    if (!eq) return sum;
    const fails =
      resources.fuel < eq.req.fuel * 10 ||
      resources.ammo < eq.req.ammo * 10 ||
      resources.steel < eq.req.steel * 10 ||
      resources.bauxite < eq.req.bauxite * 10 ||
      hqLevel < eq.rarity * 10;
    return sum + (fails ? slotCount : 0);
  }, 0);

  return {
    successSlots,
    successRate,
    failSlots,
    failRate: failSlots / 50,
    expectedCost: {
      fuel: resources.fuel / successRate,
      ammo: resources.ammo / successRate,
      steel: resources.steel / successRate,
      bauxite: resources.bauxite / successRate,
      devmat: (1 - failSlots / 50) / successRate,
    },
  };
}

const candidates = [];

for (const secretaryType of SECRETARY_TYPES) {
  for (const table of TABLES) {
    const resources = adjustForTable(baseMinReq, table);
    const baseSlots = buildBaseSlots(secretaryType, table);

    // ベース候補（艦種のみ、minResources系overrideのみ適用）
    const baseModifiedSlots = applyOverrides(baseSlots, secretaryType, table, resources, null);
    if (allTargetsAvailable(baseModifiedSlots, resources)) {
      const result = calcResult(baseModifiedSlots, resources);
      if (result) candidates.push({ label: secretaryType, table, resources, ...result });
    }

    // 艦固有override候補
    const shipIdsWithOverride = [
      ...new Set(
        overridesData
          .filter((o) => o.secretary === secretaryType && o.table === table && o.shipIds.length > 0)
          .flatMap((o) => o.shipIds)
      ),
    ];

    for (const shipId of shipIdsWithOverride) {
      const ship = shipById.get(shipId);
      if (!ship) continue;

      const modified = applyOverrides(baseSlots, secretaryType, table, resources, shipId);
      if (!allTargetsAvailable(modified, resources)) continue;

      const result = calcResult(modified, resources);
      if (!result) continue;

      // ベースより成功スロット数が変わる場合のみ別候補として追加
      const baseResult = calcResult(baseModifiedSlots, resources);
      if (!baseResult || result.successSlots !== baseResult.successSlots) {
        candidates.push({ label: ship.name, table, resources, ...result });
      }
    }
  }
}

// 開発失敗率が高い順（= 開発資材消費が少ない順）でソート、同率は期待消費資源合計でソート
const totalCost = (c) =>
  c.expectedCost.fuel + c.expectedCost.ammo + c.expectedCost.steel + c.expectedCost.bauxite;
candidates.sort((a, b) => b.failRate - a.failRate || totalCost(a) - totalCost(b));

// 出力
console.log(`\n対象装備: ${targetNames.join(", ")}`);
console.log(`司令部Lv: ${hqLevel}`);
console.log(`必要資材×10: 燃${baseMinReq.fuel} 弾${baseMinReq.ammo} 鋼${baseMinReq.steel} ボ${baseMinReq.bauxite}\n`);

if (candidates.length === 0) {
  console.log("全装備を同時に開発できるテーブルはありません。");
  process.exit(0);
}

const TOP_N = 10;
console.log(`=== 最適レシピ候補 上位${Math.min(TOP_N, candidates.length)}件（期待消費資源の少ない順）===\n`);
for (const c of candidates.slice(0, TOP_N)) {
  console.log(`【${c.label} / ${c.table}テーブル】`);
  console.log(`  投入資源: 燃${c.resources.fuel} 弾${c.resources.ammo} 鋼${c.resources.steel} ボ${c.resources.bauxite}`);
  console.log(`  成功スロット: ${c.successSlots}/50 (成功率: ${(c.successRate * 100).toFixed(1)}% / 開発失敗率: ${(c.failRate * 100).toFixed(1)}%)`);
  console.log(
    `  期待消費資源: 燃${c.expectedCost.fuel.toFixed(1)} 弾${c.expectedCost.ammo.toFixed(1)} 鋼${c.expectedCost.steel.toFixed(1)} ボ${c.expectedCost.bauxite.toFixed(1)} 開発資材${c.expectedCost.devmat.toFixed(1)}`
  );
  console.log();
}
