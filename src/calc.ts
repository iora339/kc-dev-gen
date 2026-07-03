import type { Equipment, Ship, Override, DevTableData, Resources, SlotMap, CalcResult, Candidate } from "./types";

const SECRETARY_TYPES = ["砲戦系", "水雷系", "空母系", "潜水系"] as const;
const TABLES = ["鋼燃", "弾薬", "ボーキ"] as const;

// secretary_tableキーごとに事前グループ化しておくことで、isCombinable/calcOptimal内で
// overrides配列を毎回フィルタし直す必要がなくなる
export function groupOverridesByKey(overrides: Override[]): Map<string, Override[]> {
  const map = new Map<string, Override[]>();
  for (const o of overrides) {
    const key = `${o.secretary}_${o.table}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(o);
  }
  return map;
}

function adjustForTable(minReq: Resources, table: string): Resources {
  const { fuel } = minReq;
  let { ammo, steel, bauxite } = minReq;
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
  relevantOverrides: Override[],
  resources: Resources,
  shipId: number | null
): SlotMap {
  const slots = { ...slotMap };
  for (const o of relevantOverrides) {
    if (o.to.id === null) continue;
    let applies: boolean;
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

// 開発資材消費(devmat)は (1-失敗率)/成功率 で決まるため、対象開発率は高いほど、
// 開発失敗率は高いほど資材消費が少なく済む（開発失敗時は資材を消費しないため）
function isBetterResult(a: CalcResult, base: CalcResult): boolean {
  return a.successSlots > base.successSlots || (a.successSlots === base.successSlots && a.failSlots > base.failSlots);
}
function isWorseResult(a: CalcResult, base: CalcResult): boolean {
  return a.successSlots < base.successSlots || (a.successSlots === base.successSlots && a.failSlots < base.failSlots);
}

function missingTargets(slots: SlotMap, resources: Resources, targets: Equipment[]): Equipment[] {
  return targets.filter(
    (eq) =>
      !(
        (slots[eq.id] || 0) > 0 &&
        resources.fuel >= eq.req.fuel * 10 &&
        resources.ammo >= eq.req.ammo * 10 &&
        resources.steel >= eq.req.steel * 10 &&
        resources.bauxite >= eq.req.bauxite * 10
      )
  );
}

// targetIdsを同時に開発できる秘書艦種・テーブルの組み合わせが1つでも存在するかを判定する
// （艦別overrideは、不足している対象装備にto.idが一致するものだけ確認すれば十分なため軽量）
export function isCombinable(
  targetIds: number[],
  hqLevel: number,
  equipmentById: Map<number, Equipment>,
  overridesByKey: Map<string, Override[]>,
  devTableData: DevTableData
): boolean {
  const targets = targetIds.map((id) => equipmentById.get(id)).filter((e): e is Equipment => !!e);
  if (targets.length === 0) return true;
  if (targets.some((eq) => hqLevel < eq.rarity * 10)) return false;

  const allOverrides = [...overridesByKey.values()].flat();
  const relevantOverrideMinReq = allOverrides
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

  for (const secretaryType of SECRETARY_TYPES) {
    for (const table of TABLES) {
      const resources = adjustForTable(baseMinReq, table);
      const baseSlots = buildBaseSlots(devTableData, secretaryType, table);
      const relevantOverrides = overridesByKey.get(`${secretaryType}_${table}`) ?? [];
      const baseModifiedSlots = applyOverrides(baseSlots, relevantOverrides, resources, null);

      const missing = missingTargets(baseModifiedSlots, resources, targets);
      if (missing.length === 0) return true;

      const missingIds = new Set(missing.map((e) => e.id));
      const candidateOverrides = relevantOverrides.filter(
        (o) => o.shipIds.length > 0 && o.to.id !== null && missingIds.has(o.to.id)
      );
      for (const o of candidateOverrides) {
        const modified = applyOverrides(baseSlots, relevantOverrides, resources, o.shipIds[0]);
        if (allTargetsAvailable(modified, resources, targets)) return true;
      }
    }
  }
  return false;
}

export function calcOptimal(
  targetIds: number[],
  hqLevel: number,
  equipmentById: Map<number, Equipment>,
  shipById: Map<number, Ship>,
  overridesByKey: Map<string, Override[]>,
  devTableData: DevTableData
): { candidates: Candidate[]; baseMinReq: Resources } | { error: string } {
  const targets = targetIds.map((id) => equipmentById.get(id)).filter((e): e is Equipment => !!e);
  if (targets.length === 0) return { error: "装備が選択されていません" };

  for (const eq of targets) {
    if (hqLevel < eq.rarity * 10) {
      return { error: `司令部レベル不足 (${eq.name}): 必要${eq.rarity * 10}` };
    }
  }

  const allOverrides = [...overridesByKey.values()].flat();
  const relevantOverrideMinReq = allOverrides
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

  // 改造後艦(誰かのafterId先になっている艦)より改造前艦を優先して処理し、
  // 同一結果にグループ化される際の代表ラベルが改造前艦になるようにする。
  // 改造段階が同じ艦同士は、無関係な他のoverrideのshipIds出現順に左右されないよう
  // sortId(艦歴順)で決定的に順序付けする
  const afterIdTargets = new Set(
    [...shipById.values()].map((s) => s.afterId).filter((id): id is number => id !== null)
  );

  for (const secretaryType of SECRETARY_TYPES) {
    for (const table of TABLES) {
      const resources = adjustForTable(baseMinReq, table);
      const baseSlots = buildBaseSlots(devTableData, secretaryType, table);
      const relevantOverrides = overridesByKey.get(`${secretaryType}_${table}`) ?? [];
      const baseModifiedSlots = applyOverrides(baseSlots, relevantOverrides, resources, null);

      const shipIdsWithOverride = [
        ...new Set(
          relevantOverrides
            .filter((o) => o.shipIds.length > 0)
            .flatMap((o) => o.shipIds)
        ),
      ].sort((a, b) => {
        const rootDiff = Number(afterIdTargets.has(a)) - Number(afterIdTargets.has(b));
        if (rootDiff !== 0) return rootDiff;
        const sa = shipById.get(a);
        const sb = shipById.get(b);
        return (sa?.sortId ?? a) - (sb?.sortId ?? b);
      });

      const baseResult = calcResult(baseModifiedSlots, resources, targets, equipmentById, hqLevel);

      // 艦ごとのoverride適用結果を1回だけ計算し、除外艦判定・独自候補への昇格判定の両方で使い回す
      const shipComputations = shipIdsWithOverride.map((shipId) => {
        const modified = applyOverrides(baseSlots, relevantOverrides, resources, shipId);
        const modResult = calcResult(modified, resources, targets, equipmentById, hqLevel);
        return { shipId, modified, modResult };
      });

      // overrideにより対象開発率・開発失敗率がbaseより悪化する艦を収集（除外すべき艦）
      const excludedShipComputations = shipComputations.filter(({ modResult }) => {
        if (!baseResult) return false;
        if (!modResult) return true;
        return isWorseResult(modResult, baseResult);
      });
      const excludedShipIds = excludedShipComputations.map(({ shipId }) => shipId);
      const excludedShipSlotMaps = Object.fromEntries(
        excludedShipComputations.map(({ shipId, modified }) => [shipId, modified])
      );

      if (allTargetsAvailable(baseModifiedSlots, resources, targets) && baseResult) {
        candidates.push({ label: secretaryType, shipIds: [], excludedShipIds, table, resources, result: baseResult, baseSlotMap: baseModifiedSlots, excludedShipSlotMaps });
      }

      // 同じスロット構成の艦をグループ化する（slotMapのJSON文字列をキーに1回だけ照合）
      const candidateBySlotJson = new Map<string, Candidate>();
      for (const { shipId, modified, modResult } of shipComputations) {
        const ship = shipById.get(shipId);
        if (!ship || !modResult) continue;
        if (!allTargetsAvailable(modified, resources, targets)) continue;

        if (!baseResult || isBetterResult(modResult, baseResult)) {
          const resultSlotMapJson = JSON.stringify(modResult.slotMap);
          const existing = candidateBySlotJson.get(resultSlotMapJson);
          if (existing) {
            existing.shipIds.push(shipId);
          } else {
            const candidate = { label: ship.name, shipIds: [shipId], excludedShipIds: [], table, resources, result: modResult, baseSlotMap: baseModifiedSlots, excludedShipSlotMaps: {} };
            candidates.push(candidate);
            candidateBySlotJson.set(resultSlotMapJson, candidate);
          }
        }
      }
    }
  }

  const totalCost = (c: Candidate) =>
    c.result.expectedCost.fuel + c.result.expectedCost.ammo +
    c.result.expectedCost.steel + c.result.expectedCost.bauxite;

  candidates.sort((a, b) =>
    a.result.expectedCost.devmat - b.result.expectedCost.devmat ||
    b.result.successRate - a.result.successRate ||
    b.result.failRate - a.result.failRate ||
    totalCost(a) - totalCost(b)
  );

  return { candidates, baseMinReq };
}
