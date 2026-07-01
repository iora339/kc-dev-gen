export interface Equipment {
  id: number;
  name: string;
  type: number;
  iconType: number;
  rarity: number;
  req: { fuel: number; ammo: number; steel: number; bauxite: number };
}

export interface Ship {
  id: number;
  name: string;
  shipType: number;
  afterId: number | null;
}

export interface Override {
  id: number;
  shipIds: number[];
  secretary: string;
  table: string;
  to: { id: number | null; slots: number };
  from: { id: number; slots: number }[];
  minResources: { fuel: number; ammo: number; steel: number; bauxite: number };
}

export type DevTableData = Record<number, Record<string, number>>;

export interface Resources {
  fuel: number;
  ammo: number;
  steel: number;
  bauxite: number;
}

export interface SlotMap {
  [equipId: number]: number;
}

export interface CalcResult {
  successSlots: number;
  successRate: number;
  failSlots: number;
  failRate: number;
  expectedCost: Resources & { devmat: number };
  slotMap: SlotMap;
}

export interface Candidate {
  label: string;
  shipIds: number[];
  excludedShipIds: number[];
  table: string;
  resources: Resources;
  result: CalcResult;
}
