import { useState, useEffect } from "react";
import type { Equipment, Ship, ShipType, Override, DevTableData } from "./types";

interface AppData {
  equipment: Equipment[];
  ships: Ship[];
  shipTypes: ShipType[];
  // 確定override。overridesPending は暫定検証データで、
  // App.tsx の「暫定データを使用」チェック時のみ overrides に結合される
  overrides: Override[];
  overridesPending: Override[];
  devTableData: DevTableData;
}

export function useData(): { data: AppData | null; error: string | null } {
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // GitHub Pages のサブパス(/kc-dev-gen/)配下でも解決できるよう BASE_URL を前置する
    const baseUrl = import.meta.env.BASE_URL;
    const fetchJson = (name: string) =>
      fetch(`${baseUrl}${name}`).then((r) => {
        if (!r.ok) throw new Error(`${name}: ${r.status}`);
        return r.json();
      });
    Promise.all([
      fetchJson("equipment.json"),
      fetchJson("ships.json"),
      fetchJson("ship-type.json"),
      fetchJson("overrides.json"),
      fetchJson("overrides-pending.json"),
      fetchJson("dev-table.json"),
    ])
      .then(([equipment, ships, shipTypes, overrides, overridesPending, devTableData]) => {
        setData({ equipment, ships, shipTypes, overrides, overridesPending, devTableData });
      })
      .catch(() => setError("データの読み込みに失敗しました"));
  }, []);

  return { data, error };
}
