import { fromYmd, todayYmd } from "./date";

export type FreshnessStatus = "unknown" | "too-fresh" | "in-range" | "limit" | "stale";

// `asOf` congela el conteo: para un grano terminado se pasa la fecha en que
// se termino (no la fecha real de hoy), asi el descanso deja de sumar dias
// mientras el grano esta archivado.
export function freshnessStatus(roastedOn: string | null, asOf: string = todayYmd()): FreshnessStatus {
  if (!roastedOn) return "unknown";
  const ref = fromYmd(asOf);
  const roasted = fromYmd(roastedOn);
  const days = Math.floor((ref.getTime() - roasted.getTime()) / 86_400_000);
  if (days < 0) return "unknown";
  if (days < 21) return "too-fresh";
  if (days <= 42) return "in-range";
  if (days <= 49) return "limit";
  return "stale";
}

export function daysOld(roastedOn: string | null, asOf: string = todayYmd()): number | null {
  if (!roastedOn) return null;
  const ref = fromYmd(asOf);
  const roasted = fromYmd(roastedOn);
  return Math.floor((ref.getTime() - roasted.getTime()) / 86_400_000);
}

export const FRESHNESS_LABEL: Record<FreshnessStatus, string> = {
  unknown: "sin fecha",
  "too-fresh": "descansando",
  "in-range": "en rango",
  limit: "límite",
  stale: "viejo",
};

export const FRESHNESS_COLOR: Record<FreshnessStatus, string> = {
  unknown: "var(--fg-subtle)",
  "too-fresh": "oklch(0.72 0.14 80)",
  "in-range": "var(--ok, oklch(0.62 0.17 145))",
  limit: "oklch(0.72 0.14 60)",
  stale: "var(--danger)",
};
