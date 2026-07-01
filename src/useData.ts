import { useState, useEffect } from "react";
import type { Equipment, Ship, Override, DevTableData } from "./types";

interface AppData {
  equipment: Equipment[];
  ships: Ship[];
  overrides: Override[];
  devTableData: DevTableData;
}

export function useData(): { data: AppData | null; error: string | null } {
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/equipment.json").then((r) => r.json()),
      fetch("/ships.json").then((r) => r.json()),
      fetch("/overrides.json").then((r) => r.json()),
      fetch("/dev-table.json").then((r) => r.json()),
    ])
      .then(([equipment, ships, overrides, devTableData]) => {
        setData({ equipment, ships, overrides, devTableData });
      })
      .catch(() => setError("データの読み込みに失敗しました"));
  }, []);

  return { data, error };
}
