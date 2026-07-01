import type { Equipment, Ship, Override, DevTableData, Resources, SlotMap, CalcResult, Candidate } from "./types";

const SECRETARY_TYPES = ["砲戦系", "水雷系", "空母系", "潜水系"] as const;
const TABLES = ["鋼燃", "弾薬", "ボーキ"] as const;

function adjustForTable(minReq: Resources, table: string): Resources {
  let { fuel, ammo, steel, bauxite } = minReq;
  if (table === "鋼燃") {
    // max(fuel,steel) >= ammo かつ max(fuel,steel) >= bauxite
    const need = Math.max(ammo, bauxite);
    if (Math.max(fuel, steel) < need) steel = need;
  } else if (table === "弾薬") {
    // ammo > max(fuel,steel) かつ ammo >= bauxite
    ammo = Math.max(ammo, Math.max(fuel, steel) + 1, bauxite);
  } else if (table === "ボーキ") {
    // bauxite > max(fuel,steel) かつ bauxite > ammo
    const need = Math.max(fuel, steel, ammo);
    if (bauxite <= need) bauxite = need + 1;
  }
  return { fuel, ammo, steel, bauxite };
}

function buildBaseSlots(
  equipmentById: Map<number, Equipment>,
  devTableData: DevTableData,
  secretaryType: string,
  table: string
): SlotMap {
  const key = `${secretaryType}_${table}`;
  const slotMap: SlotMap = {};
  for (const [id, tableVals] of Object.entries(devTableData)) {
    const val = tableVals[key];
    if (val) slotMap[Number(id)] = val / 2;
  }
  return slotMap;
}

function applyOverrides(
  slotMap: SlotMap,
  overrides: Override[],
  secretaryType: string,
  table: string,
  resources: Resources,
  shipId: number | null
): SlotMap {
  const slots = { ...slotMap };
  const relevant = overrides.filter(
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

function allTargetsAvailable(
  slots: SlotMap,
  resources: Resources,
  targets: Equipment[]
): boolean {
  return targets.every(
    (eq) =>
      (slots[eq.id] || 0) > 0 &&
      resources.fuel >= eq.req.fuel * 10 &&
      resources.ammo >= eq.req.ammo * 10 &&
      resources.steel >= eq.req.steel * 10 &&
      resources.bauxite >= eq.req.bauxite * 10
  );
}

function calcResult(
  slots: SlotMap,
  resources: Resources,
  targets: Equipment[],
  equipmentById: Map<number, Equipment>,
  hqLevel: number
): CalcResult | null {
  const successSlots = targets.reduce((sum, eq) => sum + (slots[eq.id] || 0), 0);
  const successRate = successSlots / 50;
  if (successRate === 0) return null;

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
    slotMap: slots,
  };
}

export function calcOptimal(
  targetIds: number[],
  hqLevel: number,
  equipment: Equipment[],
  ships: Ship[],
  overrides: Override[],
  devTableData: DevTableData
): { candidates: Candidate[]; baseMinReq: Resources } | { error: string } {
  const equipmentById = new Map(equipment.map((e) => [e.id, e]));
  const shipById = new Map(ships.map((s) => [s.id, s]));

  const targets = targetIds.map((id) => equipmentById.get(id)).filter((e): e is Equipment => !!e);
  if (targets.length === 0) return { error: "装備が選択されていません" };

  for (const eq of targets) {
    if (hqLevel < eq.rarity * 10) {
      return { error: `司令部レベル不足 (${eq.name}): 必要${eq.rarity * 10}` };
    }
  }

  const relevantOverrideMinReq = overrides
    .filter((o) => o.shipIds.length === 0 && o.to.id !== null && targets.some((t) => t.id === o.to.id))
    .reduce(
      (acc, o) => ({
        fuel: Math.max(acc.fuel, o.minResources.fuel),
        ammo: Math.max(acc.ammo, o.minResources.ammo),
        steel: Math.max(acc.steel, o.minResources.steel),
        bauxite: Math.max(acc.bauxite, o.minResources.bauxite),
      }),
      { fuel: 0, ammo: 0, steel: 0, bauxite: 0 }
    );

  const baseMinReq: Resources = {
    fuel: Math.max(...targets.map((e) => Math.max(e.req.fuel * 10, 10)), relevantOverrideMinReq.fuel),
    ammo: Math.max(...targets.map((e) => Math.max(e.req.ammo * 10, 10)), relevantOverrideMinReq.ammo),
    steel: Math.max(...targets.map((e) => Math.max(e.req.steel * 10, 10)), relevantOverrideMinReq.steel),
    bauxite: Math.max(...targets.map((e) => Math.max(e.req.bauxite * 10, 10)), relevantOverrideMinReq.bauxite),
  };

  const candidates: Candidate[] = [];

  for (const secretaryType of SECRETARY_TYPES) {
    for (const table of TABLES) {
      const resources = adjustForTable(baseMinReq, table);
      const baseSlots = buildBaseSlots(equipmentById, devTableData, secretaryType, table);
      const baseModifiedSlots = applyOverrides(baseSlots, overrides, secretaryType, table, resources, null);

      const shipIdsWithOverride = [
        ...new Set(
          overrides
            .filter((o) => o.secretary === secretaryType && o.table === table && o.shipIds.length > 0)
            .flatMap((o) => o.shipIds)
        ),
      ];

      // overrideによりbaseと異なる結果になる艦を収集（除外すべき艦）
      const excludedShipIds = shipIdsWithOverride.filter((shipId) => {
        const modified = applyOverrides(baseSlots, overrides, secretaryType, table, resources, shipId);
        return JSON.stringify(modified) !== JSON.stringify(baseModifiedSlots);
      });

      if (allTargetsAvailable(baseModifiedSlots, resources, targets)) {
        const result = calcResult(baseModifiedSlots, resources, targets, equipmentById, hqLevel);
        if (result) candidates.push({ label: secretaryType, shipIds: [], excludedShipIds, table, resources, result });
      }

      for (const shipId of shipIdsWithOverride) {
        const ship = shipById.get(shipId);
        if (!ship) continue;

        const modified = applyOverrides(baseSlots, overrides, secretaryType, table, resources, shipId);
        if (!allTargetsAvailable(modified, resources, targets)) continue;

        const result = calcResult(modified, resources, targets, equipmentById, hqLevel);
        if (!result) continue;

        const baseResult = calcResult(baseModifiedSlots, resources, targets, equipmentById, hqLevel);
        if (!baseResult || result.successSlots !== baseResult.successSlots) {
          // 同じスロット構成の艦をグループ化
          const existing = candidates.find(
            (c) => c.table === table && c.result.successSlots === result.successSlots &&
            JSON.stringify(c.result.slotMap) === JSON.stringify(result.slotMap)
          );
          if (existing && existing.shipIds.length > 0) {
            existing.shipIds.push(shipId);
          } else {
            candidates.push({ label: ship.name, shipIds: [shipId], excludedShipIds: [], table, resources, result });
          }
        }
      }
    }
  }

  const totalCost = (c: Candidate) =>
    c.result.expectedCost.fuel + c.result.expectedCost.ammo +
    c.result.expectedCost.steel + c.result.expectedCost.bauxite;

  candidates.sort((a, b) => b.result.failRate - a.result.failRate || totalCost(a) - totalCost(b));

  return { candidates, baseMinReq };
}
