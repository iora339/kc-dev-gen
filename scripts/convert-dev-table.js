import { readFileSync, writeFileSync } from "fs";

const equipment = JSON.parse(readFileSync("public/equipment.json", "utf-8"));
const equipmentByName = new Map(equipment.map((e) => [e.name, e]));
const raw = readFileSync("data/dev-table.csv", "utf-8");

const lines = raw.split("\n");
const headers = lines[0].replace(/"/g, "").split(",");
const tableColumns = headers.slice(2); // 12開発テーブル列

const result = {};

lines.slice(1).filter((l) => l.trim()).forEach((line) => {
  const cols = line.replace(/"/g, "").split(",");
  const name = cols[1];
  const eq = equipmentByName.get(name);
  if (!eq) {
    console.warn(`未マッチ: ${name}`);
    return;
  }
  result[eq.id] = Object.fromEntries(
    tableColumns.map((h, i) => [h, Number(cols[2 + i]) || 0])
  );
});

writeFileSync("public/dev-table.json", JSON.stringify(result, null, 2), "utf-8");
console.log(`完了: ${Object.keys(result).length}件を public/dev-table.json に出力しました`);
