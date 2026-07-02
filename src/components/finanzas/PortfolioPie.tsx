import { useState } from "react";
import { colorsForHue } from "../../lib/categoryColor";
import { fmtMoneyIn } from "../../lib/money";

export interface PortfolioItem {
  id: string;
  name: string;
  amount: number; // already converted to the display currency
}

const SIZE = 160;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R_OUT = 74;
const R_IN = 48;

function arcPath(start: number, end: number, ro: number, ri: number): string {
  if (Math.abs(end - start) < 0.0001) return "";
  const a0 = start - Math.PI / 2;
  const a1 = end - Math.PI / 2;
  const large = end - start > Math.PI ? 1 : 0;
  const x0 = CX + ro * Math.cos(a0);
  const y0 = CY + ro * Math.sin(a0);
  const x1 = CX + ro * Math.cos(a1);
  const y1 = CY + ro * Math.sin(a1);
  const xi1 = CX + ri * Math.cos(a1);
  const yi1 = CY + ri * Math.sin(a1);
  const xi0 = CX + ri * Math.cos(a0);
  const yi0 = CY + ri * Math.sin(a0);
  return [
    `M ${x0} ${y0}`,
    `A ${ro} ${ro} 0 ${large} 1 ${x1} ${y1}`,
    `L ${xi1} ${yi1}`,
    `A ${ri} ${ri} 0 ${large} 0 ${xi0} ${yi0}`,
    "Z",
  ].join(" ");
}

/** Deterministic hue from an id string, so each account keeps a stable color
 *  across renders without needing a stored hue field. */
function hueForId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}

/** Portfolio composition donut — how the investment/broker accounts split up,
 *  same visual language as SpendingPie but for account balances, not expenses. */
export function PortfolioPie({ items, currency }: { items: PortfolioItem[]; currency: string }) {
  const [hoverId, setHoverId] = useState<string | null>(null);

  const positive = items.filter((i) => i.amount > 0);
  const total = positive.reduce((s, i) => s + i.amount, 0);

  let acc = 0;
  const slices = positive.map((item) => {
    const start = total > 0 ? (acc / total) * Math.PI * 2 : 0;
    acc += item.amount;
    const end = total > 0 ? (acc / total) * Math.PI * 2 : 0;
    return { ...item, start, end, hue: hueForId(item.id) };
  });

  const hoverItem = slices.find((s) => s.id === hoverId) ?? null;

  if (items.length === 0) {
    return (
      <div style={{ fontSize: 12.5, color: "var(--fg-subtle)", padding: "16px 2px" }}>
        Todavia no hay cuentas de inversion. Marca una cuenta como tipo "Inversion" o "Broker" para verla aca.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
      <div style={{ position: "relative", width: SIZE, height: SIZE, flex: "0 0 auto" }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ display: "block", overflow: "visible" }}>
          <circle cx={CX} cy={CY} r={(R_OUT + R_IN) / 2} fill="none" stroke="var(--bg-sunken)" strokeWidth={R_OUT - R_IN} />
          {slices.length === 1 ? (
            <circle
              cx={CX}
              cy={CY}
              r={(R_OUT + R_IN) / 2}
              fill="none"
              stroke={colorsForHue(slices[0].hue).bg}
              strokeWidth={R_OUT - R_IN}
              onMouseEnter={() => setHoverId(slices[0].id)}
              onMouseLeave={() => setHoverId(null)}
              style={{ cursor: "pointer" }}
            />
          ) : (
            slices.map((s) => (
              <path
                key={s.id}
                d={arcPath(s.start, s.end, R_OUT, R_IN)}
                fill={colorsForHue(s.hue).bg}
                stroke="var(--bg-elev)"
                strokeWidth={1.5}
                onMouseEnter={() => setHoverId(s.id)}
                onMouseLeave={() => setHoverId(null)}
                style={{ cursor: "pointer", opacity: hoverId && hoverId !== s.id ? 0.4 : 1, transition: "opacity .15s" }}
              />
            ))
          )}
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center", pointerEvents: "none" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>
              {fmtMoneyIn(hoverItem ? hoverItem.amount : total, currency)}
            </div>
            <div style={{ fontSize: 9.5, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: ".05em", marginTop: 2 }}>
              {hoverItem ? hoverItem.name : "portfolio"}
            </div>
          </div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1, minWidth: 140 }}>
        {slices.map((s) => {
          const pct = total > 0 ? Math.round((s.amount / total) * 100) : 0;
          const colors = colorsForHue(s.hue);
          const isHover = hoverId === s.id;
          return (
            <div
              key={s.id}
              onMouseEnter={() => setHoverId(s.id)}
              onMouseLeave={() => setHoverId(null)}
              style={{
                display: "grid",
                gridTemplateColumns: "8px minmax(0,1fr) auto auto",
                gap: 8,
                alignItems: "center",
                fontSize: 12,
                padding: "3px 6px",
                borderRadius: 5,
                background: isHover ? colors.bg : "transparent",
                transition: "background .15s",
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: 3, background: colors.bg }} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
              <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--fg-muted)" }}>{fmtMoneyIn(s.amount, currency)}</span>
              <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--fg-subtle)", minWidth: 32, textAlign: "right" }}>{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
