import { describe, expect, it } from "vitest";
import {
  budgetAmountFor,
  describeScope,
  expenseInScope,
  expenseInScopeFor,
  monthWeekRange,
  sumBudgetsFor,
  type BudgetScope,
  type PeriodicBudget,
} from "./budgetPeriod";

// Septiembre 2026 tiene 5 semanas (sáb 29/08 .. vie 02/10); octubre 2026 tiene 4
// (sáb 03/10 .. vie 30/10). La semana del sáb 31/10 es de noviembre.
const SEP: BudgetScope = { kind: "month", yyyymm: "2026-09" };
const OCT: BudgetScope = { kind: "month", yyyymm: "2026-10" };
const week = (weekStart: string): BudgetScope => ({ kind: "week", weekStart });
const weekly = (amount: number): PeriodicBudget => ({ monthlyAmount: amount, period: "weekly" });
const monthly = (amount: number): PeriodicBudget => ({ monthlyAmount: amount, period: "monthly" });

describe("budgetAmountFor", () => {
  it("semanal sobre una semana: el monto tal cual", () => {
    expect(budgetAmountFor(weekly(300), week("2026-09-26"))).toBe(300);
  });

  it("semanal sobre un mes: monto × semanas reales del mes", () => {
    expect(budgetAmountFor(weekly(300), SEP)).toBe(1500);
    expect(budgetAmountFor(weekly(300), OCT)).toBe(1200);
  });

  it("mensual sobre un mes: el monto tal cual", () => {
    expect(budgetAmountFor(monthly(1200), SEP)).toBe(1200);
  });

  it("mensual sobre una semana: parte proporcional del mes al que pertenece la semana", () => {
    expect(budgetAmountFor(monthly(1200), week("2026-10-10"))).toBe(300);
    // sáb 29/08 pertenece a septiembre (5 semanas)
    expect(budgetAmountFor(monthly(1200), week("2026-08-29"))).toBe(240);
    // sáb 31/10 pertenece a noviembre (4 semanas)
    expect(budgetAmountFor(monthly(1200), week("2026-10-31"))).toBe(300);
  });

  it("un semanal sumado sobre los 12 meses da 52/53 semanas, sin doble conteo", () => {
    const yearTotal = (y: number) =>
      Array.from({ length: 12 }, (_, i) =>
        budgetAmountFor(weekly(1), { kind: "month", yyyymm: `${y}-${String(i + 1).padStart(2, "0")}` }),
      ).reduce((a, b) => a + b, 0);
    expect(yearTotal(2026)).toBe(52);
    expect(yearTotal(2030)).toBe(53);
  });

  it("un mensual sumado sobre las semanas de su mes da el mes completo", () => {
    const weeks = ["2026-08-29", "2026-09-05", "2026-09-12", "2026-09-19", "2026-09-26"];
    const total = weeks.reduce((s, w) => s + budgetAmountFor(monthly(1000), week(w)), 0);
    expect(total).toBeCloseTo(1000);
  });

  it("monto 0", () => {
    expect(budgetAmountFor(weekly(0), SEP)).toBe(0);
    expect(budgetAmountFor(monthly(0), week("2026-09-26"))).toBe(0);
  });
});

describe("sumBudgetsFor", () => {
  it("suma mezclando periodos", () => {
    expect(sumBudgetsFor([weekly(100), monthly(1000)], SEP)).toBe(1500);
    expect(sumBudgetsFor([weekly(100), monthly(1000)], week("2026-10-03"))).toBe(350);
  });

  it("lista vacía => 0", () => {
    expect(sumBudgetsFor([], SEP)).toBe(0);
  });
});

describe("expenseInScope", () => {
  it("mes calendario", () => {
    expect(expenseInScope("2026-09-01", SEP)).toBe(true);
    expect(expenseInScope("2026-09-30", SEP)).toBe(true);
    expect(expenseInScope("2026-08-31", SEP)).toBe(false);
    expect(expenseInScope("2026-10-01", SEP)).toBe(false);
  });

  it("semana sábado..viernes, bordes inclusivos", () => {
    const w = week("2026-09-26");
    expect(expenseInScope("2026-09-26", w)).toBe(true);
    expect(expenseInScope("2026-10-02", w)).toBe(true);
    expect(expenseInScope("2026-09-25", w)).toBe(false);
    expect(expenseInScope("2026-10-03", w)).toBe(false);
  });

  it("semana que cruza el año", () => {
    const w = week("2026-12-26");
    expect(expenseInScope("2027-01-01", w)).toBe(true);
    expect(expenseInScope("2027-01-02", w)).toBe(false);
  });
});

describe("monthWeekRange", () => {
  it("del primer sábado del mes al viernes que cierra la última semana", () => {
    expect(monthWeekRange("2026-09")).toEqual({ from: "2026-08-29", to: "2026-10-02" });
    expect(monthWeekRange("2026-10")).toEqual({ from: "2026-10-03", to: "2026-10-30" });
  });

  it("meses consecutivos quedan contiguos", () => {
    expect(monthWeekRange("2026-11").from).toBe("2026-10-31");
    // sáb 26/12 tiene su martes el 29/12 => es de diciembre; enero arranca el 02/01
    expect(monthWeekRange("2026-12").to).toBe("2027-01-01");
    expect(monthWeekRange("2027-01").from).toBe("2027-01-02");
  });
});

describe("expenseInScopeFor", () => {
  it("semanal visto por mes usa las semanas del mes, no los días calendario", () => {
    expect(expenseInScopeFor("2026-08-30", SEP, "weekly")).toBe(true);
    expect(expenseInScopeFor("2026-10-01", SEP, "weekly")).toBe(true);
    expect(expenseInScopeFor("2026-10-01", OCT, "weekly")).toBe(false);
    expect(expenseInScopeFor("2026-10-31", OCT, "weekly")).toBe(false);
  });

  it("mensual visto por mes usa el mes calendario", () => {
    expect(expenseInScopeFor("2026-08-30", SEP, "monthly")).toBe(false);
    expect(expenseInScopeFor("2026-10-31", OCT, "monthly")).toBe(true);
  });

  it("vista por semana: igual para los dos periodos", () => {
    const w = week("2026-09-26");
    for (const p of ["weekly", "monthly"] as const) {
      expect(expenseInScopeFor("2026-10-02", w, p)).toBe(true);
      expect(expenseInScopeFor("2026-10-03", w, p)).toBe(false);
    }
  });
});

describe("describeScope", () => {
  it("semana => rango", () => {
    expect(describeScope(week("2026-09-26"))).toBe("26/09 – 02/10");
  });

  it("mes => cantidad de semanas", () => {
    expect(describeScope(SEP)).toBe("5 semanas");
    expect(describeScope(OCT)).toBe("4 semanas");
  });
});
