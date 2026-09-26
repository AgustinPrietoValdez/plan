import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { budgetAmountFor, type BudgetScope } from "../lib/budgetPeriod";
import { budgetsInScope } from "../lib/spending";
import { colorsForHue } from "../lib/categoryColor";
import { weeksInMonth } from "../lib/date";
import { CURRENCY, fmtMoney, parseMoney } from "../lib/money";
import {
  useBudgets,
  useDeletedExpenseCategories,
  useExpenseCategories,
  useUpsertBudget,
  useDeleteBudget,
} from "../lib/queries";
import { useApp } from "../lib/store";
import type { BudgetPeriod } from "../types";
import { IX } from "./icons";

interface Props {
  onClose: () => void;
}

// Este modal es un `.modal`, así que escala con `--home-s` (no con el `--s` del
// frame de Home/Finanzas). Todo px nuevo pasa por acá.
function m(base: number): string {
  return `calc(var(--home-s, 1) * ${base}px)`;
}

const PERIOD_OPTIONS: { id: BudgetPeriod; label: string; title: string }[] = [
  { id: "monthly", label: "Mensual", title: "El monto es por mes" },
  { id: "weekly", label: "Semanal", title: "El monto es por semana (4 o 5 por mes)" },
];

export function BudgetManager({ onClose }: Props) {
  const categoriesQ = useExpenseCategories();
  const budgetsQ = useBudgets();
  const upsert = useUpsertBudget();
  const remove = useDeleteBudget();
  const { budgetMonth } = useApp();

  // El mes que se está mirando en Presupuesto — es contra ese mes que se muestra
  // el equivalente de un presupuesto semanal (4 semanas o 5 cambian el número).
  const viewedMonth = budgetMonth;
  // Memoizado: es dependencia del useMemo del total, y un objeto nuevo por
  // render lo haría recalcular siempre.
  const monthScope: BudgetScope = useMemo(
    () => ({ kind: "month", yyyymm: viewedMonth }),
    [viewedMonth],
  );
  const weeksThisMonth = weeksInMonth(viewedMonth);

  const categories = useMemo(
    () => (categoriesQ.data ?? []).filter((c) => !c.archived),
    [categoriesQ.data],
  );
  // `?? []` sin memo devuelve un array nuevo en cada render mientras la query
  // está cargando, y este valor es dependencia del efecto que siembra los
  // drafts — sin esto ese efecto se dispara en loop hasta que llegan los datos.
  const budgets = useMemo(() => budgetsQ.data ?? [], [budgetsQ.data]);
  // Las categorías BORRADAS no tienen fila acá (no vienen en `categoriesQ`), pero
  // su presupuesto sigue existiendo: su fecha de borrado es lo que decide si
  // todavía suma al total de este mes — ver el `useMemo` del total.
  const deletedCategoriesQ = useDeletedExpenseCategories();
  const deletedCategories = useMemo(
    () => deletedCategoriesQ.data ?? [],
    [deletedCategoriesQ.data],
  );

  // local draft amount per category (string for input control)
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  // local draft period per category. `budgets` tiene UNIQUE(user_id, category_id):
  // hay UN presupuesto por categoría, mensual o semanal, nunca los dos — así que
  // esto es el modo del presupuesto que ya existe, no un segundo presupuesto.
  const [periods, setPeriods] = useState<Record<string, BudgetPeriod>>({});

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const c of categories) {
      const b = budgets.find((b) => b.categoryId === c.id);
      next[c.id] = b ? b.monthlyAmount.toString().replace(".", ",") : "";
    }
    setDrafts(next);
    setPeriods((prev) => {
      const nextPeriods: Record<string, BudgetPeriod> = {};
      for (const c of categories) {
        const b = budgets.find((b) => b.categoryId === c.id);
        // Sin presupuesto guardado todavía, se respeta lo que el usuario acaba de
        // elegir en la fila (si no, un refetch se lo pisaría a "Mensual").
        nextPeriods[c.id] = b?.period ?? prev[c.id] ?? "monthly";
      }
      return nextPeriods;
    });
  }, [budgets, categories]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onBackdropMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const onCommit = (categoryId: string, periodOverride?: BudgetPeriod) => {
    const text = drafts[categoryId] ?? "";
    const parsed = parseMoney(text);
    const existingBudget = budgets.find((b) => b.categoryId === categoryId);
    const period = periodOverride ?? periods[categoryId] ?? "monthly";
    if (parsed === null || parsed === 0) {
      // blank/zero → remove budget if exists
      if (existingBudget) {
        remove.mutateAsync(existingBudget.id).catch((err) =>
          window.alert(err instanceof Error ? err.message : "No se pudo borrar el presupuesto"),
        );
      }
      return;
    }
    upsert.mutateAsync({ categoryId, monthlyAmount: parsed, currency: CURRENCY, period }).catch((err) =>
      window.alert(err instanceof Error ? err.message : "No se pudo guardar el presupuesto"),
    );
  };

  // Cambiar el modo reescribe el presupuesto que ya existe (mismo id, por el
  // UNIQUE): 300 pasan de ser 300/mes a 300/semana, no se agrega uno nuevo.
  const onSetPeriod = (categoryId: string, period: BudgetPeriod) => {
    if ((periods[categoryId] ?? "monthly") === period) return;
    setPeriods((s) => ({ ...s, [categoryId]: period }));
    onCommit(categoryId, period);
  };

  // Con periodos mezclados no se pueden sumar los `monthlyAmount` crudos (serían
  // peras con manzanas): se suma lo que cada uno cuesta en el mes que se ve.
  //
  // Se suma sobre los DRAFTS, no sobre `budgets`: lo guardado va un paso atrás
  // del input (el commit recién ocurre en el blur), así que sumar lo guardado
  // dejaba el total desincronizado de las filas que el usuario está mirando
  // hasta que cerraba y volvía a abrir el modal.
  const { total, anyWeekly } = useMemo(() => {
    let total = 0;
    let anyWeekly = false;
    const seen = new Set<string>();
    for (const c of categories) {
      seen.add(c.id);
      const parsed = parseMoney(drafts[c.id] ?? "");
      if (parsed === null || parsed <= 0) continue; // vacío/0 = se borra el presupuesto
      const period = periods[c.id] ?? "monthly";
      if (period === "weekly") anyWeekly = true;
      total += budgetAmountFor({ monthlyAmount: parsed, period }, monthScope);
    }
    // Presupuestos que no tienen fila acá (categorías archivadas o borradas):
    // siguen existiendo y contando, así que no pueden desaparecer del total.
    //
    // `budgetsInScope` (lib/spending) es la MISMA función con la que `BudgetView`,
    // `HomeView` y Finanzas mobile arman el tope: el presupuesto de una categoría
    // BORRADA cuenta hasta el mes anterior al borrado y deja de contar desde ese
    // mes. Sin esto, este total sumaba para siempre 200 kr que ya no tienen fila
    // en pantalla — un número que el usuario no podía ver de dónde salía, y que
    // además contradecía el tope del mes que muestra Presupuesto detrás del modal.
    for (const b of budgetsInScope(monthScope, budgets, deletedCategories)) {
      if (seen.has(b.categoryId)) continue;
      if (b.period === "weekly") anyWeekly = true;
      total += budgetAmountFor(b, monthScope);
    }
    return { total, anyWeekly };
  }, [categories, drafts, periods, budgets, deletedCategories, monthScope]);

  return (
    <div className="modal-backdrop" onMouseDown={onBackdropMouseDown}>
      {/* El ancho también escala con `--home-s`: adentro ahora hay una columna
          más (el toggle Mensual|Semanal) y a 2× un 820px fijo la apretaría. */}
      <div
        className="modal"
        style={{ width: `min(${m(820)}, 92vw)`, overflowX: "hidden" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <span style={{ flex: 1, fontSize: m(15), fontWeight: 600, letterSpacing: "-0.01em" }}>
            Presupuestos
          </span>
          <button className="icon-btn" onClick={onClose} title="Cerrar">
            <IX size={14} style={{ width: m(14), height: m(14) }} />
          </button>
        </div>

        <div className="modal-body">
          {categories.length === 0 ? (
            <div
              style={{
                padding: `${m(20)} ${m(12)}`,
                textAlign: "center",
                fontSize: m(12.5),
                color: "var(--fg-subtle)",
                border: "1px dashed var(--line)",
                borderRadius: m(8),
              }}
            >
              Todavía no hay categorías. Creá una primero.
            </div>
          ) : (
            categories.map((c) => {
              const colors = colorsForHue(c.hue);
              const period = periods[c.id] ?? "monthly";
              const parsed = parseMoney(drafts[c.id] ?? "");
              const perMonth = parsed !== null && parsed > 0
                ? budgetAmountFor({ monthlyAmount: parsed, period }, monthScope)
                : null;
              return (
                <div
                  key={c.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: `${m(18)} minmax(0, 1fr) auto ${m(200)}`,
                    gap: m(12),
                    alignItems: "center",
                    padding: `${m(6)} ${m(8)}`,
                    borderBottom: "1px solid var(--line)",
                  }}
                >
                  <span
                    style={{
                      width: m(18),
                      height: m(18),
                      borderRadius: m(5),
                      background: colors.bg,
                    }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: m(13),
                        fontWeight: 500,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={c.name}
                    >
                      {c.name}
                    </div>
                    {/* Sólo en semanal: el número que importa es cuánto da eso en
                        el mes que se está mirando, que cambia con 4 o 5 semanas. */}
                    {period === "weekly" && perMonth !== null && (
                      <div style={{ fontSize: m(11), color: "var(--fg-subtle)", fontVariantNumeric: "tabular-nums", marginTop: m(1) }}>
                        {fmtMoney(parsed!, { compact: true })}/sem · ≈{fmtMoney(perMonth, { compact: true })} este mes ({weeksThisMonth} semanas)
                      </div>
                    )}
                  </div>

                  {/* Mensual | Semanal — cambia el modo del presupuesto de esta
                      categoría (hay uno solo por categoría, no dos). */}
                  <div style={{ display: "flex", gap: m(2), padding: m(2), background: "var(--bg-sunken)", border: "1px solid var(--line)", borderRadius: m(7) }}>
                    {PERIOD_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        onClick={() => onSetPeriod(c.id, opt.id)}
                        title={opt.title}
                        style={{
                          border: 0,
                          cursor: "pointer",
                          fontFamily: "inherit",
                          padding: `${m(3)} ${m(9)}`,
                          borderRadius: m(5),
                          fontSize: m(11),
                          fontWeight: 600,
                          whiteSpace: "nowrap",
                          background: period === opt.id ? "var(--bg-elev)" : "transparent",
                          color: period === opt.id ? "var(--fg)" : "var(--fg-subtle)",
                          boxShadow: period === opt.id ? "var(--shadow-sm)" : "none",
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  <div style={{ display: "flex", gap: m(6), alignItems: "center" }}>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0,00"
                      value={drafts[c.id] ?? ""}
                      onChange={(e) => setDrafts((s) => ({ ...s, [c.id]: e.target.value }))}
                      onBlur={() => onCommit(c.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      }}
                      className="input"
                      style={{
                        flex: 1,
                        // `.input` sin un `.field` alrededor no tiene ningún CSS —
                        // este input vive suelto en la fila, así que se lo pone acá.
                        border: "1px solid var(--line)",
                        background: "var(--bg-elev)",
                        borderRadius: m(6),
                        outline: 0,
                        fontFamily: "inherit",
                        fontSize: m(13),
                        fontVariantNumeric: "tabular-nums",
                        textAlign: "right",
                        padding: `${m(5)} ${m(8)}`,
                      }}
                    />
                    <span style={{ fontSize: m(11), color: "var(--fg-muted)", whiteSpace: "nowrap" }}>
                      {CURRENCY}{period === "weekly" ? "/sem" : "/mes"}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="modal-foot">
          <span style={{ fontSize: m(12), color: "var(--fg-muted)" }}>
            Total del mes:{" "}
            <span style={{ fontWeight: 600, color: "var(--fg)" }}>{fmtMoney(total)}</span>
            {anyWeekly && (
              <span style={{ color: "var(--fg-subtle)" }}> · {weeksThisMonth} semanas</span>
            )}
          </span>
          <div className="actions">
            <button className="btn primary" onClick={onClose}>
              Listo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
