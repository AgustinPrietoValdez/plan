import { useState } from "react";
import { colorsForHue } from "../lib/categoryColor";
import { fmtMoney } from "../lib/money";
import type { Expense, ExpenseCategory } from "../types";

interface Props {
  expenses: Expense[];
  categories: ExpenseCategory[];
  /** "column" (default): pie above the category legend. "row": pie beside it. */
  layout?: "column" | "row";
  /** Rendered pie diameter in px (default 200). Internal coords stay at 200 via viewBox. */
  size?: number;
  /** Budget cap. When set, % column shows amount/limit instead of amount/total. */
  limit?: number;
}

interface Slice {
  id: string;
  cat: ExpenseCategory | null;
  amount: number;
  start: number;
  end: number;
}

const SIZE = 200;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R_OUT = 92;
const R_IN = 60;

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

export function SpendingPie({ expenses, categories, layout = "column", size = SIZE, limit }: Props) {
  const [hoverId, setHoverId] = useState<string | null>(null);
  const row = layout === "row";

  const buckets = new Map<string, number>();
  for (const e of expenses) {
    const key = e.categoryId ?? "_uncat";
    buckets.set(key, (buckets.get(key) ?? 0) + e.amount);
  }

  const total = [...buckets.values()].reduce((s, n) => s + n, 0);
  const uncatAmount = buckets.get("_uncat") ?? 0;

  const ordered = [...categories]
    .filter((c) => !c.archived)
    .sort((a, b) => a.position - b.position);

  // Legend: ALL non-archived categories + uncategorized if any spending
  const legendItems: Array<{ id: string; cat: ExpenseCategory | null; amount: number }> = [
    ...ordered.map((cat) => ({ id: cat.id, cat, amount: buckets.get(cat.id) ?? 0 })),
    ...(uncatAmount > 0 ? [{ id: "_uncat", cat: null, amount: uncatAmount }] : []),
  ];

  // Pie slices: only categories with spending (for drawing arcs)
  const pieSlices: Slice[] = [];
  let acc = 0;
  for (const item of legendItems) {
    if (item.amount <= 0) continue;
    const start = total > 0 ? (acc / total) * Math.PI * 2 : 0;
    acc += item.amount;
    const end = total > 0 ? (acc / total) * Math.PI * 2 : 0;
    pieSlices.push({ id: item.id, cat: item.cat, amount: item.amount, start, end });
  }

  if (total === 0) {
    return (
      <div
        style={{
          padding: "32px 12px",
          textAlign: "center",
          fontSize: 12.5,
          color: "var(--fg-subtle)",
          border: "1px dashed var(--line)",
          borderRadius: 10,
        }}
      >
        No expenses this month yet.
      </div>
    );
  }

  const hoverSlice = hoverId != null ? pieSlices.find((s) => s.id === hoverId) ?? null : null;

  return (
    <div style={row ? { display: "flex", gap: 16, alignItems: "center", flex: 1, minHeight: 0 } : undefined}>
      {/* Pie chart */}
      <div
        style={row ? {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          flex: "0 0 auto",
          height: "min(100%, max(100px, 22vw))",
          aspectRatio: "1 / 1",
        } : {
          display: "grid",
          placeItems: "center",
          position: "relative",
          marginBottom: 12,
          flex: "0 0 auto",
        }}
      >
        <svg width={row ? "100%" : size} height={row ? "100%" : size} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ display: "block", overflow: "visible" }}>
          <circle
            cx={CX}
            cy={CY}
            r={(R_OUT + R_IN) / 2}
            fill="none"
            stroke="var(--bg-sunken)"
            strokeWidth={R_OUT - R_IN}
          />
          {pieSlices.map((s) => {
            const colors = s.cat ? colorsForHue(s.cat.hue) : { bg: "var(--line-strong)" };
            const isSingle = pieSlices.length === 1;
            const dimmed = hoverId !== null && hoverId !== s.id;
            if (isSingle) {
              return (
                <circle
                  key={s.id}
                  cx={CX}
                  cy={CY}
                  r={(R_OUT + R_IN) / 2}
                  fill="none"
                  stroke={colors.bg}
                  strokeWidth={R_OUT - R_IN}
                  onMouseEnter={() => setHoverId(s.id)}
                  onMouseLeave={() => setHoverId(null)}
                  style={{ cursor: "pointer", opacity: dimmed ? 0.4 : 1, transition: "opacity .15s" }}
                />
              );
            }
            return (
              <path
                key={s.id}
                d={arcPath(s.start, s.end, R_OUT, R_IN)}
                fill={colors.bg}
                stroke="var(--bg-elev)"
                strokeWidth={1.5}
                onMouseEnter={() => setHoverId(s.id)}
                onMouseLeave={() => setHoverId(null)}
                style={{ cursor: "pointer", opacity: dimmed ? 0.4 : 1, transition: "opacity .15s" }}
              />
            );
          })}
        </svg>
        <div style={{ position: "absolute", textAlign: "center", pointerEvents: "none" }}>
          <div style={{ fontSize: "clamp(14px, 1.3vw, 22px)", fontWeight: 600, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums", color: "var(--fg)" }}>
            {fmtMoney(hoverSlice ? hoverSlice.amount : total, { compact: true })}
          </div>
          <div style={{ fontSize: "clamp(9px, 0.65vw, 12px)", color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: ".06em", marginTop: 2 }}>
            {hoverSlice ? hoverSlice.cat?.name ?? "Uncategorized" : "spent"}
          </div>
        </div>
      </div>

      {/* Legend: all categories */}
      <div style={{ display: "flex", flexDirection: "column", gap: "clamp(2px, 0.3vw, 4px)", flex: row ? 1 : undefined, minWidth: 0, overflowY: row ? "auto" : undefined, ...(row ? { alignSelf: "stretch", justifyContent: "center" } : {}) }}>
        {legendItems.map((item) => {
          const colors = item.cat ? colorsForHue(item.cat.hue) : { bg: "var(--line-strong)", fg: "var(--fg-muted)" };
          const pct = limit && limit > 0
            ? Math.round((item.amount / limit) * 100)
            : total > 0 ? Math.round((item.amount / total) * 100) : 0;
          const isHover = hoverId === item.id;
          const dimmed = item.amount === 0;
          return (
            <div
              key={item.id}
              onMouseEnter={() => setHoverId(item.id)}
              onMouseLeave={() => setHoverId(null)}
              style={{
                display: "grid",
                gridTemplateColumns: "clamp(6px,0.5vw,12px) 1fr auto auto",
                gap: "clamp(3px,0.4vw,8px)",
                alignItems: "center",
                fontSize: "clamp(9px, 0.85vw, 14px)",
                padding: "clamp(2px,0.25vw,4px) clamp(3px,0.4vw,6px)",
                borderRadius: 5,
                background: isHover ? colors.bg : "transparent",
                color: isHover ? colors.fg : dimmed ? "var(--fg-subtle)" : "var(--fg)",
                cursor: "pointer",
                opacity: dimmed ? 0.5 : 1,
                transition: "background .15s, color .15s",
              }}
            >
              <span style={{ width: "clamp(6px,0.5vw,12px)", height: "clamp(6px,0.5vw,12px)", borderRadius: 3, background: colors.bg, opacity: dimmed ? 0.4 : 1 }} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {item.cat?.name ?? "Uncategorized"}
              </span>
              <span style={{ fontVariantNumeric: "tabular-nums", fontSize: "clamp(8px,0.75vw,13px)", color: isHover ? "inherit" : "var(--fg-muted)" }}>
                {item.amount > 0 ? fmtMoney(item.amount) : "—"}
              </span>
              <span style={{ fontVariantNumeric: "tabular-nums", fontSize: "clamp(8px,0.7vw,12px)", color: isHover ? "inherit" : "var(--fg-subtle)", minWidth: "clamp(20px,1.6vw,36px)", textAlign: "right" }}>
                {item.amount > 0 ? `${pct}%` : "—"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
