import { useState } from "react";
import { categoryFor } from "../lib/categoryFor";
import { colorsForCategory } from "../lib/categoryColor";
import { fmtDuration } from "../lib/format";
import type { Category, Project, Task } from "../types";

interface Bucket {
  cat: Category;
  est: number;
  act: number;
  hasActual: boolean;
}

interface Arc extends Bucket {
  start: number;
  end: number;
}

interface Props {
  tasks: Task[];
  projects: Project[];
  categories: Category[];
}

const SIZE = 200;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R_OUT = 92;
const R_OUT_IN = 70;
const R_EST = 64;
const R_EST_IN = 44;

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

export function CategoryPie({ tasks, projects, categories }: Props) {
  const [hover, setHover] = useState<number | null>(null);

  const buckets: Record<string, Bucket> = {};
  tasks.forEach((t) => {
    const c = categoryFor(t, categories, projects);
    if (!c) return;
    const b = buckets[c.id] ?? { cat: c, est: 0, act: 0, hasActual: false };
    b.est += t.duration || 0;
    if (typeof t.actualDuration === "number") {
      b.act += t.actualDuration;
      b.hasActual = true;
    } else {
      b.act += t.duration || 0;
    }
    buckets[c.id] = b;
  });

  const slices: Bucket[] = categories
    .filter((c) => !c.archived)
    .map((c) => buckets[c.id] ?? { cat: c, est: 0, act: 0, hasActual: false })
    .filter((s) => s.act > 0)
    .sort((a, b) => b.act - a.act);

  const sumEst = slices.reduce((s, x) => s + x.est, 0);
  const sumAct = slices.reduce((s, x) => s + x.act, 0);

  let accA = 0;
  const outerArcs: Arc[] = slices.map((s) => {
    const start = sumAct > 0 ? (accA / sumAct) * Math.PI * 2 : 0;
    accA += s.act;
    const end = sumAct > 0 ? (accA / sumAct) * Math.PI * 2 : 0;
    return { ...s, start, end };
  });
  let accE = 0;
  const innerArcs: Arc[] = slices.map((s) => {
    const start = sumEst > 0 ? (accE / sumEst) * Math.PI * 2 : 0;
    accE += s.est;
    const end = sumEst > 0 ? (accE / sumEst) * Math.PI * 2 : 0;
    return { ...s, start, end };
  });

  const isSingleOuter = outerArcs.length === 1 && sumAct > 0;
  const isSingleInner = innerArcs.length === 1 && sumEst > 0;

  const hoverSlice = hover != null ? outerArcs[hover] : null;
  const hoverColors = hoverSlice ? colorsForCategory(hoverSlice.cat) : null;
  const centerPrimary = hoverSlice
    ? fmtDuration(hoverSlice.act)
    : sumAct > 0
      ? fmtDuration(sumAct)
      : "0m";
  const centerSecondary = hoverSlice ? hoverSlice.cat.name : "actual today";

  return (
    <div>
      <div
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: ".05em",
          color: "var(--fg-subtle)",
          fontWeight: 600,
          marginBottom: 8,
        }}
      >
        Time by category
      </div>

      {sumAct === 0 ? (
        <div
          style={{
            padding: "24px 12px",
            textAlign: "center",
            fontSize: 12,
            color: "var(--fg-subtle)",
            border: "1px dashed var(--line)",
            borderRadius: 10,
          }}
        >
          Schedule tasks to see the breakdown.
        </div>
      ) : (
        <>
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
                r={(R_OUT + R_OUT_IN) / 2}
                fill="none"
                stroke="var(--bg-sunken)"
                strokeWidth={R_OUT - R_OUT_IN}
              />
              <circle
                cx={CX}
                cy={CY}
                r={(R_EST + R_EST_IN) / 2}
                fill="none"
                stroke="var(--bg-sunken)"
                strokeWidth={R_EST - R_EST_IN}
              />

              {outerArcs.map((a, i) => {
                if (a.act <= 0) return null;
                const colors = colorsForCategory(a.cat);
                if (isSingleOuter) {
                  return (
                    <circle
                      key={`out-${a.cat.id}`}
                      cx={CX}
                      cy={CY}
                      r={(R_OUT + R_OUT_IN) / 2}
                      fill="none"
                      stroke={colors.bg}
                      strokeWidth={R_OUT - R_OUT_IN}
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
                    key={`out-${a.cat.id}`}
                    d={arcPath(a.start, a.end, R_OUT, R_OUT_IN)}
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

              {innerArcs.map((a, i) => {
                if (a.est <= 0) return null;
                const colors = colorsForCategory(a.cat);
                if (isSingleInner) {
                  return (
                    <circle
                      key={`in-${a.cat.id}`}
                      cx={CX}
                      cy={CY}
                      r={(R_EST + R_EST_IN) / 2}
                      fill="none"
                      stroke={colors.bg}
                      strokeWidth={R_EST - R_EST_IN}
                      onMouseEnter={() => setHover(0)}
                      onMouseLeave={() => setHover(null)}
                      style={{
                        cursor: "pointer",
                        opacity: hover != null && hover !== 0 ? 0.55 : 0.7,
                        transition: "opacity .15s",
                      }}
                    />
                  );
                }
                return (
                  <path
                    key={`in-${a.cat.id}`}
                    d={arcPath(a.start, a.end, R_EST, R_EST_IN)}
                    fill={colors.bg}
                    stroke="var(--bg-elev)"
                    strokeWidth={1}
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                    style={{
                      cursor: "pointer",
                      opacity: hover != null && hover !== i ? 0.3 : 0.65,
                      transition: "opacity .15s",
                    }}
                  />
                );
              })}
            </svg>
            <div style={{ position: "absolute", textAlign: "center", pointerEvents: "none" }}>
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 600,
                  letterSpacing: "-0.02em",
                  fontVariantNumeric: "tabular-nums",
                  color: hoverColors ? hoverColors.fg : "var(--fg)",
                }}
              >
                {centerPrimary}
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
                {centerSecondary}
              </div>
              {hoverSlice &&
                hoverSlice.hasActual &&
                hoverSlice.act !== hoverSlice.est &&
                hoverSlice.est > 0 && (
                  <div
                    style={{
                      fontSize: 10.5,
                      marginTop: 3,
                      fontWeight: 600,
                      color: "var(--fg-muted)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {hoverSlice.act > hoverSlice.est ? "+" : "−"}
                    {fmtDuration(Math.abs(hoverSlice.act - hoverSlice.est))} vs plan
                  </div>
                )}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              fontSize: 10.5,
              color: "var(--fg-subtle)",
              textTransform: "uppercase",
              letterSpacing: ".05em",
              fontWeight: 500,
              marginBottom: 10,
              justifyContent: "center",
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span
                style={{ width: 14, height: 7, borderRadius: 1, background: "var(--fg-muted)" }}
              />
              actual
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span
                style={{
                  width: 14,
                  height: 7,
                  borderRadius: 1,
                  background: "var(--fg-muted)",
                  opacity: 0.55,
                }}
              />
              estimate
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {outerArcs.map((s, i) => {
              const colors = colorsForCategory(s.cat);
              const pct = sumAct > 0 ? Math.round((s.act / sumAct) * 100) : 0;
              const isHover = hover === i;
              const delta = s.act - s.est;
              const showDelta = s.hasActual && s.est > 0 && delta !== 0;
              return (
                <div
                  key={s.cat.id}
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
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 3,
                      background: colors.bg,
                      border: isHover ? "1px solid rgba(0,0,0,0.08)" : "0",
                    }}
                  />
                  <span
                    style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  >
                    {s.cat.name}
                  </span>
                  <span
                    style={{
                      fontVariantNumeric: "tabular-nums",
                      fontSize: 11.5,
                      color: isHover ? "inherit" : "var(--fg-muted)",
                    }}
                  >
                    {fmtDuration(s.act)}
                    {showDelta && (
                      <span style={{ marginLeft: 4, fontSize: 10.5, fontWeight: 500, opacity: 0.75 }}>
                        ({delta > 0 ? "+" : "−"}
                        {Math.abs(delta)}m)
                      </span>
                    )}
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
        </>
      )}
    </div>
  );
}
