import { useState, useEffect } from "react";
import type { Equipment, Ship, ShipType, Override, DevTableData } from "./types";

interface AppData {
  equipment: Equipment[];
  ships: Ship[];
  shipTypes: ShipType[];
  overrides: Override[];
  overridesPending: Override[];
  devTableData: DevTableData;
}

export function useData(): { data: AppData | null; error: string | null } {
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/equipment.json").then((r) => r.json()),
      fetch("/ships.json").then((r) => r.json()),
      fetch("/ship-type.json").then((r) => r.json()),
      fetch("/overrides.json").then((r) => r.json()),
      fetch("/overrides-pending.json").then((r) => r.json()),
      fetch("/dev-table.json").then((r) => r.json()),
    ])
      .then(([equipment, ships, shipTypes, overrides, overridesPending, devTableData]) => {
        setData({ equipment, ships, shipTypes, overrides, overridesPending, devTableData });
      })
      .catch(() => setError("データの読み込みに失敗しました"));
  }, []);

  return { data, error };
}
