import type { SortKey } from "../components/ResultCard";

// URL共有用の状態。App.tsx の4つの useState と対応する
export type ShareableState = {
  selectedIds: number[];
  hqLevel: number;
  sortKey: SortKey;
  usePendingData: boolean;
};

// この値のときはURLに載せない（素の状態では ?... が付かない）
const DEFAULTS: ShareableState = {
  selectedIds: [],
  hqLevel: 120,
  sortKey: "devmat",
  usePendingData: false,
};

const COST_SORT_KEYS = new Set(["fuel", "ammo", "steel", "bauxite", "devmat"]);

// 不正な sort パラメータを弾くための SortKey 妥当性判定
function isSortKey(v: string): v is SortKey {
  if (COST_SORT_KEYS.has(v) || v === "successRate" || v === "failRate") return true;
  const n = v.startsWith("nail-") ? Number(v.slice(5)) : NaN;
  return Number.isInteger(n) && n > 0;
}

// クエリ文字列を各 useState の初期値へ変換する。不正値は既定値へフォールバック
export function parseShareParams(search: string): ShareableState {
  const params = new URLSearchParams(search);

  const ids = (params.get("eq") ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0);
  const hq = Number(params.get("hq"));
  const sort = params.get("sort");

  return {
    selectedIds: [...new Set(ids)],
    hqLevel: hq >= 1 ? Math.min(120, Math.floor(hq)) : DEFAULTS.hqLevel,
    sortKey: sort && isSortKey(sort) ? sort : DEFAULTS.sortKey,
    usePendingData: params.get("pending") === "1",
  };
}

// コピーボタン押下時に、現在stateから共有用の絶対URLを組み立てる。
// base パス（/kc-dev-gen/）は location.pathname に含まれるので温存される
export function buildShareUrl(state: ShareableState): string {
  const params = new URLSearchParams();
  if (state.selectedIds.length > 0) params.set("eq", state.selectedIds.join(","));
  if (state.hqLevel !== DEFAULTS.hqLevel) params.set("hq", String(state.hqLevel));
  if (state.sortKey !== DEFAULTS.sortKey) params.set("sort", state.sortKey);
  if (state.usePendingData) params.set("pending", "1");
  // カンマ(%2C)はクエリ内でそのまま使えるため、可読性・短さのためデコードして戻す
  const query = params.toString().replace(/%2C/g, ",");
  const { origin, pathname } = window.location;
  return origin + pathname + (query ? `?${query}` : "");
}
