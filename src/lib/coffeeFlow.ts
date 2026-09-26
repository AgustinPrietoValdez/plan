/* Banda de flujo (g/s) del brew — UNA sola implementación.
 *
 * La lógica ±30% vivía duplicada dentro de `ScaleView.FlowBand`; el handoff de
 * 1h (Café · brew en vivo) pide la misma etiqueta en la card oscura de peso, así
 * que en vez de escribirla por segunda vez se extrajo acá.
 *
 * El helper devuelve `tone` (no un color): el color lo pone cada pantalla, que
 * sabe si pinta sobre fondo claro (`ScaleView`) u oscuro (la card de 1h). */

export type FlowTone = "slow" | "ok" | "fast";

export interface FlowBandResult {
  tone: FlowTone;
  /** Etiqueta en castellano: `lento` / `bien` / `rápido`. */
  label: string;
  /** Objetivo usado (el del paso, o el default si el paso no define uno). */
  target: number;
}

/** Objetivo de flujo cuando el paso de la receta no trae `flowTarget`.
 *  Es el valor que ya usaba `ScaleView.FlowBand`. */
export const FLOW_TARGET_FALLBACK = 3;

/** Ancho de la banda "bien": ±30% del objetivo (criterio del handoff). */
export const FLOW_BAND_TOLERANCE = 0.3;

/** `lento` por debajo del 70% del objetivo, `rápido` por encima del 130%.
 *  Se compara el valor ABSOLUTO: la balanza reporta flujo negativo cuando el
 *  peso baja y eso no debería leerse como "lento". */
export function flowBand(flow: number, target?: number | null): FlowBandResult {
  const tgt = target && target > 0 ? target : FLOW_TARGET_FALLBACK;
  const abs = Math.abs(flow);
  const lo = tgt * (1 - FLOW_BAND_TOLERANCE);
  const hi = tgt * (1 + FLOW_BAND_TOLERANCE);
  const tone: FlowTone = abs < lo ? "slow" : abs > hi ? "fast" : "ok";
  return { tone, label: tone === "slow" ? "lento" : tone === "fast" ? "rápido" : "bien", target: tgt };
}
