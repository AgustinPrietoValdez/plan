import { describe, expect, it } from "vitest";
import type { BudgetScope } from "./budgetPeriod";
import {
  budgetPeriodByCategory,
  budgetsInScope,
  expenseCountsInTotal,
  expenseInPeriodScope,
  expensesInScope,
  hiddenCategoryIds,
  totalSpentIn,
  type SpendingBudget,
  type SpendingCategory,
  type SpendingExpense,
} from "./spending";

// Calendario de referencia (semanas sab->vie, cada semana en el mes de su mayoria):
//   Agosto 2026 arranca sabado 1/8 -> semanas del mes: 1, 8, 15, 22 (1/8..28/8).
//   La semana del 29/8 (29/8..4/9) pertenece a SEPTIEMBRE.
const AUG: BudgetScope = { kind: "month", yyyymm: "2026-08" };
const SEP: BudgetScope = { kind: "month", yyyymm: "2026-09" };
const JUL: BudgetScope = { kind: "month", yyyymm: "2026-07" };
const WEEK_AUG_8: BudgetScope = { kind: "week", weekStart: "2026-08-08" };

const RATES: Record<string, number> = { USD: 1, DKK: 6.9, EUR: 0.92, ARS: 1000 };

function exp(p: Partial<SpendingExpense>): SpendingExpense {
  return { amount: 100, currency: "DKK", spentOn: "2026-08-10", categoryId: null, deletedAt: null, ...p };
}

function cat(p: Partial<SpendingCategory>): SpendingCategory {
  return { id: "c", archived: false, hiddenFromChart: false, deletedAt: null, ...p };
}

describe("hiddenCategoryIds", () => {
  it("solo las ocultas y vivas", () => {
    const ids = hiddenCategoryIds([
      cat({ id: "a", hiddenFromChart: true }),
      cat({ id: "b" }),
      cat({ id: "c", hiddenFromChart: true, archived: true }),
    ]);
    expect([...ids]).toEqual(["a"]);
  });

  it("vacio => set vacio", () => {
    expect(hiddenCategoryIds([]).size).toBe(0);
  });
});

describe("budgetPeriodByCategory", () => {
  it("mapea categoria -> periodo", () => {
    const m = budgetPeriodByCategory([
      { categoryId: "a", period: "weekly" },
      { categoryId: "b", period: "monthly" },
    ]);
    expect(m.get("a")).toBe("weekly");
    expect(m.get("b")).toBe("monthly");
    expect(m.get("z")).toBeUndefined();
  });
});

describe("expenseInPeriodScope", () => {
  const periods = budgetPeriodByCategory([{ categoryId: "sem", period: "weekly" }]);

  it("borrado => nunca", () => {
    expect(expenseInPeriodScope(exp({ deletedAt: "2026-08-11" }), AUG, periods)).toBe(false);
  });

  it("sin presupuesto / sin categoria => mes calendario", () => {
    expect(expenseInPeriodScope(exp({ spentOn: "2026-08-31" }), AUG, periods)).toBe(true);
    expect(expenseInPeriodScope(exp({ spentOn: "2026-08-01" }), AUG, periods)).toBe(true);
    expect(expenseInPeriodScope(exp({ spentOn: "2026-07-31" }), AUG, periods)).toBe(false);
    expect(expenseInPeriodScope(exp({ spentOn: "2026-09-01" }), AUG, periods)).toBe(false);
  });

  it("categoria semanal mirada por mes => semanas enteras del mes", () => {
    const e31 = exp({ categoryId: "sem", spentOn: "2026-08-31" });
    // 31/8 cae en la semana del 29/8, que es de septiembre.
    expect(expenseInPeriodScope(e31, AUG, periods)).toBe(false);
    expect(expenseInPeriodScope(e31, SEP, periods)).toBe(true);
    expect(expenseInPeriodScope(exp({ categoryId: "sem", spentOn: "2026-08-28" }), AUG, periods)).toBe(true);
  });

  it("scope de semana: sab..vie inclusive", () => {
    expect(expenseInPeriodScope(exp({ spentOn: "2026-08-08" }), WEEK_AUG_8, periods)).toBe(true);
    expect(expenseInPeriodScope(exp({ spentOn: "2026-08-14" }), WEEK_AUG_8, periods)).toBe(true);
    expect(expenseInPeriodScope(exp({ spentOn: "2026-08-07" }), WEEK_AUG_8, periods)).toBe(false);
    expect(expenseInPeriodScope(exp({ spentOn: "2026-08-15" }), WEEK_AUG_8, periods)).toBe(false);
  });
});

describe("expenseCountsInTotal", () => {
  const periods = new Map<string, "monthly" | "weekly">();
  const hidden = new Set(["oculta"]);

  it("categoria oculta => no cuenta", () => {
    expect(expenseCountsInTotal(exp({ categoryId: "oculta" }), AUG, hidden, periods)).toBe(false);
  });

  it("sin categoria o categoria desconocida => cuenta", () => {
    expect(expenseCountsInTotal(exp({ categoryId: null }), AUG, hidden, periods)).toBe(true);
    expect(expenseCountsInTotal(exp({ categoryId: "borrada" }), AUG, hidden, periods)).toBe(true);
  });

  it("fuera del periodo => no cuenta", () => {
    expect(expenseCountsInTotal(exp({ spentOn: "2026-09-02" }), AUG, hidden, periods)).toBe(false);
  });
});

describe("expensesInScope", () => {
  it("filtra por periodo y borrado pero NO por ocultas", () => {
    const a = exp({ categoryId: "oculta" });
    const b = exp({ spentOn: "2026-09-02" });
    const c = exp({ deletedAt: "x" });
    const d = exp({ categoryId: "sem", spentOn: "2026-08-30" });
    const out = expensesInScope(AUG, [a, b, c, d], [{ categoryId: "sem", period: "weekly" }]);
    expect(out).toEqual([a]);
  });

  it("lista vacia => vacia", () => {
    expect(expensesInScope(AUG, [], [])).toEqual([]);
  });
});

describe("totalSpentIn", () => {
  const categories = [
    cat({ id: "oculta", hiddenFromChart: true }),
    cat({ id: "archOculta", hiddenFromChart: true, archived: true }),
    cat({ id: "comida" }),
  ];

  it("sin gastos => 0", () => {
    expect(totalSpentIn(AUG, { expenses: [], categories, budgets: [], ratesPerUsd: RATES })).toBe(0);
  });

  it("incluye sin categoria y archivadas (aunque tengan el flag), excluye ocultas vivas y borrados", () => {
    const total = totalSpentIn(AUG, {
      expenses: [
        exp({ amount: 10, categoryId: "comida" }),
        exp({ amount: 20, categoryId: null }),
        exp({ amount: 40, categoryId: "archOculta" }),
        exp({ amount: 80, categoryId: "oculta" }),
        exp({ amount: 160, deletedAt: "2026-08-12" }),
        exp({ amount: 320, spentOn: "2026-07-31" }),
      ],
      categories,
      budgets: [],
      ratesPerUsd: RATES,
    });
    expect(total).toBeCloseTo(70);
  });

  it("convierte cada gasto a DKK antes de sumar", () => {
    const total = totalSpentIn(AUG, {
      expenses: [
        exp({ amount: 10, currency: "USD" }), // 69
        exp({ amount: 92, currency: "EUR" }), // 690
        exp({ amount: 1000, currency: "ARS" }), // 6.9
        exp({ amount: 1, currency: "DKK" }),
      ],
      categories: [],
      budgets: [],
      ratesPerUsd: RATES,
    });
    expect(total).toBeCloseTo(69 + 690 + 6.9 + 1);
  });

  it("montos negativos (devoluciones) restan", () => {
    const total = totalSpentIn(AUG, {
      expenses: [exp({ amount: 100 }), exp({ amount: -30 })],
      categories: [],
      budgets: [],
      ratesPerUsd: RATES,
    });
    expect(total).toBeCloseTo(70);
  });

  it("respeta el periodo semanal del presupuesto de la categoria", () => {
    const input = {
      expenses: [exp({ amount: 50, categoryId: "comida", spentOn: "2026-08-30" })],
      categories,
      budgets: [{ categoryId: "comida", period: "weekly" as const }],
      ratesPerUsd: RATES,
    };
    expect(totalSpentIn(AUG, input)).toBe(0);
    expect(totalSpentIn(SEP, input)).toBeCloseTo(50);
  });
});

describe("budgetsInScope", () => {
  const budgets: SpendingBudget[] = [
    { categoryId: "viva", period: "monthly" },
    { categoryId: "borrada", period: "monthly" },
  ];

  it("sin categorias borradas devuelve la misma lista", () => {
    expect(budgetsInScope(AUG, budgets, [cat({ id: "viva" })])).toBe(budgets);
    expect(budgetsInScope(AUG, budgets, [])).toBe(budgets);
  });

  it("el tope de una categoria borrada cuenta ANTES del mes del borrado y deja de contar desde ese mes", () => {
    const deletedAt = new Date(2026, 7, 10, 12, 0).toISOString(); // 10/8 local
    const categories = [cat({ id: "viva" }), cat({ id: "borrada", deletedAt })];
    expect(budgetsInScope(JUL, budgets, categories).map((b) => b.categoryId)).toEqual(["viva", "borrada"]);
    expect(budgetsInScope(AUG, budgets, categories).map((b) => b.categoryId)).toEqual(["viva"]);
    expect(budgetsInScope(SEP, budgets, categories).map((b) => b.categoryId)).toEqual(["viva"]);
  });

  it("usa el dia LOCAL del borrado, no el corte del ISO en UTC", () => {
    // 31/7 23:30 local: segun la zona horaria, en UTC puede figurar como 1/8.
    const deletedAt = new Date(2026, 6, 31, 23, 30).toISOString();
    const categories = [cat({ id: "borrada", deletedAt })];
    const out = budgetsInScope(JUL, [{ categoryId: "borrada", period: "monthly" }], categories);
    expect(out).toEqual([]);
  });

  it("presupuesto semanal: el mes del borrado es el de su semana", () => {
    // 30/8 esta en la semana del 29/8, que pertenece a septiembre.
    const deletedAt = new Date(2026, 7, 30, 12, 0).toISOString();
    const weekly: SpendingBudget[] = [{ categoryId: "borrada", period: "weekly" }];
    const categories = [cat({ id: "borrada", deletedAt })];
    expect(budgetsInScope(AUG, weekly, categories)).toHaveLength(1);
    expect(budgetsInScope(SEP, weekly, categories)).toHaveLength(0);
  });

  it("scope de semana usa el mes de esa semana", () => {
    const deletedAt = new Date(2026, 7, 10, 12, 0).toISOString();
    const categories = [cat({ id: "borrada", deletedAt })];
    const lastJulyWeek: BudgetScope = { kind: "week", weekStart: "2026-07-25" };
    expect(budgetsInScope(lastJulyWeek, budgets, categories)).toHaveLength(2);
    expect(budgetsInScope(WEEK_AUG_8, budgets, categories)).toHaveLength(1);
  });

  it("deletedAt ISO sin zona se toma como hora local", () => {
    const categories = [cat({ id: "borrada", deletedAt: "2026-08-15T12:00:00" })];
    expect(budgetsInScope(AUG, budgets, categories)).toHaveLength(1);
    expect(budgetsInScope(JUL, budgets, categories)).toHaveLength(2);
  });
});
