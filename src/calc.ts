import { SECRETARY_TYPES, TABLES, type Equipment, type Ship, type Override, type DevTableData, type Resources, type SlotMap, type CalcResult, type Candidate, type SecretaryType, type TableType } from "./types";

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

// 4資源それぞれの最大値を取る
function maxResources(a: Resources, b: Resources): Resources {
  return {
    fuel: Math.max(a.fuel, b.fuel),
    ammo: Math.max(a.ammo, b.ammo),
    steel: Math.max(a.steel, b.steel),
    bauxite: Math.max(a.bauxite, b.bauxite),
  };
}

// resources が min の4資源すべてを満たしているか
function meetsRequirement(resources: Resources, min: Resources): boolean {
  return (
    resources.fuel >= min.fuel &&
    resources.ammo >= min.ammo &&
    resources.steel >= min.steel &&
    resources.bauxite >= min.bauxite
  );
}

// 装備の開発に必要な実資源量（Equipment.req は 1/10 値で保持されているため ×10 する）
function requiredResources(eq: Equipment): Resources {
  return {
    fuel: eq.req.fuel * 10,
    ammo: eq.req.ammo * 10,
    steel: eq.req.steel * 10,
    bauxite: eq.req.bauxite * 10,
  };
}

// 装備が開発可能か（投入資源が必要量を満たし、司令部Lvが足りている）。UI側の表示判定でも使う
export function canDevelop(eq: Equipment, resources: Resources, hqLevel: number): boolean {
  return meetsRequirement(resources, requiredResources(eq)) && hqLevel >= eq.rarity * 10;
}

// 最低投入資源(minReq)を、指定テーブルが選ばれる投入資源条件を満たすまで最小限引き上げる
function adjustForTable(minReq: Resources, table: TableType): Resources {
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

// 秘書艦種×テーブルの基礎開発率(%)を ÷2 してスロット数マップに変換する
function buildBaseSlots(
  devTableData: DevTableData,
  secretaryType: SecretaryType,
  table: TableType
): SlotMap {
  const key = `${secretaryType}_${table}`;
  const slotMap: SlotMap = {};
  for (const [id, tableVals] of Object.entries(devTableData)) {
    const val = tableVals[key];
    if (val) slotMap[Number(id)] = val / 2;
  }
  return slotMap;
}

// スロット構成にoverride（開発率の付け替え）を適用する。
// shipId が null の場合は艦別overrideを発動させず、資源条件のみのoverrideだけを適用する
function applyOverrides(
  slotMap: SlotMap,
  relevantOverrides: Override[],
  resources: Resources,
  shipId: number | null
): SlotMap {
  const slots = { ...slotMap };
  for (const o of relevantOverrides) {
    if (o.to.id === null) continue;
    const applies =
      o.shipIds.length > 0
        ? shipId !== null && o.shipIds.includes(shipId)
        : meetsRequirement(resources, o.minResources);
    if (!applies) continue;
    // 付け替え元がこのテーブルに存在しない場合は減算をスキップする（付け替え先の加算は常に行う）
    for (const f of o.from) {
      if (slots[f.id] != null) slots[f.id] = Math.max(0, slots[f.id] - f.slots);
    }
    slots[o.to.id] = (slots[o.to.id] || 0) + o.to.slots;
  }
  return slots;
}

// 暫定込みと確定のみのスロット構成を比較し、暫定データで表示数値が変わる装備IDを返す
// （空でなければ⚠バッジ表示対象）。開発可能な装備に限定するのは、暫定overrideが
// スロット均衡（付け替え先=付け替え元合計）で、開発不可装備間の移動では失敗率が
// 変わらず表示に出ないため。境界をまたぐ移動は開発可能側が差分に残るので取りこぼさない
function provisionalDiffIds(
  full: SlotMap,
  confirmed: SlotMap,
  resources: Resources,
  equipmentById: Map<number, Equipment>,
  hqLevel: number
): number[] {
  const ids = new Set<number>();
  for (const key of [...Object.keys(full), ...Object.keys(confirmed)]) {
    const id = Number(key);
    if ((full[id] || 0) === (confirmed[id] || 0)) continue;
    const eq = equipmentById.get(id);
    if (eq && canDevelop(eq, resources, hqLevel)) ids.add(id);
  }
  return [...ids].sort((a, b) => a - b);
}

// 対象装備1件が現在のスロット構成・投入資源で開発可能か
function isTargetAvailable(slots: SlotMap, resources: Resources, eq: Equipment): boolean {
  return (slots[eq.id] || 0) > 0 && meetsRequirement(resources, requiredResources(eq));
}

function allTargetsAvailable(
  slots: SlotMap,
  resources: Resources,
  targets: Equipment[]
): boolean {
  return targets.every((eq) => isTargetAvailable(slots, resources, eq));
}

// スロット構成と投入資源から対象開発率・開発失敗率・期待消費資源を算出する。
// 対象装備のスロットが1つも無い構成は候補になり得ないため null を返す
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

  // 資源不足または司令部Lv不足の装備を引くと開発失敗になる（そのスロット分が失敗率）
  const failSlots = Object.entries(slots).reduce((sum, [eqId, slotCount]) => {
    const eq = equipmentById.get(Number(eqId));
    if (!eq) return sum;
    return sum + (canDevelop(eq, resources, hqLevel) ? 0 : slotCount);
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
      // 開発失敗時は資材を消費しないため、消費が発生する試行の割合(1-失敗率)を成功率で割る
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

// 開発できない選択装備を列挙する（isCombinableで艦別overrideの確認対象を絞るために使う）
function missingTargets(slots: SlotMap, resources: Resources, targets: Equipment[]): Equipment[] {
  return targets.filter((eq) => !isTargetAvailable(slots, resources, eq));
}

// 全テーブル共通の最低投入資源を求める:
// 「開発の最低投入量(各10)」「選択装備の必要資源」「資源条件のみ(shipIds空)で
// 選択装備に付け替わるoverrideの発動条件」の3者の最大値
function computeBaseMinReq(targets: Equipment[], overridesByKey: Map<string, Override[]>): Resources {
  const overrideMinReq = [...overridesByKey.values()]
    .flat()
    .filter((o) => o.shipIds.length === 0 && o.to.id !== null && targets.some((t) => t.id === o.to.id))
    .map((o) => o.minResources)
    .reduce(maxResources, { fuel: 0, ammo: 0, steel: 0, bauxite: 0 });
  return targets
    .map(requiredResources)
    .reduce(maxResources, maxResources(overrideMinReq, { fuel: 10, ammo: 10, steel: 10, bauxite: 10 }));
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

  const baseMinReq = computeBaseMinReq(targets, overridesByKey);

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
        // o.shipIds のどの艦を選んでも o 自体は発動するため、先頭艦を代表として確認する
        const modified = applyOverrides(baseSlots, relevantOverrides, resources, o.shipIds[0]);
        if (allTargetsAvailable(modified, resources, targets)) return true;
      }
    }
  }
  return false;
}

// 秘書艦種×テーブル12通りを全探索し、候補レシピを生成する。各組み合わせで
// 「艦を指定しないbase候補」と「艦別overrideで結果がbaseより良くなる艦の候補」を作り、
// 期待資材消費の昇順でソートして返す
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

  const baseMinReq = computeBaseMinReq(targets, overridesByKey);

  const candidates: Candidate[] = [];

  // 改造後艦(誰かのafterId先になっている艦)より改造前艦を優先して処理し、
  // 同一結果にグループ化される際の代表ラベルが改造前艦になるようにする。
  // 改造段階が同じ艦同士は、無関係な他のoverrideのshipIds出現順に左右されないよう
  // sortId(ゲーム内図鑑順)で決定的に順序付けする
  const afterIdTargets = new Set(
    [...shipById.values()].map((s) => s.afterId).filter((id): id is number => id !== null)
  );

  for (const secretaryType of SECRETARY_TYPES) {
    for (const table of TABLES) {
      const resources = adjustForTable(baseMinReq, table);
      const baseSlots = buildBaseSlots(devTableData, secretaryType, table);
      const relevantOverrides = overridesByKey.get(`${secretaryType}_${table}`) ?? [];
      // 暫定overrideを含む場合のみ、確定データのみの構成と比較して⚠対象装備を割り出す。
      // 暫定が無ければ差分は常に空なので確定計算を省く
      const hasProvisional = relevantOverrides.some((o) => o.provisional);
      const confirmedOverrides = hasProvisional ? relevantOverrides.filter((o) => !o.provisional) : relevantOverrides;
      const baseModifiedSlots = applyOverrides(baseSlots, relevantOverrides, resources, null);
      const baseProvisionalEqIds = hasProvisional
        ? provisionalDiffIds(baseModifiedSlots, applyOverrides(baseSlots, confirmedOverrides, resources, null), resources, equipmentById, hqLevel)
        : [];

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

      // 艦ごとのoverride適用結果を1回だけ計算し、除外艦判定・独自候補への昇格判定の両方で使い回す。
      // provisionalEqIds は「暫定込み」と「確定のみ」の構成差分（＝暫定が数値を動かした装備）
      const shipComputations = shipIdsWithOverride.map((shipId) => {
        const modified = applyOverrides(baseSlots, relevantOverrides, resources, shipId);
        const modResult = calcResult(modified, resources, targets, equipmentById, hqLevel);
        const provisionalEqIds = hasProvisional
          ? provisionalDiffIds(modified, applyOverrides(baseSlots, confirmedOverrides, resources, shipId), resources, equipmentById, hqLevel)
          : [];
        return { shipId, modified, modResult, provisionalEqIds };
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
      const excludedShipProvisionalEqIds = Object.fromEntries(
        excludedShipComputations.map(({ shipId, provisionalEqIds }) => [shipId, provisionalEqIds])
      );

      if (allTargetsAvailable(baseModifiedSlots, resources, targets) && baseResult) {
        candidates.push({ label: secretaryType, shipIds: [], excludedShipIds, table, resources, result: baseResult, baseSlotMap: baseModifiedSlots, excludedShipSlotMaps, provisionalEqIds: baseProvisionalEqIds, excludedShipProvisionalEqIds });
      }

      // 同じスロット構成の艦をグループ化する（slotMapのJSON文字列をキーに1回だけ照合）。
      // 確定overrideの艦と暫定overrideの艦が偶然同じ構成になっても混ざらないよう、暫定差分もキーに含める
      const candidateByGroupKey = new Map<string, Candidate>();
      for (const { shipId, modified, modResult, provisionalEqIds } of shipComputations) {
        const ship = shipById.get(shipId);
        if (!ship || !modResult) continue;
        if (!allTargetsAvailable(modified, resources, targets)) continue;

        if (!baseResult || isBetterResult(modResult, baseResult)) {
          const groupKey = `${JSON.stringify(modResult.slotMap)}|${provisionalEqIds.join(",")}`;
          const existing = candidateByGroupKey.get(groupKey);
          if (existing) {
            existing.shipIds.push(shipId);
          } else {
            const candidate = { label: ship.name, shipIds: [shipId], excludedShipIds: [], table, resources, result: modResult, baseSlotMap: baseModifiedSlots, excludedShipSlotMaps: {}, provisionalEqIds, excludedShipProvisionalEqIds: {} };
            candidates.push(candidate);
            candidateByGroupKey.set(groupKey, candidate);
          }
        }
      }
    }
  }

  const totalCost = (c: Candidate) =>
    c.result.expectedCost.fuel + c.result.expectedCost.ammo +
    c.result.expectedCost.steel + c.result.expectedCost.bauxite;

  // 期待資材消費の昇順 → 対象開発率の降順 → 開発失敗率の降順 → 4資源合計の昇順
  candidates.sort((a, b) =>
    a.result.expectedCost.devmat - b.result.expectedCost.devmat ||
    b.result.successRate - a.result.successRate ||
    b.result.failRate - a.result.failRate ||
    totalCost(a) - totalCost(b)
  );

  return { candidates, baseMinReq };
}
