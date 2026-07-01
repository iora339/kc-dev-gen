import { readFileSync, writeFileSync } from "fs";

const ships = JSON.parse(readFileSync("public/ships.json", "utf-8"));
const shipTypes = JSON.parse(readFileSync("public/ship-type.json", "utf-8"));
const equipment = JSON.parse(readFileSync("public/equipment.json", "utf-8"));

// 艦名→IDの解決（「」付きは改造後も含む）
function resolveShipNames(token) {
  const recursive = token.startsWith("「") && token.endsWith("」");
  const name = recursive ? token.slice(1, -1) : token;
  const ship = ships.find((s) => s.name === name);
  if (!ship) {
    console.warn(`未マッチ艦名: ${name}`);
    return [];
  }
  if (!recursive) return [ship.id];
  const ids = [];
  const visited = new Set();
  let cur = ship;
  while (cur && !visited.has(cur.id)) {
    visited.add(cur.id);
    ids.push(cur.id);
    cur = cur.afterId ? ships.find((s) => s.id === cur.afterId) : null;
  }
  return ids;
}

// 艦名セル→IDリスト
function resolveShipCell(cell) {
  if (!cell) return [];
  return cell.split("|").flatMap((token) => resolveShipNames(token.trim()));
}

// 艦種名→艦IDリスト
function resolveShipTypeCell(cell) {
  if (!cell) return [];
  const ids = [];
  cell.split("|").forEach((name) => {
    const st = shipTypes.find((t) => t.name === name.trim());
    if (!st) { console.warn(`未マッチ艦種: ${name}`); return; }
    ships.filter((s) => s.shipType === st.id).forEach((s) => ids.push(s.id));
  });
  return ids;
}

// 装備名→ID
function resolveEquipName(name) {
  const eq = equipment.find((e) => e.name === name.trim());
  if (!eq) console.warn(`未マッチ装備: ${name}`);
  return eq ? eq.id : null;
}

const raw = readFileSync("data/overrides.csv", "utf-8");
const lines = raw.split("\n").slice(1).filter((l) => l.trim());

const result = [];
let current = null;

lines.forEach((line) => {
  const cols = line.split(",");
  const [shipCell, shipTypeCell, secretary, table, toName, toPct, fromName, fromPct,
    minFuel, minAmmo, minSteel, minBauxite] = cols;

  const hasTo = toName && toName.trim();

  if (hasTo) {
    // 新しいグループ開始
    const shipIds = resolveShipCell(shipCell?.trim());
    const shipTypeIds = resolveShipTypeCell(shipTypeCell?.trim());
    const toId = resolveEquipName(toName.trim());
    const fromId = resolveEquipName(fromName?.trim());

    current = {
      id: result.length + 1,
      shipIds: [...new Set([...shipIds, ...shipTypeIds])],
      secretary: secretary?.trim() || null,
      table: table?.trim() || null,
      to: { id: toId, slots: Number(toPct) / 2 },
      from: fromId ? [{ id: fromId, slots: Number(fromPct) / 2 }] : [],
      minResources: {
        fuel: Number(minFuel) || 0,
        ammo: Number(minAmmo) || 0,
        steel: Number(minSteel) || 0,
        bauxite: Number(minBauxite) || 0,
      },
    };
    result.push(current);
  } else if (current && fromName?.trim()) {
    // 置換元追加
    const fromId = resolveEquipName(fromName.trim());
    if (fromId) current.from.push({ id: fromId, slots: Number(fromPct) / 2 });
  }
});

writeFileSync("public/overrides.json", JSON.stringify(result, null, 2), "utf-8");
console.log(`完了: ${result.length}件を public/overrides.json に出力しました`);
