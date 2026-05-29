import { useState } from "react";
import { colorsForHue } from "../lib/categoryColor";
import { fmtMoney } from "../lib/money";
import type { Expense, ExpenseCategory } from "../types";

interface Props {
  expenses: Expense[];
  categories: ExpenseCategory[];
}

interface Slice {
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

export function SpendingPie({ expenses, categories }: Props) {
  const [hover, setHover] = useState<number | null>(null);

  const buckets = new Map<string | "_uncat", number>();
  for (const e of expenses) {
    const key = e.categoryId ?? "_uncat";
    buckets.set(key, (buckets.get(key) ?? 0) + e.amount);
  }

  const total = [...buckets.values()].reduce((s, n) => s + n, 0);

  const slices: Slice[] = [];
  let acc = 0;
  // ordered by category position, uncategorized last
  const ordered = [...categories]
    .filter((c) => !c.archived)
    .sort((a, b) => a.position - b.position);
  for (const cat of ordered) {
    const amount = buckets.get(cat.id) ?? 0;
    if (amount <= 0) continue;
    const start = total > 0 ? (acc / total) * Math.PI * 2 : 0;
    acc += amount;
    const end = total > 0 ? (acc / total) * Math.PI * 2 : 0;
    slices.push({ cat, amount, start, end });
  }
  const uncatAmount = buckets.get("_uncat") ?? 0;
  if (uncatAmount > 0) {
    const start = total > 0 ? (acc / total) * Math.PI * 2 : 0;
    acc += uncatAmount;
    const end = total > 0 ? (acc / total) * Math.PI * 2 : 0;
    slices.push({ cat: null, amount: uncatAmount, start, end });
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

  const hoverSlice = hover != null ? slices[hover] : null;
  const hoverColors = hoverSlice?.cat
    ? colorsForHue(hoverSlice.cat.hue)
    : null;

  return (
    <div>
      <div
        style={{
          display: "grid",
          placeItems: "center",
          position: "relative",
          marginBottom: 12,
        }}
      >
        <svg width={SIZE} height={SIZE} style={{ display: "block", overflow: "visible" }}>
          <circle
            cx={CX}
            cy={CY}
            r={(R_OUT + R_IN) / 2}
            fill="none"
            stroke="var(--bg-sunken)"
            strokeWidth={R_OUT - R_IN}
          />
          {slices.map((s, i) => {
            const colors = s.cat ? colorsForHue(s.cat.hue) : { bg: "var(--line-strong)" };
            const isSingle = slices.length === 1;
            if (isSingle) {
              return (
                <circle
                  key={`s-${i}`}
                  cx={CX}
                  cy={CY}
                  r={(R_OUT + R_IN) / 2}
                  fill="none"
                  stroke={colors.bg}
                  strokeWidth={R_OUT - R_IN}
                  onMouseEnter={() => setHover(0)}
                  onMouseLeave={() => setHover(null)}
                  style={{
                    cursor: "pointer",
                    opacity: hover != null && hover !== 0 ? 0.4 : 1,
                    transition: "opacity .15s",
                  }}
                />
              );
            }
            return (
              <path
                key={`s-${i}`}
                d={arcPath(s.start, s.end, R_OUT, R_IN)}
                fill={colors.bg}
                stroke="var(--bg-elev)"
                strokeWidth={1.5}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                style={{
                  cursor: "pointer",
                  opacity: hover != null && hover !== i ? 0.4 : 1,
                  transition: "opacity .15s",
                }}
              />
            );
          })}
        </svg>
        <div style={{ position: "absolute", textAlign: "center", pointerEvents: "none" }}>
          <div
            style={{
              fontSize: 18,
              fontWeight: 600,
              letterSpacing: "-0.02em",
              fontVariantNumeric: "tabular-nums",
              color: hoverColors ? "var(--fg)" : "var(--fg)",
            }}
          >
            {fmtMoney(hoverSlice ? hoverSlice.amount : total, { compact: true })}
          </div>
          <div
            style={{
              fontSize: 10,
              color: "var(--fg-subtle)",
              textTransform: "uppercase",
              letterSpacing: ".06em",
              marginTop: 2,
            }}
          >
            {hoverSlice ? hoverSlice.cat?.name ?? "Uncategorized" : "spent"}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {slices.map((s, i) => {
          const colors = s.cat ? colorsForHue(s.cat.hue) : { bg: "var(--line-strong)", fg: "var(--fg-muted)" };
          const pct = total > 0 ? Math.round((s.amount / total) * 100) : 0;
          const isHover = hover === i;
          return (
            <div
              key={`row-${i}`}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              style={{
                display: "grid",
                gridTemplateColumns: "10px 1fr auto auto",
                gap: 8,
                alignItems: "center",
                fontSize: 12.5,
                padding: "4px 6px",
                borderRadius: 5,
                background: isHover ? colors.bg : "transparent",
                color: isHover ? colors.fg : "var(--fg)",
                cursor: "pointer",
                transition: "background .15s, color .15s",
              }}
            >
              <span
                style={{ width: 10, height: 10, borderRadius: 3, background: colors.bg }}
              />
              <span
                style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              >
                {s.cat?.name ?? "Uncategorized"}
              </span>
              <span
                style={{
                  fontVariantNumeric: "tabular-nums",
                  fontSize: 11.5,
                  color: isHover ? "inherit" : "var(--fg-muted)",
                }}
              >
                {fmtMoney(s.amount)}
              </span>
              <span
                style={{
                  fontVariantNumeric: "tabular-nums",
                  fontSize: 11,
                  color: isHover ? "inherit" : "var(--fg-subtle)",
                  minWidth: 28,
                  textAlign: "right",
                }}
              >
                {pct}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
