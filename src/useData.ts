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
    const baseUrl = import.meta.env.BASE_URL;
    Promise.all([
      fetch(`${baseUrl}equipment.json`).then((r) => r.json()),
      fetch(`${baseUrl}ships.json`).then((r) => r.json()),
      fetch(`${baseUrl}ship-type.json`).then((r) => r.json()),
      fetch(`${baseUrl}overrides.json`).then((r) => r.json()),
      fetch(`${baseUrl}overrides-pending.json`).then((r) => r.json()),
      fetch(`${baseUrl}dev-table.json`).then((r) => r.json()),
    ])
      .then(([equipment, ships, shipTypes, overrides, overridesPending, devTableData]) => {
        setData({ equipment, ships, shipTypes, overrides, overridesPending, devTableData });
      })
      .catch(() => setError("データの読み込みに失敗しました"));
  }, []);

  return { data, error };
}
