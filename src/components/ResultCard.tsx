import { useState } from "react";
import type { Candidate, Equipment, Ship } from "../types";

interface Props {
  candidate: Candidate;
  targets: Equipment[];
  ships: Ship[];
  equipment: Equipment[];
  hqLevel: number;
}

export function ResultCard({ candidate, targets, ships, equipment, hqLevel }: Props) {
  const [showShips, setShowShips] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [showExcluded, setShowExcluded] = useState(false);

  const { label, shipIds, excludedShipIds, table, resources, result } = candidate;
  const { expectedCost, failRate, successRate, slotMap } = result;

  const shipNames = shipIds.map((id) => ships.find((s) => s.id === id)?.name).filter(Boolean) as string[];
  const excludedShipNames = excludedShipIds.map((id) => ships.find((s) => s.id === id)?.name).filter(Boolean) as string[];
  const representativeName = label;
  const otherCount = shipNames.length > 1 ? shipNames.length - 1 : 0;

  const canDevelop = (eq: Equipment) =>
    resources.fuel >= eq.req.fuel * 10 &&
    resources.ammo >= eq.req.ammo * 10 &&
    resources.steel >= eq.req.steel * 10 &&
    resources.bauxite >= eq.req.bauxite * 10 &&
    hqLevel >= eq.rarity * 10;

  const allSlots = Object.entries(slotMap)
    .map(([id, slots]) => ({ eq: equipment.find((e) => e.id === Number(id))!, slots }))
    .filter((x) => x.eq && x.slots > 0 && canDevelop(x.eq))
    .sort((a, b) => b.slots - a.slots);

  const isTarget = (id: number) => targets.some((t) => t.id === id);

  return (
    <div style={{ background: "var(--surface-2)", border: "0.5px solid var(--border)", borderRadius: 12, padding: "1.25rem 1.5rem", position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 16, fontWeight: 500 }}>{representativeName}</span>
        {otherCount > 0 && (
          <div style={{ position: "relative" }}>
            <button
              onClick={() => { setShowShips((v) => !v); setShowDetail(false); }}
              style={{ fontSize: 12, padding: "2px 8px", borderRadius: "var(--radius)", border: "0.5px solid var(--border-strong)", background: "var(--surface-1)", color: "var(--text-secondary)", cursor: "pointer" }}
            >
              他{otherCount}
            </button>
            {showShips && (
              <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, background: "var(--surface-2)", border: "0.5px solid var(--border-strong)", borderRadius: "var(--radius)", padding: "10px 14px", zIndex: 10, whiteSpace: "nowrap", fontSize: 13, boxShadow: "0 2px 8px rgba(0,0,0,0.12)" }}>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>秘書艦候補</div>
                {shipNames.map((name) => <div key={name} style={{ lineHeight: 1.8 }}>{name}</div>)}
              </div>
            )}
          </div>
        )}
        <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>/ {table}テーブル</span>
        {excludedShipNames.length > 0 && (
          <div style={{ position: "relative", marginLeft: "auto" }}>
            <button
              onClick={() => { setShowExcluded((v) => !v); setShowShips(false); setShowDetail(false); }}
              style={{ fontSize: 11, padding: "2px 8px", borderRadius: "var(--radius)", border: "0.5px solid var(--text-warning)", background: "transparent", color: "var(--text-warning)", cursor: "pointer" }}
            >
              除外艦 {excludedShipNames.length}
            </button>
            {showExcluded && (
              <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, background: "var(--surface-2)", border: "0.5px solid var(--border-strong)", borderRadius: "var(--radius)", padding: "10px 14px", zIndex: 10, whiteSpace: "nowrap", fontSize: 13, boxShadow: "0 2px 8px rgba(0,0,0,0.12)" }}>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>旗艦にすべきでない艦</div>
                {excludedShipNames.map((name) => <div key={name} style={{ lineHeight: 1.8 }}>{name}</div>)}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ background: "var(--surface-1)", borderRadius: "var(--radius)", padding: "8px 12px", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 3 }}>投入資源</div>
            <div style={{ fontSize: 14 }}>燃{resources.fuel} 弾{resources.ammo} 鋼{resources.steel} ボ{resources.bauxite}</div>
          </div>
          <div style={{ display: "flex", gap: 20, textAlign: "right" }}>
            <div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 3 }}>対象開発率</div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{(successRate * 100).toFixed(1)}%</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 3 }}>開発失敗率</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-warning)" }}>{(failRate * 100).toFixed(1)}%</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ background: "var(--surface-1)", borderRadius: "var(--radius)", padding: "10px 12px", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>装備別開発率</div>
          <div style={{ position: "relative" }}>
            <button
              onClick={() => { setShowDetail((v) => !v); setShowShips(false); }}
              style={{ fontSize: 12, padding: "2px 10px", borderRadius: "var(--radius)", border: "0.5px solid var(--border-strong)", background: "transparent", color: "var(--text-secondary)", cursor: "pointer" }}
            >
              詳細
            </button>
            {showDetail && (
              <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, background: "var(--surface-2)", border: "0.5px solid var(--border-strong)", borderRadius: "var(--radius)", padding: "12px 16px", zIndex: 10, minWidth: 220, fontSize: 13, boxShadow: "0 2px 8px rgba(0,0,0,0.12)" }}>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>全開発可能装備</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {allSlots.filter((x) => isTarget(x.eq.id)).map(({ eq, slots }) => (
                    <div key={eq.id} style={{ display: "flex", justifyContent: "space-between", gap: 20, color: "var(--text-accent)", fontWeight: 500 }}>
                      <span>{eq.name}</span><span>{(slots / 50 * 100).toFixed(0)}%</span>
                    </div>
                  ))}
                  {allSlots.some((x) => !isTarget(x.eq.id)) && (
                    <div style={{ borderTop: "0.5px solid var(--border)", margin: "4px 0" }} />
                  )}
                  {allSlots.filter((x) => !isTarget(x.eq.id)).map(({ eq, slots }) => (
                    <div key={eq.id} style={{ display: "flex", justifyContent: "space-between", gap: 20, color: "var(--text-primary)" }}>
                      <span>{eq.name}</span><span>{(slots / 50 * 100).toFixed(0)}%</span>
                    </div>
                  ))}
                  {failRate > 0 && (
                    <>
                      <div style={{ borderTop: "0.5px solid var(--border)", margin: "4px 0" }} />
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 20, color: "var(--text-muted)" }}>
                        <span>開発失敗</span><span>{(failRate * 100).toFixed(0)}%</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {targets.map((eq) => {
            const slots = slotMap[eq.id] || 0;
            const pct = slots / 50 * 100;
            return (
              <div key={eq.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13, color: "var(--text-secondary)", minWidth: 110 }}>{eq.name}</span>
                <div style={{ flex: 1, height: 5, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: "var(--fill-accent)" }} />
                </div>
                <span style={{ fontSize: 13, minWidth: 32, textAlign: "right" }}>{pct.toFixed(0)}%</span>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ borderTop: "0.5px solid var(--border)", paddingTop: 10, fontSize: 13, color: "var(--text-secondary)" }}>
        期待消費：燃{expectedCost.fuel.toFixed(0)} 弾{expectedCost.ammo.toFixed(0)} 鋼{expectedCost.steel.toFixed(0)} ボ{expectedCost.bauxite.toFixed(0)}{" "}
        <span style={{ color: "var(--text-accent)" }}>資材{expectedCost.devmat.toFixed(1)}</span>
      </div>
    </div>
  );
}
