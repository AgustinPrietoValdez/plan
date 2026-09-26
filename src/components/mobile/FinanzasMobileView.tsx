import { useImperativeHandle, useMemo, useState, type CSSProperties } from "react";
import type { MobileScreenProps } from "./shell";
import { ExpenseSheetMobile } from "./ExpenseSheetMobile";
import {
  useBudgets,
  useDeletedExpenseCategories,
  useExpenseCategories,
  useExpenses,
  useFinanzasSettings,
  usePatchExpenseCategory,
} from "../../lib/queries";
import { useApp } from "../../lib/store";
import { MONTH_LONG_ES, shiftMonth } from "../../lib/date";
import { colorsForHue } from "../../lib/categoryColor";
import { CURRENCY, DEFAULT_RATES_PER_USD, convertViaUsd, fmtNumber } from "../../lib/money";
import {
  budgetAmountFor,
  expenseInScopeFor,
  sumBudgetsFor,
  type BudgetScope,
} from "../../lib/budgetPeriod";
import { budgetsInScope, totalSpentIn } from "../../lib/spending";
import type { ExpenseCategory } from "../../types";

/* ═══════════════════════════════════════════════════════════════════════════
   1d · FINANZAS (mobile)

   Contrato: `shell.ts`. Pantalla CON header ⇒ `.m-scr-head` resuelve la
   safe-area de arriba y el scroller NO lleva `--top-safe`.
   CSS propio: `src/styles/mobile/finanzas.css` (prefijo `.m-fin-`).

   ── El donut NO es `SpendingPie` ──────────────────────────────────────────
   Son dos gráficos distintos A PROPÓSITO (confirmado por el usuario):
     · `SpendingPie` (escritorio) reparte el ángulo por `monto / total gastado`
       ⇒ el anillo SIEMPRE cierra 360°: muestra *distribución* del gasto.
     · Éste reparte por `gastado / Σ límites` y deja el resto en gris
       ⇒ muestra *consumo del presupuesto*.
   Por eso no se reusa `SpendingPie` ni se lo toca.

   ── Reglas de dominio que acá NO se rompen ────────────────────────────────
     · El tope de cada categoría sale de `budgetAmountFor(budget, scope)`,
       NUNCA de `monthlyAmount` crudo: un presupuesto `weekly` mirado por mes
       vale 4 o 5 semanas.
     · Cada gasto se filtra con `expenseInScopeFor(spentOn, scope, period)` con
       el período del presupuesto de SU categoría: un `weekly` se mide en
       semanas enteras (sáb→vie), no en días del calendario.
     · Multi-moneda: `convertViaUsd(...)` a `CURRENCY` ANTES de sumar.
     · El TOTAL del mes (el número del centro) no se calcula acá: sale de
       `totalSpentIn` (`lib/spending`), compartido con el escritorio.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Gris del tramo "todavía no gastado" del anillo (literal del handoff). */
const REST_COLOR = "oklch(0.94 0.008 80)";

/** Una categoría ya resuelta para el mes que se está mirando. */
interface CatRow {
  cat: ExpenseCategory;
  color: string;
  /** Gastado en el scope, convertido a `CURRENCY`. */
  spent: number;
  /** Tope del mes, ya resuelto por período. `null` = la categoría no tiene `Budget`. */
  limit: number | null;
  visible: boolean;
}

export function FinanzasMobileView({ ref }: MobileScreenProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  useImperativeHandle(ref, () => ({ onFab: () => setSheetOpen(true) }), []);

  const { budgetMonth, setBudgetMonth } = useApp();
  const categoriesQ = useExpenseCategories();
  // Las categorías BORRADAS no vienen en `categoriesQ` (el repo filtra
  // `deleted_at`), pero su fecha de borrado es lo que decide si su tope todavía
  // cuenta este mes — ver `totalLimit`.
  const deletedCategoriesQ = useDeletedExpenseCategories();
  const expensesQ = useExpenses();
  const budgetsQ = useBudgets();
  const finSettingsQ = useFinanzasSettings();
  const patchCategory = usePatchExpenseCategory();

  /* TODO(1d · P10) — GASTOS RECURRENTES: YA DECIDIDO, LO MONTA LA SHELL.
     Decisión del usuario (2026-08-16): el celular SÍ corre
     `useMaterializeRecurringExpenses` (o sea, el teléfono escribe). El hook lo
     monta el agente de la shell en `MobileApp.tsx` — NO acá, porque esta
     pantalla no debe disparar mutaciones al montarse y el hook tiene que correr
     esté o no abierto el tab Finanzas.
     Esta vista asume que los recurrentes del mes YA están materializados: no
     hay ningún workaround acá por el caso "el total sale corto". Si el hook no
     estuviera montado, el total del donut y los montos por categoría saldrían
     cortos hasta que alguien abra Presupuesto en el escritorio. */

  // Las cotizaciones se leen del settings ya sincronizado (offline-first, sin
  // fetch propio) — mismo patrón que `BudgetView`.
  const rates = finSettingsQ.data?.ratesPerUsd;
  const ratesPerUsd = useMemo(
    () => ({
      USD: 1,
      DKK: rates?.DKK ?? DEFAULT_RATES_PER_USD.DKK,
      EUR: rates?.EUR ?? DEFAULT_RATES_PER_USD.EUR,
      ARS: rates?.ARS ?? DEFAULT_RATES_PER_USD.ARS,
    }),
    [rates?.DKK, rates?.EUR, rates?.ARS],
  );

  const scope = useMemo<BudgetScope>(
    () => ({ kind: "month", yyyymm: budgetMonth }),
    [budgetMonth],
  );

  const categories = useMemo(
    () => (categoriesQ.data ?? []).filter((c) => !c.archived),
    [categoriesQ.data],
  );

  const rows = useMemo<CatRow[]>(() => {
    const expenses = (expensesQ.data ?? []).filter((e) => !e.deletedAt);
    const budgets = budgetsQ.data ?? [];
    const budgetByCat = new Map(budgets.map((b) => [b.categoryId, b]));

    return categories.map((cat) => {
      const budget = budgetByCat.get(cat.id) ?? null;
      // Sin presupuesto ⇒ mes calendario de siempre (igual que el escritorio).
      const period = budget?.period ?? "monthly";
      const spent = expenses
        .filter((e) => e.categoryId === cat.id && expenseInScopeFor(e.spentOn, scope, period))
        .reduce((s, e) => s + convertViaUsd(e.amount, e.currency, CURRENCY, ratesPerUsd), 0);
      return {
        cat,
        color: colorsForHue(cat.hue).fg,
        spent,
        limit: budget ? budgetAmountFor(budget, scope) : null,
        visible: !cat.hiddenFromChart,
      };
    });
  }, [categories, expensesQ.data, budgetsQ.data, scope, ratesPerUsd]);

  const visible = rows.filter((r) => r.visible);

  /* TOTAL DEL MES — la definición NO vive acá: es `totalSpentIn` de
     `lib/spending`, la misma que usa el escritorio (`HomeView`), para que las dos
     pantallas muestren EL MISMO número.

     Decisión del usuario (2026-08-16): lo único que saca un gasto del total es
     que su categoría esté marcada como oculta (`hiddenFromChart`). O sea, los
     gastos SIN categoría y los de categorías ARCHIVADAS SÍ cuentan — antes esta
     pantalla los perdía (sumaba sólo los tiles visibles) y daba menos que el
     escritorio para el mismo mes.

     Consecuencia querida y aceptada: esos gastos no tienen tile ni tramo en el
     anillo, así que el número del centro puede ser MAYOR que la suma de los
     tramos de colores. El anillo sigue siendo "consumo del presupuesto por
     categoría" y se dibuja con su propio denominador (ver `buildDonut`), que por
     eso no toma este total. */
  const totalSpent = useMemo(
    () =>
      totalSpentIn(scope, {
        expenses: expensesQ.data ?? [],
        categories: categoriesQ.data ?? [],
        budgets: budgetsQ.data ?? [],
        ratesPerUsd,
      }),
    [expensesQ.data, categoriesQ.data, budgetsQ.data, scope, ratesPerUsd],
  );
  /* Denominador del pill: SOLO los topes. Una categoría sin `Budget` suma al
     numerador y no al denominador ⇒ el % puede pasar de 100. Es el mismo
     comportamiento del escritorio (`HomeView`/`BudgetView`) y se mantiene.

     Se suma sobre los `Budget`, NO sobre los tiles (`visible.reduce(r.limit)`),
     que es como se hacía acá: los tiles salen de las categorías VIVAS, así que un
     presupuesto cuya categoría fue borrada (o archivada) desaparecía del tope en
     TODOS los meses y esta pantalla mostraba menos denominador que el escritorio
     para los meses anteriores al borrado — el historial no se reescribe. Ahora es
     literalmente la misma expresión que `BudgetView`:
       · `budgetsInScope` (lib/spending): el presupuesto de una categoría borrada
         cuenta hasta el mes anterior al borrado y no cuenta desde ese mes;
       · `hiddenFromChart`: una categoría oculta no suma tope (su gasto tampoco
         suma al total), y una que no está en `categories` (archivada/borrada) no
         puede estar oculta ⇒ cuenta. */
  const totalLimit = useMemo(
    () =>
      sumBudgetsFor(
        budgetsInScope(scope, budgetsQ.data ?? [], deletedCategoriesQ.data ?? []).filter(
          (b) => !categories.find((c) => c.id === b.categoryId)?.hiddenFromChart,
        ),
        scope,
      ),
    [scope, budgetsQ.data, deletedCategoriesQ.data, categories],
  );
  const hasLimit = totalLimit > 0;
  const pct = hasLimit ? Math.round((totalSpent / totalLimit) * 100) : 0;
  const tone = pct >= 95 ? "var(--danger)" : pct >= 75 ? "var(--warn)" : "var(--ok)";

  const donutBg = buildDonut(visible, totalLimit);

  const monthLabel = monthLabelEs(budgetMonth);
  // TODO(1d · lo decide el usuario): "Agus & Sofi" NO es derivable —
  // `Account.owner` es `agus|sofi|shared` POR CUENTA, no un nombre de hogar.
  // Se deja literal igual que el escritorio (`FinanzasView.tsx`: "…de Agus & Sofi").
  const subtitle = hasLimit
    ? `Agus & Sofi · quedan ${fmtNumber(Math.max(0, totalLimit - totalSpent))} kr de ${fmtNumber(totalLimit)}`
    : "Agus & Sofi";

  /* Tap en un tile = mostrar/ocultar la categoría del donut. El flag es GLOBAL
     y PERSISTIDO (`hiddenFromChart`): destildar acá también la saca del
     piechart del escritorio y del `HomeView` de la otra persona vía sync. Es lo
     que pide el handoff explícitamente ("persistir ahí").

     TODO(1d · lo decide el usuario): en escritorio, tocar una categoría ADEMÁS
     filtra la lista de gastos (`onSelectCategory` de `BudgetView`). En esta
     pantalla no hay lista de gastos, así que el tap sólo filtra el donut.
     Falta decidir si algún gesto (tap largo?) debería llevar a los gastos de
     esa categoría. */
  const toggle = (r: CatRow) => {
    patchCategory
      .mutateAsync({ id: r.cat.id, patch: { hiddenFromChart: !r.cat.hiddenFromChart } })
      .catch((err) =>
        window.alert(err instanceof Error ? err.message : "No se pudo guardar el filtro"),
      );
  };

  return (
    <div className="m-screen">
      <header className="m-scr-head">
        <div className="m-scr-head-row">
          <div
            className="m-scr-badge"
            style={
              {
                ["--badge-bg" as string]: "var(--c-sand)",
                ["--badge-fg" as string]: "var(--c-sand-fg)",
              } as CSSProperties
            }
          >
            💰
          </div>
          <div className="m-scr-titles">
            <h1 className="m-scr-title">Finanzas</h1>
            <span className="m-scr-sub">{subtitle}</span>
          </div>
          <div className="m-pager">
            <button
              type="button"
              className="m-pager-btn m-fin-pager-btn"
              aria-label="Mes anterior"
              onClick={() => setBudgetMonth(shiftMonth(budgetMonth, -1))}
            >
              ‹
            </button>
            <span className="m-fin-pager-label">{monthLabel}</span>
            <button
              type="button"
              className="m-pager-btn m-fin-pager-btn"
              aria-label="Mes siguiente"
              onClick={() => setBudgetMonth(shiftMonth(budgetMonth, 1))}
            >
              ›
            </button>
          </div>
        </div>
      </header>

      <div
        className="m-scroll"
        style={
          {
            ["--m-scroll-pt" as string]: "18px",
            ["--m-scroll-pb" as string]: "18px",
            ["--m-scroll-gap" as string]: "18px",
          } as CSSProperties
        }
      >
        {categories.length === 0 ? (
          <p className="m-empty">Todavía no hay categorías de gasto.</p>
        ) : (
          <>
            <div className="m-fin-donut-wrap">
              <div className="m-fin-donut" style={{ background: donutBg }}>
                <div className="m-fin-donut-hole">
                  <div>
                    <div className="m-fin-total m-mono">{fmtNumber(totalSpent)}</div>
                    <div className="m-fin-total-label">gastos · kr</div>
                    {/* Sin ningún tope configurado el pill no tiene qué decir
                        ("0% de 0 kr" no informa): se oculta y el anillo queda
                        todo gris con el gastado en el centro. */}
                    {hasLimit && (
                      <div
                        className="m-fin-pill"
                        style={{
                          color: tone,
                          background: `color-mix(in oklch, ${tone} 14%, var(--bg))`,
                        }}
                      >
                        {pct}% de {fmtNumber(totalLimit)} kr
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="m-fin-grid">
              {rows.map((r) => {
                // Único punto de lectura del emoji en toda la pantalla (ver
                // `categoryEmoji`); null en las categorías que no tienen uno.
                const icon = categoryEmoji(r.cat);
                return (
                  <button
                    key={r.cat.id}
                    type="button"
                    className={`m-fin-cat${r.visible ? "" : " is-off"}`}
                    aria-pressed={r.visible}
                    onClick={() => toggle(r)}
                  >
                    <span
                      className="m-fin-cat-box"
                      style={{
                        borderColor: r.visible ? r.color : "var(--line-strong)",
                        background: r.visible ? r.color : "transparent",
                      }}
                    >
                      {r.visible ? "✓" : ""}
                    </span>
                    <span className="m-fin-cat-main">
                      <span className="m-fin-cat-name">{r.cat.name}</span>
                      <span className="m-fin-cat-amount">
                        {/* Sin `Budget` no hay segundo número: se muestra sólo
                            el gastado, igual que la leyenda del escritorio. */}
                        {r.limit === null
                          ? fmtNumber(r.spent)
                          : `${fmtNumber(r.spent)} / ${fmtNumber(r.limit)}`}
                      </span>
                    </span>
                    {/* EMOJI POR CATEGORÍA — sólo si la categoría tiene uno
                        cargado; si no, el tile queda con el color como única
                        señal. Ver `categoryEmoji`. */}
                    {icon && <span className="m-fin-cat-icon">{icon}</span>}
                  </button>
                );
              })}
            </div>
          </>
        )}
        <div className="m-scroll-tail" />
      </div>

      {sheetOpen && <ExpenseSheetMobile onClose={() => setSheetOpen(false)} />}
    </div>
  );
}

/** El emoji que va a la derecha del tile de una categoría.
 *
 *  ÚNICO punto de lectura del emoji en toda la pantalla, a propósito: el grid
 *  llama a esto y nada más.
 *
 *  `emoji` es una columna de `ExpenseCategory` (migración local 0044 / Supabase
 *  0035), editable desde `ExpenseCategoryManager` en el escritorio. Las
 *  categorías que ya existían quedaron en `null`: hasta que se les cargue uno,
 *  el tile muestra sólo el color, igual que el escritorio. */
function categoryEmoji(cat: ExpenseCategory): string | null {
  return cat.emoji || null;
}

/* ── donut ──────────────────────────────────────────────────────────────────
   Un tramo por categoría visible, en orden, de ancho `gastado / denominador`,
   y el resto en gris.

   OJO: el denominador se calcula con lo gastado en las categorías VISIBLES, no
   con el total del centro (`totalSpentIn`), que además incluye los gastos sin
   categoría y los de categorías archivadas — esos no tienen tile ni tramo. Es
   decir: el número del medio puede ser mayor que la suma de los tramos, y está
   aceptado. Mezclarlos rompería el anillo (stops pasados de 100%).

   DOS CASOS QUE EL PROTOTIPO NO CONTEMPLA y que acá se resuelven explícitos:

   1. `Σ límites === 0` (nadie configuró presupuestos, o todas las visibles son
      categorías sin `Budget`). El prototipo divide por `limite || 1`, lo que
      pinta el anillo entero con la primera categoría — basura. Acá: anillo
      completo en gris (color plano, NO `conic-gradient`: un gradiente sin
      stops es CSS inválido) y el pill oculto.

   2. `gastado > límite`. Con el denominador crudo los stops se pasan de 100% y
      las últimas categorías se recortan o desaparecen. Acá el denominador es
      `max(Σ límites, Σ gastado)`:
        · si no hay sobregasto es EXACTAMENTE el del prototipo (resto gris);
        · si lo hay, el anillo cierra 360° con todas las categorías visibles y
          proporcionales — ninguna desaparece — y el sobregasto lo comunica el
          pill (>=95% ⇒ `--danger`), que sigue midiendo contra `Σ límites`.
   Los stops se clampean igual a [0,100] por las dudas (montos negativos, NaN). */
function buildDonut(rows: CatRow[], totalLimit: number): string {
  const positive = rows.map((r) => Math.max(0, r.spent));
  const totalSpent = positive.reduce((s, n) => s + n, 0);
  const denom = Math.max(totalLimit, totalSpent);
  if (!(denom > 0)) return REST_COLOR;

  const stops: string[] = [];
  let acc = 0;
  rows.forEach((r, i) => {
    const from = clampPct((acc / denom) * 100);
    acc += positive[i];
    const to = clampPct((acc / denom) * 100);
    // Un tramo de ancho ~0 no se ve y sólo ensucia el gradiente.
    if (to - from < 0.05) return;
    stops.push(`${r.color} ${from.toFixed(2)}% ${to.toFixed(2)}%`);
  });

  const filled = clampPct((acc / denom) * 100);
  if (filled < 99.95) stops.push(`${REST_COLOR} ${filled.toFixed(2)}% 100%`);
  if (stops.length === 0) return REST_COLOR;
  return `conic-gradient(${stops.join(",")})`;
}

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

/** "2026-08" → "Agosto 2026". */
function monthLabelEs(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  const name = MONTH_LONG_ES[(m || 1) - 1] ?? "";
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${y}`;
}
