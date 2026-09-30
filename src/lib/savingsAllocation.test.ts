import { describe, expect, it } from "vitest";
import type { SavingsGoal } from "../types";
import { allocatedAmount, allocateMonth, cappedPercent, maxPercent, overflowPercent } from "./savingsAllocation";

function goal(p: Partial<SavingsGoal>): SavingsGoal {
  return {
    id: "g", name: "g", targetAmount: null, savingsPercent: 0, isOverflowTarget: false,
    destinationAccountId: null, purchaseAccountId: null, position: 0, purchasedAt: null,
    active: true, priority: false, createdAt: "", updatedAt: "", deletedAt: null, version: 1,
    ...p,
  };
}

describe("maxPercent / cappedPercent", () => {
  it("sin objetivo no hay tope", () => {
    const g = goal({ savingsPercent: 80 });
    expect(maxPercent(g, 1000, 0)).toBe(Infinity);
    expect(cappedPercent(g, 1000, 0)).toBe(80);
  });

  it("baja el % al maximo que cubre lo que falta de la compra", () => {
    // Falta 300 de 500; con 1000 de sobrante el maximo es 30%.
    const g = goal({ targetAmount: 500, savingsPercent: 50 });
    expect(maxPercent(g, 1000, 200)).toBeCloseTo(30);
    expect(cappedPercent(g, 1000, 200)).toBeCloseTo(30);
  });

  it("no toca el % si entra", () => {
    const g = goal({ targetAmount: 500, savingsPercent: 10 });
    expect(cappedPercent(g, 1000, 200)).toBe(10);
  });

  it("se recalcula cuando cambia el sobrante", () => {
    const g = goal({ targetAmount: 500, savingsPercent: 50 });
    expect(cappedPercent(g, 1000, 0)).toBe(50); // 500 = justo lo que falta
    expect(cappedPercent(g, 2000, 0)).toBeCloseTo(25);
    expect(cappedPercent(g, 500, 0)).toBe(50); // sobrante chico: vuelve al % pedido
  });

  it("objetivo ya cubierto => 0%", () => {
    const g = goal({ targetAmount: 500, savingsPercent: 40 });
    expect(cappedPercent(g, 1000, 600)).toBe(0);
  });

  it("sin sobrante no hay tope (no divide por cero)", () => {
    const g = goal({ targetAmount: 500, savingsPercent: 40 });
    expect(maxPercent(g, 0, 0)).toBe(Infinity);
    expect(cappedPercent(g, -100, 0)).toBe(40);
  });
});

describe("overflowPercent", () => {
  it("lo que no se asigna va al overflow", () => {
    expect(overflowPercent([30, 20])).toBe(50);
  });
  it("nunca negativo", () => {
    expect(overflowPercent([70, 60])).toBe(0);
  });
});

describe("allocatedAmount", () => {
  it("nunca asigna mas que lo que falta de la compra", () => {
    const g = goal({ targetAmount: 500, savingsPercent: 90 });
    expect(allocatedAmount(g, 1000, 0, 200)).toBeCloseTo(300);
  });

  it("el overflow tambien queda topeado por la compra", () => {
    const g = goal({ targetAmount: 500, savingsPercent: 10, isOverflowTarget: true });
    expect(allocatedAmount(g, 1000, 60, 0)).toBeCloseTo(500);
  });

  it("sin objetivo: % + overflow sobre el sobrante", () => {
    const g = goal({ savingsPercent: 20, isOverflowTarget: true });
    expect(allocatedAmount(g, 1000, 30)).toBeCloseTo(500);
  });

  it("sobrante <= 0 => 0", () => {
    expect(allocatedAmount(goal({ savingsPercent: 50 }), 0, 0)).toBe(0);
    expect(allocatedAmount(goal({ savingsPercent: 50 }), -10, 0)).toBe(0);
  });

  it("escenario completo: el % que libera un goal topeado va al overflow", () => {
    const leftover = 1000;
    const bici = goal({ id: "bici", targetAmount: 100, savingsPercent: 50 });
    const fondo = goal({ id: "fondo", savingsPercent: 20, isOverflowTarget: true });
    const pcts = [cappedPercent(bici, leftover, 0), cappedPercent(fondo, leftover, 0)];
    expect(pcts[0]).toBeCloseTo(10);
    const overflow = overflowPercent(pcts);
    expect(overflow).toBeCloseTo(70);
    const total = allocatedAmount(bici, leftover, overflow, 0) + allocatedAmount(fondo, leftover, overflow, 0);
    expect(total).toBeCloseTo(leftover);
  });
});

describe("allocateMonth (overflow que se llena pasa al goal siguiente)", () => {
  it("sin overflow lleno, igual que allocatedAmount", () => {
    const rows = [
      { goal: goal({ id: "a", savingsPercent: 30 }), savedBefore: 0 },
      { goal: goal({ id: "b", savingsPercent: 20, isOverflowTarget: true }), savedBefore: 0 },
    ];
    const r = allocateMonth(rows, 1000);
    expect(r.map((x) => Math.round(x.amount))).toEqual([300, 700]);
  });

  it("lo que le sobra al overflow va al siguiente", () => {
    const rows = [
      { goal: goal({ id: "ov", targetAmount: 1000, savingsPercent: 0, isOverflowTarget: true }), savedBefore: 0 },
      { goal: goal({ id: "b", savingsPercent: 30 }), savedBefore: 0 },
    ];
    const r = allocateMonth(rows, 5000);
    expect(r[0].amount).toBeCloseTo(1000);
    expect(r[1].amount).toBeCloseTo(4000); // 1500 propios + 2500 que le sobraron al overflow
    expect(r[0].amount + r[1].amount).toBeCloseTo(5000);
  });

  it("si el siguiente tambien se llena, sigue al otro (dando la vuelta)", () => {
    const rows = [
      { goal: goal({ id: "c", savingsPercent: 10 }), savedBefore: 0 },
      { goal: goal({ id: "ov", targetAmount: 200, savingsPercent: 0, isOverflowTarget: true }), savedBefore: 0 },
      { goal: goal({ id: "b", targetAmount: 300, savingsPercent: 10 }), savedBefore: 0 },
    ];
    const r = allocateMonth(rows, 1000);
    expect(r[1].amount).toBeCloseTo(200);
    expect(r[2].amount).toBeCloseTo(300);
    expect(r[0].amount).toBeCloseTo(500); // 100 propios + 400 que dieron la vuelta
  });

  it("si nadie tiene lugar, el resto queda sin asignar", () => {
    const rows = [
      { goal: goal({ id: "ov", targetAmount: 100, savingsPercent: 0, isOverflowTarget: true }), savedBefore: 0 },
      { goal: goal({ id: "b", targetAmount: 100, savingsPercent: 10 }), savedBefore: 0 },
    ];
    const r = allocateMonth(rows, 1000);
    expect(r[0].amount + r[1].amount).toBeCloseTo(200);
  });

  it("sin sobrante no reparte nada", () => {
    const rows = [{ goal: goal({ id: "ov", targetAmount: 100, isOverflowTarget: true }), savedBefore: 0 }];
    expect(allocateMonth(rows, 0)[0].amount).toBe(0);
  });
});
