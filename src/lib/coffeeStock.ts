import type { BrewSession, CoffeeBean } from "../types";

/* ════════════════════════════════════════════════════════════════════════════
   Stock de café — reglas COMPARTIDAS entre el escritorio (`CafeView.tsx`) y la
   Bodega mobile (`CafeBodegaView.tsx`).

   Vivían como consts/funciones privadas de `CafeView.tsx`; se extrajeron acá
   para que mobile no las duplique (duplicarlas garantiza que se desincronicen).
   El escritorio importa de este archivo: NO hay una segunda definición.
   ════════════════════════════════════════════════════════════════════════════ */

/** Fallback de tamaño de bolsa, sólo para granos creados antes de que existiera
 *  `initialWeightGrams` (no todas las bolsas pesan lo mismo: no se asume una
 *  referencia global para los granos nuevos). */
export const REFERENCE_BAG_G = 250;

/** "Queda poco" (g). */
export const LOW_STOCK_G = 50;

/** Regla de stock bajo del escritorio, verbatim.
 *
 *  OJO: un grano en **0 g NO cuenta** (se asume que ya se marcó terminado).
 *  El diseño de 1g pinta el 0 g en `--danger`, lo que sugiere lo contrario ⇒
 *  el color y el conteo dicen cosas distintas a propósito.
 *  TODO(usuario): definir si 0 g es "por reponer". */
export function isLowStock(b: CoffeeBean): boolean {
  return b.weightGrams > 0 && b.weightGrams <= LOW_STOCK_G;
}

/** Grano abierto = ni borrado ni terminado.
 *  `repo.listCoffeeBeans()` filtra `deleted_at` pero **NO** `finished_at`: sin
 *  este filtro reaparecen los granos terminados en la lista (bug #19). */
export function activeBeans(beans: CoffeeBean[]): CoffeeBean[] {
  return beans.filter((b) => !b.deletedAt && !b.finishedAt);
}

/** Último brew de un grano. */
export function lastSessionFor(sessions: BrewSession[], beanId: string): BrewSession | null {
  const bs = sessions.filter((s) => s.beanId === beanId);
  if (bs.length === 0) return null;
  return bs.reduce((a, s) => (s.createdAt > a.createdAt ? s : a));
}

/** Último brew, punto. El repo ya devuelve `created_at DESC`, pero acá no se
 *  depende del orden (y se descartan los borrados). */
export function lastSession(sessions: BrewSession[]): BrewSession | null {
  const live = sessions.filter((s) => !s.deletedAt);
  if (live.length === 0) return null;
  return live.reduce((a, s) => (s.createdAt > a.createdAt ? s : a));
}

/** g/s de una sesión guardada. **NO existe como columna.**
 *
 *  Es `agua total / duración`: el flujo MEDIO del brew entero, con los datos que
 *  la propia fila ya trae. La otra derivación posible es el promedio de
 *  `brew_datapoints.flow_g_s` (sólo los vertidos, sin el drawdown), que da un
 *  número ~2× más alto y exige una query async por sesión.
 *  TODO(usuario): decidir cuál de las dos es "el g/s del brew".
 *
 *  `null` cuando no se puede calcular (`durationMs` es 0 en los brews guardados
 *  sin detección de agua). */
export function avgFlowGs(s: BrewSession): number | null {
  if (!(s.durationMs > 0) || !(s.totalWaterGrams > 0)) return null;
  return s.totalWaterGrams / (s.durationMs / 1000);
}

/** Ratio real de la sesión (`1:N`). `null` si no hay dosis. */
export function sessionRatio(s: BrewSession): number | null {
  if (!(s.doseGrams > 0) || !(s.totalWaterGrams > 0)) return null;
  return Math.round(s.totalWaterGrams / s.doseGrams);
}
