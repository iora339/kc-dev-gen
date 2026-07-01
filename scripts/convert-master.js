import { readFileSync, writeFileSync } from "fs";

const src = process.argv[2];
if (!src) {
  console.error("Usage: node scripts/convert-equipment.js <path/to/start2.json>");
  process.exit(1);
}

const raw = JSON.parse(readFileSync(src, "utf-8"));
const items = raw.api_mst_slotitem;

const equipment = items
  .filter((item) => item.api_id < 1501)
  .map((item) => ({
    id: item.api_id,
    name: item.api_name,
    rarity: item.api_rare,
    type: item.api_type[2],
    iconType: item.api_type[3],
    req: {
      fuel: item.api_broken[0],
      ammo: item.api_broken[1],
      steel: item.api_broken[2],
      bauxite: item.api_broken[3],
    },
  }));

writeFileSync("public/equipment.json", JSON.stringify(equipment, null, 2), "utf-8");
console.log(`完了: ${equipment.length}件の装備データを public/equipment.json に出力しました`);

const equipmentTypes = raw.api_mst_slotitem_equiptype.map((t) => ({
  id: t.api_id,
  name: t.api_name,
}));

writeFileSync("public/equipment-type.json", JSON.stringify(equipmentTypes, null, 2), "utf-8");
console.log(`完了: ${equipmentTypes.length}件の種別データを public/equipment-type.json に出力しました`);

const STYPE_CODE = {
  1: "DE", 2: "DD", 3: "CL", 4: "CLT", 5: "CA", 6: "CAV",
  7: "CVL", 8: "FBB", 9: "BB", 10: "BBV", 11: "CV", 12: "XBB",
  13: "SS", 14: "SSV", 15: "AO", 16: "AV", 17: "LHA", 18: "CVB",
  19: "AR", 20: "AS", 21: "CT", 22: "AP",
};

const shipTypes = raw.api_mst_stype.map((s) => ({
  id: s.api_id,
  name: s.api_name,
  code: STYPE_CODE[s.api_id] ?? "",
}));

writeFileSync("public/ship-type.json", JSON.stringify(shipTypes, null, 2), "utf-8");
console.log(`完了: ${shipTypes.length}件の艦種データを public/ship-type.json に出力しました`);

const SHIP_NAME_OVERRIDES = {
  645: "宗谷(灯台補給船)",
  650: "宗谷(南極観測船)",
};

const ships = raw.api_mst_ship
  .filter((s) => s.api_id < 1500)
  .map((s) => ({
    id: s.api_id,
    name: SHIP_NAME_OVERRIDES[s.api_id] ?? s.api_name,
    shipType: s.api_stype,
    afterId: Number(s.api_aftershipid) || null,
  }));

writeFileSync("public/ships.json", JSON.stringify(ships, null, 2), "utf-8");
console.log(`完了: ${ships.length}件の艦娘データを public/ships.json に出力しました`);
