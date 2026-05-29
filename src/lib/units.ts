// Units for the Compras module. Quantities are always stored in a base unit
// per dimension: weight→grams, volume→millilitres, count→units. The UI converts
// to kg/L for display. Count quantities may be fractional (1/4, 1/2).

export type Dimension = "weight" | "volume" | "count";

export const DIMENSION_LABELS: Record<Dimension, string> = {
  weight: "Peso",
  volume: "Volumen",
  count: "Unidad",
};

/** Base unit symbol for a dimension. */
export function baseUnit(dim: Dimension): string {
  return dim === "weight" ? "g" : dim === "volume" ? "ml" : "u";
}

/** Parse a quantity string that may be a fraction ("1/2"), decimal ("0,5" or
 *  "0.5") or integer. Returns null if it can't be parsed. */
export function parseQuantity(input: string): number | null {
  const s = input.trim().replace(",", ".");
  if (!s) return null;
  const frac = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (frac) {
    const num = Number(frac[1]);
    const den = Number(frac[2]);
    if (den === 0) return null;
    return num / den;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const FRACTIONS: Record<number, string> = {
  0.25: "¼",
  0.5: "½",
  0.75: "¾",
};

function formatNumber(n: number): string {
  // tidy: drop trailing zeros, comma decimals (es-AR)
  const rounded = Math.round(n * 1000) / 1000;
  return rounded.toString().replace(".", ",");
}

/** Format a base-unit value for display in the most natural unit of its
 *  dimension. weight: g→kg above 1000; volume: ml→L above 1000; count: integer
 *  or nice fraction. */
export function formatQuantity(value: number, dim: Dimension): string {
  if (dim === "count") {
    const whole = Math.floor(value);
    const rem = Math.round((value - whole) * 100) / 100;
    const fr = FRACTIONS[rem];
    if (fr) return whole > 0 ? `${whole} ${fr}` : fr;
    return formatNumber(value);
  }
  if (dim === "weight") {
    return value >= 1000 ? `${formatNumber(value / 1000)} kg` : `${formatNumber(value)} g`;
  }
  // volume
  return value >= 1000 ? `${formatNumber(value / 1000)} L` : `${formatNumber(value)} ml`;
}

/** Convert a display amount + chosen unit into the base unit for storage. */
export function toBase(amount: number, unit: string): number {
  switch (unit) {
    case "kg":
    case "l":
    case "L":
      return amount * 1000;
    case "g":
    case "ml":
    case "u":
    default:
      return amount;
  }
}

/** The unit options offered in the UI for a dimension (label + multiplier to base). */
export function unitOptions(dim: Dimension): { unit: string; label: string }[] {
  if (dim === "weight") return [{ unit: "g", label: "g" }, { unit: "kg", label: "kg" }];
  if (dim === "volume") return [{ unit: "ml", label: "ml" }, { unit: "l", label: "L" }];
  return [{ unit: "u", label: "u" }];
}

export interface PresentationLike {
  id: string;
  label: string;
  size: number; // base unit
}

export interface WasteChoice {
  /** how many of each presentation, keyed by presentation id */
  counts: Map<string, number>;
  total: number; // base unit purchased
  waste: number; // base unit left over (total - needed), >= 0
}

/** Pick the combination of presentations that covers `needed` (base unit) with
 *  the least leftover. Bounded search: for each presentation cap the count so
 *  we never exceed needed by more than the largest presentation. Falls back to
 *  a single smallest presentation when nothing else fits. */
export function leastWastePresentation(
  needed: number,
  presentations: PresentationLike[],
): WasteChoice | null {
  const sizes = presentations.filter((p) => p.size > 0);
  if (sizes.length === 0 || needed <= 0) return null;

  const maxSize = Math.max(...sizes.map((p) => p.size));
  let best: WasteChoice | null = null;

  // Depth-first over presentations, capping each count so total stays bounded.
  const counts = new Map<string, number>();
  const dfs = (idx: number, total: number) => {
    if (idx === sizes.length) {
      if (total >= needed) {
        const waste = total - needed;
        if (!best || waste < best.waste || (waste === best.waste && total < best.total)) {
          best = { counts: new Map(counts), total, waste };
        }
      }
      return;
    }
    const p = sizes[idx];
    // cap: enough of this presentation to (over)reach needed, plus a little slack
    const cap = Math.ceil(needed / p.size) + 1;
    for (let c = 0; c <= cap; c++) {
      counts.set(p.id, c);
      const next = total + c * p.size;
      // prune: if already overshooting by more than maxSize, stop adding more
      if (next - needed > maxSize && total >= needed) break;
      dfs(idx + 1, next);
    }
    counts.delete(p.id);
  };
  dfs(0, 0);
  return best;
}
