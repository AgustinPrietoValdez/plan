import { useEffect, useRef, useState } from "react";
import { colorsForHue } from "../lib/categoryColor";
import { fmtMoney } from "../lib/money";
import type { Expense, ExpenseCategory } from "../types";

interface CategoryBudget {
  categoryId: string | null;
  monthlyAmount: number;
}

interface Props {
  expenses: Expense[];
  categories: ExpenseCategory[];
  /** "column" (default): pie above the category legend. "row": pie beside it. */
  layout?: "column" | "row";
  /** Rendered pie diameter in px (default 200). Internal coords stay at 200 via viewBox. */
  size?: number;
  /** Budget cap. When set, % column shows amount/limit instead of amount/total. */
  limit?: number;
  /** Per-category budgets. When set, shows "spent / budget" in the legend and colors over-budget amounts red. */
  budgets?: CategoryBudget[];
  /** Row layout only. true (default): fill available height + center (card usage).
   *  false: hug content at the top, size pie by viewport width (pinned-header usage). */
  fill?: boolean;
  /** Pinned-pie only: target pie size (px) = 40% of the column height. Keeps the
   *  pie at a fixed share of the height and leaves room for the expenses below. */
  sizePx?: number;
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

export function SpendingPie({ expenses, categories, layout = "column", size = SIZE, limit, budgets, fill = true, sizePx }: Props) {
  const [hoverId, setHoverId] = useState<string | null>(null);
  const row = layout === "row";

  // Pinned-pie (row + !fill): size the pie from the actual container width so it
  // grows when the window opens, and drop the legend before names/numbers collide.
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [rootW, setRootW] = useState<number | null>(null);
  useEffect(() => {
    if (!row || fill) return;
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setRootW(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [row, fill]);
  // Below this container width the legend would get cramped -> show pie only.
  const showLegend = !row || fill || rootW === null || rootW >= 420;
  // Pie size = a fixed target (40% of the column height, passed as sizePx) so it
  // stays the same whether the legend is shown or hidden (no size jump), capped by
  // the container width so it never overflows when narrow.
  const pieSize = rootW === null
    ? null
    : Math.max(120, Math.min(sizePx ?? rootW * 0.45, rootW));

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
    <div ref={rootRef} style={row ? (fill
      ? { display: "flex", gap: 16, alignItems: "center", flex: 1, minHeight: 0 }
      : { display: "flex", gap: 16, alignItems: "center", justifyContent: "flex-start" }) : undefined}>
      {/* Pie chart */}
      <div
        style={row ? {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          aspectRatio: "1 / 1",
          ...(fill
            ? { flex: "0 0 auto", height: "min(100%, max(100px, 22vw))" }
            : { flex: "0 0 auto", width: pieSize != null ? `${pieSize}px` : "min(100%, 240px)" }),
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

      {/* Legend: all categories (hidden when too narrow -> pie only) */}
      {showLegend && (
      <div style={{ display: "flex", flexDirection: "column", gap: "clamp(2px, 0.3vw, 4px)", flex: row ? (fill ? 1 : "0 1 auto") : undefined, minWidth: 0, overflowY: row ? "auto" : undefined, ...(row && fill ? { alignSelf: "stretch", justifyContent: "center" } : (row ? { maxHeight: pieSize != null ? pieSize : undefined } : {})) }}>
        {legendItems.map((item) => {
          const colors = item.cat ? colorsForHue(item.cat.hue) : { bg: "var(--line-strong)", fg: "var(--fg-muted)" };
          const pct = limit && limit > 0
            ? Math.round((item.amount / limit) * 100)
            : total > 0 ? Math.round((item.amount / total) * 100) : 0;
          const isHover = hoverId === item.id;
          const dimmed = item.amount === 0;
          const catBudget = budgets?.find((b) => b.categoryId === item.id);
          const isOver = catBudget != null && item.amount > catBudget.monthlyAmount;
          return (
            <div
              key={item.id}
              onMouseEnter={() => setHoverId(item.id)}
              onMouseLeave={() => setHoverId(null)}
              style={{
                display: "grid",
                gridTemplateColumns: "clamp(8px,0.6vw,14px) clamp(70px,7vw,200px) auto auto",
                gap: "clamp(6px,0.6vw,12px)",
                alignItems: "center",
                fontSize: "clamp(11px, 1.1vw, 18px)",
                padding: "clamp(2px,0.3vw,5px) clamp(3px,0.4vw,7px)",
                borderRadius: 5,
                background: isHover ? colors.bg : "transparent",
                color: isHover ? colors.fg : dimmed ? "var(--fg-subtle)" : "var(--fg)",
                cursor: "pointer",
                opacity: dimmed ? 0.5 : 1,
                transition: "background .15s, color .15s",
              }}
            >
              <span style={{ width: "clamp(8px,0.6vw,14px)", height: "clamp(8px,0.6vw,14px)", borderRadius: 3, background: colors.bg, opacity: dimmed ? 0.4 : 1 }} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {item.cat?.name ?? "Uncategorized"}
              </span>
              <span style={{ fontVariantNumeric: "tabular-nums", fontSize: "clamp(10px,1vw,16px)", color: isHover ? "inherit" : isOver ? "var(--danger)" : "var(--fg-muted)" }}>
                {item.amount > 0 ? fmtMoney(item.amount) : "—"}
                {catBudget != null && (
                  <span style={{ color: isHover ? "inherit" : "var(--fg-subtle)", opacity: 0.7 }}>
                    {" / "}{fmtMoney(catBudget.monthlyAmount)}
                  </span>
                )}
              </span>
              <span style={{ fontVariantNumeric: "tabular-nums", fontSize: "clamp(9px,0.9vw,15px)", color: isHover ? "inherit" : "var(--fg-subtle)", minWidth: "clamp(24px,1.8vw,42px)", textAlign: "right" }}>
                {item.amount > 0 ? `${pct}%` : "—"}
              </span>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}
