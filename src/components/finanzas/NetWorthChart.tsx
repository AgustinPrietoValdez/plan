import { useMemo, useState } from "react";
import { fmtMoneyIn } from "../../lib/money";
import type { NetWorthSnapshot } from "../../types";

type RangeId = "3" | "12" | "60" | "120";

const RANGE_OPTIONS: { id: RangeId; label: string }[] = [
  { id: "3", label: "Trimestre" },
  { id: "12", label: "Año" },
  { id: "60", label: "5 años" },
  { id: "120", label: "Década" },
];

const W = 560;
const H = 130;
const PAD = 20;

export function NetWorthChart({
  snapshots,
  baseCurrency,
}: {
  snapshots: NetWorthSnapshot[];
  baseCurrency: string;
}) {
  const [range, setRange] = useState<RangeId>("12");

  const sorted = useMemo(() => [...snapshots].sort((a, b) => a.month.localeCompare(b.month)), [snapshots]);
  const points = useMemo(() => sorted.slice(-Number(range)), [sorted, range]);

  const { path, min, max } = useMemo(() => {
    if (points.length < 2) return { path: "", min: 0, max: 0 };
    const amounts = points.map((p) => p.amount);
    const lo = Math.min(...amounts);
    const hi = Math.max(...amounts);
    const span = hi - lo || 1;
    const coords = points.map((p, i) => {
      const x = PAD + (i / (points.length - 1)) * (W - PAD * 2);
      const y = PAD + (1 - (p.amount - lo) / span) * (H - PAD * 2);
      return `${x},${y}`;
    });
    return { path: `M ${coords.join(" L ")}`, min: lo, max: hi };
  }, [points]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 4 }}>
        {RANGE_OPTIONS.map((r) => (
          <button
            key={r.id}
            className="btn ghost"
            style={{
              fontSize: 11,
              padding: "3px 9px",
              ...(range === r.id ? { borderColor: "var(--accent)", color: "var(--accent)" } : undefined),
            }}
            onClick={() => setRange(r.id)}
          >
            {r.label}
          </button>
        ))}
      </div>
      {points.length < 2 ? (
        <div
          style={{
            padding: "20px 12px",
            textAlign: "center",
            fontSize: 12,
            color: "var(--fg-subtle)",
            border: "1px dashed var(--line)",
            borderRadius: 8,
          }}
        >
          Todavia no hay suficiente historial (se guarda un dato por mes, a partir del mes que viene).
        </div>
      ) : (
        <div>
          <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block" }}>
            <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2} />
          </svg>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "var(--fg-subtle)" }}>
            <span>{points[0].month}</span>
            <span>
              {fmtMoneyIn(min, baseCurrency)} – {fmtMoneyIn(max, baseCurrency)}
            </span>
            <span>{points[points.length - 1].month}</span>
          </div>
        </div>
      )}
    </div>
  );
}
