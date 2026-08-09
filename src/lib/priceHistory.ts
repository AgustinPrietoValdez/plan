// Historial de precios derivado de los gastos reales.
//
// Pure module: no React, no DB. Everything is computed from the rows the caller
// already has in memory (expense line items + their parent expenses), so the
// same functions work on desktop, on mobile and inside tests.
//
// The unit of comparison is ALWAYS "price per base unit" (per g / per ml / per
// u), because that is the only number that survives the package/bulk split:
//
//     pricePerBaseUnit = (quantity * unitPrice) / baseQuantity
//
// which holds for both shapes of line (see the invariant in types/index.ts):
//   * package: 2 × "Arroz 1 kg" a 25  -> quantity=2, unitPrice=25, base=2000
//   * bulk:    750 g de salmón por 89 -> quantity=1, unitPrice=89, base=750

import type { Expense, ExpenseLineItem, IngredientPresentation } from "../types";
import { fromYmd, ymd } from "./date";
import { convertViaUsd, CURRENCY } from "./money";

export interface PriceEntry {
  lineItemId: string;
  expenseId: string;
  ingredientId: string;
  presentationId: string | null;
  spentOn: string;
  merchantId: string | null;
  /** Cantidad adquirida en unidad base (g / ml / u). Siempre > 0. */
  baseQuantity: number;
  /** Total pagado por la línea, EN LA MONEDA DEL GASTO (quantity * unitPrice). */
  totalPaid: number;
  /** Moneda del gasto padre — las líneas no tienen moneda propia. */
  currency: string;
  /** Precio por unidad base normalizado a CURRENCY. */
  pricePerBaseUnit: number;
}

/** Line items carry no currency of their own: they inherit `expenses.currency`.
 *  Rates are current-only (there is no historical rate table), so a converted
 *  sample from a high-inflation currency drifts. `preferHomogeneous` below is
 *  what keeps that drift out of the averages. */
export function buildPriceHistory(
  lineItems: ExpenseLineItem[],
  expenses: Expense[],
  ratesPerUsd: Record<string, number>,
): Map<string, PriceEntry[]> {
  const expenseById = new Map<string, Expense>();
  for (const e of expenses) {
    if (e.deletedAt) continue; // gasto borrado -> sus líneas no son historial
    expenseById.set(e.id, e);
  }

  const out = new Map<string, PriceEntry[]>();
  for (const li of lineItems) {
    if (li.deletedAt) continue;
    if (!li.ingredientId) continue; // línea libre (Netflix, alquiler): no compara
    if (!(li.baseQuantity > 0)) continue; // sin cantidad base no hay precio normalizable
    const exp = expenseById.get(li.expenseId);
    if (!exp) continue;

    const totalPaid = li.quantity * li.unitPrice;
    if (!Number.isFinite(totalPaid) || totalPaid <= 0) continue;

    const normalized = convertViaUsd(totalPaid, exp.currency, CURRENCY, ratesPerUsd);
    const entry: PriceEntry = {
      lineItemId: li.id,
      expenseId: exp.id,
      ingredientId: li.ingredientId,
      presentationId: li.presentationId,
      spentOn: exp.spentOn,
      merchantId: exp.merchantId,
      baseQuantity: li.baseQuantity,
      totalPaid,
      currency: exp.currency,
      pricePerBaseUnit: normalized / li.baseQuantity,
    };
    const arr = out.get(entry.ingredientId);
    if (arr) arr.push(entry);
    else out.set(entry.ingredientId, [entry]);
  }

  // Más reciente primero. Empate por fecha -> orden estable por id de línea.
  for (const arr of out.values()) {
    arr.sort((a, b) => b.spentOn.localeCompare(a.spentOn) || a.lineItemId.localeCompare(b.lineItemId));
  }
  return out;
}

/** Keep the samples comparable: if ANY sample is already in CURRENCY, drop the
 *  converted ones entirely. Mixing a DKK price with an ARS price run through
 *  today's rate is how a "promedio" ends up meaningless. */
function preferHomogeneous(entries: PriceEntry[]): PriceEntry[] {
  const native = entries.filter((e) => e.currency === CURRENCY);
  return native.length > 0 ? native : entries;
}

/** `dateYmd` minus `months` calendar months. Day overflow (31 de mayo − 3 meses
 *  = 31 de febrero) rueda hacia adelante, lo que sólo ensancha la ventana unos
 *  días — inofensivo para un promedio. */
function monthsBefore(dateYmd: string, months: number): string {
  const d = fromYmd(dateYmd);
  d.setMonth(d.getMonth() - months);
  return ymd(d);
}

/** Media simple del precio por unidad base de los últimos 3 meses.
 *
 *  Devuelve SIEMPRE el número de muestras junto al promedio: con una sola compra
 *  el "promedio" no es un promedio, y quien lo muestre tiene que poder decirlo.
 *  `null` cuando no hay ninguna muestra en la ventana.
 *
 *  Nota: el usuario eligió media de 3 meses. Una MEDIANA sería más robusta —
 *  una promo puntual o un precio tipeado con un cero de más mueve la media y no
 *  la mediana. Cambiar aquí adentro no afecta a ningún llamador. */
export function avgPriceLast3Months(
  entries: PriceEntry[],
  today: string,
): { avg: number; samples: number } | null {
  const cutoff = monthsBefore(today, 3);
  // Sin cota superior a propósito: un gasto fechado "mañana" sigue siendo el
  // precio más fresco que hay, no tiene sentido esconderlo.
  const recent = preferHomogeneous(entries.filter((e) => e.spentOn >= cutoff));
  if (recent.length === 0) return null;
  const sum = recent.reduce((s, e) => s + e.pricePerBaseUnit, 0);
  return { avg: sum / recent.length, samples: recent.length };
}

/** Precio por unidad base estimado para un ingrediente, en CURRENCY.
 *
 *  Orden de preferencia:
 *    1. promedio de los últimos 3 meses de compras reales;
 *    2. la compra real más reciente (aunque sea vieja);
 *    3. el catálogo: `price` de una variante bulk ya es por unidad base, y el de
 *       una variante package se divide por su `size`. Entre varios candidatos se
 *       toma el más barato (es una estimación, no una cotización).
 *  `null` cuando no hay ni historial ni precio de catálogo. */
export function estimatedUnitPrice(
  ingredientId: string,
  history: Map<string, PriceEntry[]>,
  presentations: IngredientPresentation[],
): number | null {
  const entries = history.get(ingredientId) ?? [];
  if (entries.length > 0) {
    const avg = avgPriceLast3Months(entries, ymd(new Date()));
    if (avg) return avg.avg;
    const latest = preferHomogeneous(entries)[0];
    if (latest) return latest.pricePerBaseUnit;
  }

  const candidates: number[] = [];
  for (const p of presentations) {
    if (p.ingredientId !== ingredientId) continue;
    if (p.deletedAt) continue;
    if (p.price === null || !(p.price > 0)) continue;
    // `size` SÓLO se lee cuando kind === "package".
    if (p.kind === "bulk") candidates.push(p.price);
    else if (p.size > 0) candidates.push(p.price / p.size);
  }
  if (candidates.length === 0) return null;
  return Math.min(...candidates);
}

/** Agrupa las compras por comercio. La clave `null` son las compras sin comercio
 *  cargado — se conservan a propósito: son historial válido, sólo que sin lugar. */
export function byMerchant(entries: PriceEntry[]): Map<string | null, PriceEntry[]> {
  const out = new Map<string | null, PriceEntry[]>();
  for (const e of entries) {
    const arr = out.get(e.merchantId);
    if (arr) arr.push(e);
    else out.set(e.merchantId, [e]);
  }
  return out;
}

/** Dónde salió más barato: promedio por comercio, y se devuelve el mínimo.
 *  Promedio y no mínimo absoluto para que una única promo no consagre un
 *  comercio para siempre. `null` si no hay muestras. */
export function cheapestMerchant(
  entries: PriceEntry[],
): { merchantId: string | null; price: number } | null {
  const usable = preferHomogeneous(entries);
  if (usable.length === 0) return null;
  let best: { merchantId: string | null; price: number } | null = null;
  for (const [merchantId, group] of byMerchant(usable)) {
    if (group.length === 0) continue;
    const price = group.reduce((s, e) => s + e.pricePerBaseUnit, 0) / group.length;
    if (!best || price < best.price) best = { merchantId, price };
  }
  return best;
}
