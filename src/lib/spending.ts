// "Cuánto se gastó en este período" — UNA sola definición para todas las
// pantallas (Home de escritorio, Presupuesto de escritorio, Finanzas mobile).
//
// Por qué existe: el total vivía copiado en cada pantalla y las copias se
// separaron. `FinanzasMobileView` sumaba sólo las categorías vivas y visibles,
// así que los gastos SIN categoría y los de categorías ARCHIVADAS desaparecían
// del total; el escritorio (`HomeView`) los contaba, porque su `.find()` sobre
// la lista de categorías devolvía `undefined` y el gasto pasaba el filtro. Mismo
// mes, dos números distintos. Acá queda la regla, una vez.
//
// LA REGLA (decisión del usuario, 2026-08-16):
//   Lo ÚNICO que saca un gasto del total es que su categoría esté marcada como
//   oculta (`hiddenFromChart`) — el flag que ya existe end-to-end y se sincroniza
//   entre dispositivos, el mismo que togglean el ojo del piechart y los tiles del
//   grid mobile.
//   Consecuencia explícita y querida: los gastos SIN categoría y los de
//   categorías ARCHIVADAS quedan INCLUIDOS. Son plata que salió; que ya no haya
//   dónde clasificarla no la hace desaparecer del mes.
//
// Vive acá y no en `budgetPeriod.ts` porque necesita `money.ts` (multi-moneda),
// y ese módulo se mantiene a propósito sin dependencias: es sólo aritmética de
// períodos. Este importa a los dos y los junta.

import { expenseInScopeFor, type BudgetScope, type PeriodicBudget } from "./budgetPeriod";
import { monthOfWeek, weekStartOf, ymd } from "./date";
import { CURRENCY, convertViaUsd } from "./money";

/** Entradas estructurales para no atar el módulo a los tipos de `src/types`
 *  (`Expense`, `ExpenseCategory` y `Budget` los satisfacen tal cual). */
export interface SpendingExpense {
  amount: number;
  currency: string;
  spentOn: string;
  categoryId: string | null;
  deletedAt?: string | null;
}

export interface SpendingCategory {
  id: string;
  archived: boolean;
  hiddenFromChart: boolean;
  /** Borrado lógico (`deleted_at`). Sólo lo mira el TOPE — ver `budgetsInScope`.
   *  Opcional porque las listas que llegan de `listExpenseCategories()` ya vienen
   *  sin borradas: ahí siempre es `null` y no cambia nada. */
  deletedAt?: string | null;
}

export interface SpendingBudget {
  categoryId: string;
  period: PeriodicBudget["period"];
}

export interface SpendingInput {
  /** Todos los gastos; los borrados (`deletedAt`) se descartan acá adentro. */
  expenses: SpendingExpense[];
  /** Todas las categorías, archivadas incluidas — ver `hiddenCategoryIds`. */
  categories: SpendingCategory[];
  budgets: SpendingBudget[];
  /** Unidades por 1 USD (ver `lib/exchangeRates`), para convertir a `CURRENCY`. */
  ratesPerUsd: Record<string, number>;
}

/** Las categorías cuyos gastos NO cuentan: marcadas ocultas y todavía vivas.
 *
 *  Una categoría archivada se ignora a propósito aunque tenga el flag prendido:
 *  no aparece en el piechart ni en el grid mobile, así que nadie podría volver a
 *  destildarla — un `hiddenFromChart` viejo no puede quedarse tragando plata en
 *  silencio para siempre. Pasar la lista completa o sólo las no archivadas da el
 *  mismo resultado. */
export function hiddenCategoryIds(categories: SpendingCategory[]): Set<string> {
  const ids = new Set<string>();
  for (const c of categories) if (c.hiddenFromChart && !c.archived) ids.add(c.id);
  return ids;
}

/** Período (mensual/semanal) del presupuesto de cada categoría. Una categoría
 *  sin presupuesto no entra: los que consultan caen a `"monthly"`. */
export function budgetPeriodByCategory(
  budgets: SpendingBudget[],
): Map<string, PeriodicBudget["period"]> {
  const map = new Map<string, PeriodicBudget["period"]>();
  for (const b of budgets) map.set(b.categoryId, b.period);
  return map;
}

/** El mes de la app ("YYYY-MM") al que pertenece un instante ISO, medido con el
 *  MISMO criterio con el que se mide `period`:
 *    · `monthly` → mes de calendario del día.
 *    · `weekly`  → mes de la semana (sáb→vie) que contiene al día, o sea
 *      `monthOfWeek` — el mismo reparto de semanas que usa el tope semanal.
 *
 *  El instante se pasa primero a día LOCAL (`new Date(...)` + `ymd`) en vez de
 *  cortarle 7 caracteres al ISO: el ISO viene en UTC y un borrado de las 23:30
 *  hora local del 31 figura como el 1 del mes siguiente en crudo. */
function appMonthOf(iso: string, period: PeriodicBudget["period"]): string {
  const t = new Date(iso);
  const day = Number.isNaN(t.getTime()) ? iso.slice(0, 10) : ymd(t);
  return period === "weekly" ? monthOfWeek(weekStartOf(day)) : day.slice(0, 7);
}

/** El mes al que pertenece un scope: un scope de semana cuenta en el mes que se
 *  queda con la mayoría de sus días, igual que en todo el resto del módulo. */
function scopeMonth(scope: BudgetScope): string {
  return scope.kind === "month" ? scope.yyyymm : monthOfWeek(scope.weekStart);
}

/** Los presupuestos que forman el TOPE de `scope`.
 *
 *  Un `Budget` sobrevive al borrado de su categoría (la fila no se toca, ni acá
 *  ni en la base), así que sin este filtro un tope de una categoría que ya no
 *  existe se sigue sumando al denominador para siempre — infla el presupuesto y
 *  desinfla el % de TODOS los meses, incluso los de después del borrado.
 *
 *  REGLA (decisión del usuario, 2026-08-16): "no borres, pero si se elimina una
 *  categoría deja de contar hasta el mes donde la elimine". O sea el tope sigue
 *  contando en los meses ANTERIORES al borrado — el historial no se reescribe y
 *  los porcentajes de los meses pasados quedan como fueron — y deja de contar
 *  desde el mes del borrado en adelante.
 *
 *  `categories` tiene que incluir las BORRADAS (es de donde sale la fecha); una
 *  categoría que no está en la lista se toma como viva, así que pasar sólo las
 *  vivas deja todo exactamente como estaba.
 *
 *  Es sólo el denominador: los GASTOS de una categoría borrada siguen contando
 *  en el total, porque lo único que saca un gasto es `hiddenFromChart` (ver la
 *  regla arriba). Plata que salió es plata que salió. */
export function budgetsInScope<T extends SpendingBudget>(
  scope: BudgetScope,
  budgets: T[],
  categories: SpendingCategory[],
): T[] {
  const deletedAtById = new Map<string, string>();
  for (const c of categories) if (c.deletedAt) deletedAtById.set(c.id, c.deletedAt);
  if (deletedAtById.size === 0) return budgets;
  const month = scopeMonth(scope);
  return budgets.filter((b) => {
    const deletedAt = deletedAtById.get(b.categoryId);
    return deletedAt == null || month < appMonthOf(deletedAt, b.period);
  });
}

/** Si este gasto (vivo) cae dentro de `scope`.
 *
 *  El período sale del presupuesto de SU categoría: uno `weekly` se mide en
 *  semanas enteras (sáb→vie) aun mirando por mes, porque su tope también vale 4
 *  o 5 semanas — compararlo contra días de calendario es exactamente el bug que
 *  `budgetPeriod.ts` vino a arreglar. Sin presupuesto (o sin categoría) se cae al
 *  mes calendario de siempre.
 *
 *  Es el ÚNICO lugar donde se decide "este gasto pertenece a este período": el
 *  total (`totalSpentIn`) y el piechart (`expensesInScope`) salen los dos de acá,
 *  así que el KPI y el centro del donut no pueden volver a separarse. */
export function expenseInPeriodScope(
  expense: SpendingExpense,
  scope: BudgetScope,
  periods: Map<string, PeriodicBudget["period"]>,
): boolean {
  if (expense.deletedAt) return false;
  const period = (expense.categoryId ? periods.get(expense.categoryId) : undefined) ?? "monthly";
  return expenseInScopeFor(expense.spentOn ?? "", scope, period);
}

/** Si este gasto cuenta para el TOTAL de `scope`: además de caer en el período,
 *  su categoría no puede estar oculta (ver la regla arriba). */
export function expenseCountsInTotal(
  expense: SpendingExpense,
  scope: BudgetScope,
  hidden: Set<string>,
  periods: Map<string, PeriodicBudget["period"]>,
): boolean {
  if (expense.categoryId != null && hidden.has(expense.categoryId)) return false;
  return expenseInPeriodScope(expense, scope, periods);
}

/** Los gastos vivos que caen en `scope`, con el período del presupuesto de cada
 *  categoría — lo que se le pasa al piechart.
 *
 *  NO filtra las categorías ocultas a propósito: la leyenda del donut las sigue
 *  mostrando (apagadas, con su monto y su ojo para volver a prenderlas) y es el
 *  propio `SpendingPie` el que las saca del total y de los arcos. */
export function expensesInScope<T extends SpendingExpense>(
  scope: BudgetScope,
  expenses: T[],
  budgets: SpendingBudget[],
): T[] {
  const periods = budgetPeriodByCategory(budgets);
  return expenses.filter((e) => expenseInPeriodScope(e, scope, periods));
}

/** El total gastado en `scope`, en `CURRENCY`.
 *
 *  Multi-moneda: cada gasto se convierte con `convertViaUsd` ANTES de sumar —
 *  sumar primero trataría cada monto como si ya estuviera en DKK. */
export function totalSpentIn(scope: BudgetScope, input: SpendingInput): number {
  const hidden = hiddenCategoryIds(input.categories);
  const periods = budgetPeriodByCategory(input.budgets);
  return input.expenses.reduce(
    (sum, e) =>
      expenseCountsInTotal(e, scope, hidden, periods)
        ? sum + convertViaUsd(e.amount, e.currency, CURRENCY, input.ratesPerUsd)
        : sum,
    0,
  );
}
