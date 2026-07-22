import { useId, useMemo, useState } from "react";
import { fmtMoneyIn } from "../../lib/money";
import type { NetWorthSnapshot } from "../../types";

// Mismo frame de diseño 1280×720 (2× a 2560×1440) que Home/Café/Finanzas — `--s`
// lo pone FinanzasView en la raíz y cascadea hasta acá.
function fluid(base: number): string {
  return `calc(var(--s, 2) * ${base}px)`;
}

type RangeId = "3" | "12" | "60" | "120";

const RANGE_OPTIONS: { id: RangeId; label: string }[] = [
  { id: "3", label: "Trimestre" },
  { id: "12", label: "Año" },
  { id: "60", label: "5 años" },
  { id: "120", label: "Década" },
];

const W = 720;
const H = 150;
const PADX = 24;
const PADT = 10;
const PADB = 10;
const MAX_LABELS = 8;

function monthShort(yyyymm: string): string {
  const [, m] = yyyymm.split("-").map(Number);
  return ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][m - 1] ?? "";
}

export function NetWorthChart({
  snapshots,
  baseCurrency,
}: {
  snapshots: NetWorthSnapshot[];
  baseCurrency: string;
}) {
  const [range, setRange] = useState<RangeId>("12");
  const gradId = useId();

  const sorted = useMemo(() => [...snapshots].sort((a, b) => a.month.localeCompare(b.month)), [snapshots]);
  const points = useMemo(() => sorted.slice(-Number(range)), [sorted, range]);

  const chart = useMemo(() => {
    if (points.length < 2) return null;
    const amounts = points.map((p) => p.amount);
    const lo = Math.min(...amounts) * 0.985;
    const hi = Math.max(...amounts) * 1.01;
    const span = hi - lo || 1;
    const xOf = (i: number) => PADX + (i / (points.length - 1)) * (W - PADX * 2);
    const yOf = (v: number) => PADT + (1 - (v - lo) / span) * (H - PADT - PADB);
    const coords = points.map((p, i) => `${xOf(i).toFixed(1)},${yOf(p.amount).toFixed(1)}`);
    const linePath = `M ${coords.join(" L ")}`;
    const areaPath = `M ${xOf(0).toFixed(1)},${(H - PADB).toFixed(1)} L ${coords.join(" L ")} L ${xOf(points.length - 1).toFixed(1)},${(H - PADB).toFixed(1)} Z`;
    const labelStep = Math.max(1, Math.ceil(points.length / MAX_LABELS));
    const labels = points
      .map((p, i) => ({ m: monthShort(p.month), x: xOf(i) }))
      .filter((_, i) => i % labelStep === 0 || i === points.length - 1);
    const delta = points[points.length - 1].amount - points[0].amount;
    return { linePath, areaPath, labels, delta };
  }, [points]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: fluid(8) }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: fluid(6) }}>
        <span style={{ fontSize: fluid(11), textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600, color: "var(--fg-muted)" }}>
          Evolución · {RANGE_OPTIONS.find((r) => r.id === range)?.label}
        </span>
        {chart && (
          <span style={{ fontSize: fluid(11), color: chart.delta >= 0 ? "var(--ok)" : "var(--danger)", fontWeight: 600 }}>
            {chart.delta >= 0 ? "+" : ""}{fmtMoneyIn(chart.delta, baseCurrency)}
          </span>
        )}
        <div style={{ display: "flex", gap: fluid(4) }}>
          {RANGE_OPTIONS.map((r) => (
            <button
              key={r.id}
              className="btn ghost"
              style={{
                fontSize: fluid(11),
                padding: `${fluid(3)} ${fluid(9)}`,
                ...(range === r.id ? { borderColor: "var(--accent)", color: "var(--accent)" } : undefined),
              }}
              onClick={() => setRange(r.id)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      {!chart ? (
        <div style={{ padding: `${fluid(20)} ${fluid(12)}`, textAlign: "center", fontSize: fluid(12), color: "var(--fg-subtle)", border: "1px dashed var(--line)", borderRadius: fluid(8) }}>
          Todavia no hay suficiente historial (se guarda un dato por mes, a partir del mes que viene).
        </div>
      ) : (
        <div>
          {/* preserveAspectRatio="none" stira el path para llenar el ancho de la card —
              bien para una linea, pero deforma glifos de texto. Por eso las etiquetas de
              mes van afuera del SVG, como HTML posicionado por %, sin escalar con el chart. */}
          <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: fluid(120), display: "block" }}>
            <path d={chart.areaPath} fill={`url(#${gradId})`} opacity={0.5} />
            <path d={chart.linePath} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.28} />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
          </svg>
          <div style={{ position: "relative", height: fluid(14) }}>
            {chart.labels.map((l, i) => (
              <span
                key={i}
                style={{
                  position: "absolute", left: `${(l.x / W) * 100}%`, top: 0, transform: "translateX(-50%)",
                  fontSize: fluid(10), color: "var(--fg-subtle)", whiteSpace: "nowrap",
                }}
              >
                {l.m}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
