import { afterEach, describe, expect, it, vi } from "vitest";
import type { Expense, ExpenseLineItem, IngredientPresentation } from "../types";
import {
  avgPriceLast3Months,
  buildPriceHistory,
  byMerchant,
  cheapestMerchant,
  estimatedUnitPrice,
  type PriceEntry,
} from "./priceHistory";

const RATES: Record<string, number> = { USD: 1, DKK: 6.9, EUR: 0.92, ARS: 1000 };

function expense(p: Partial<Expense>): Expense {
  return {
    id: "e1", name: "", amount: 0, currency: "DKK", categoryId: null, spentOn: "2026-06-01", note: "",
    merchantId: null, accountId: null, goalId: null, recurrence: null, recurrenceParentId: null,
    createdAt: "", updatedAt: "", deletedAt: null, version: 1,
    ...p,
  };
}

function line(p: Partial<ExpenseLineItem>): ExpenseLineItem {
  return {
    id: "l1", expenseId: "e1", name: "", quantity: 1, unitPrice: 10, ingredientId: "arroz",
    presentationId: null, baseQuantity: 1000, addToStock: false,
    createdAt: "", updatedAt: "", deletedAt: null, version: 1,
    ...p,
  };
}

function entry(p: Partial<PriceEntry>): PriceEntry {
  return {
    lineItemId: "l", expenseId: "e", ingredientId: "arroz", presentationId: null, spentOn: "2026-06-01",
    merchantId: null, baseQuantity: 1, totalPaid: 1, currency: "DKK", pricePerBaseUnit: 1,
    ...p,
  };
}

function pres(p: Partial<IngredientPresentation>): IngredientPresentation {
  return {
    id: "p", ingredientId: "arroz", label: "", size: 1000, price: 20, kind: "package",
    createdAt: "", updatedAt: "", deletedAt: null, version: 1,
    ...p,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("buildPriceHistory", () => {
  it("package: 2 x Arroz 1 kg a 25 => 50 / 2000 g", () => {
    const h = buildPriceHistory(
      [line({ quantity: 2, unitPrice: 25, baseQuantity: 2000 })],
      [expense({ merchantId: "netto" })],
      RATES,
    );
    const [e] = h.get("arroz")!;
    expect(e.totalPaid).toBe(50);
    expect(e.pricePerBaseUnit).toBeCloseTo(0.025);
    expect(e.merchantId).toBe("netto");
    expect(e.currency).toBe("DKK");
  });

  it("bulk: 750 g de salmon por 89", () => {
    const h = buildPriceHistory(
      [line({ ingredientId: "salmon", quantity: 1, unitPrice: 89, baseQuantity: 750 })],
      [expense({})],
      RATES,
    );
    expect(h.get("salmon")![0].pricePerBaseUnit).toBeCloseTo(89 / 750);
  });

  it("normaliza a DKK pero guarda totalPaid en la moneda del gasto", () => {
    const h = buildPriceHistory(
      [line({ quantity: 1, unitPrice: 10, baseQuantity: 100 })],
      [expense({ currency: "USD" })],
      RATES,
    );
    const [e] = h.get("arroz")!;
    expect(e.totalPaid).toBe(10);
    expect(e.currency).toBe("USD");
    expect(e.pricePerBaseUnit).toBeCloseTo(0.69);
  });

  it("descarta lineas/gastos que no sirven como historial", () => {
    const h = buildPriceHistory(
      [
        line({ id: "borrada", deletedAt: "x" }),
        line({ id: "libre", ingredientId: null }),
        line({ id: "sinBase", baseQuantity: 0 }),
        line({ id: "gratis", unitPrice: 0 }),
        line({ id: "negativa", unitPrice: -5 }),
        line({ id: "huerfana", expenseId: "noExiste" }),
        line({ id: "gastoBorrado", expenseId: "e2" }),
      ],
      [expense({}), expense({ id: "e2", deletedAt: "x" })],
      RATES,
    );
    expect(h.size).toBe(0);
  });

  it("sin datos => mapa vacio", () => {
    expect(buildPriceHistory([], [], RATES).size).toBe(0);
  });

  it("agrupa por ingrediente y ordena mas reciente primero, empate por id de linea", () => {
    const h = buildPriceHistory(
      [
        line({ id: "b", expenseId: "viejo" }),
        line({ id: "z", expenseId: "nuevo" }),
        line({ id: "a", expenseId: "nuevo" }),
        line({ id: "leche", expenseId: "nuevo", ingredientId: "leche" }),
      ],
      [expense({ id: "viejo", spentOn: "2026-01-01" }), expense({ id: "nuevo", spentOn: "2026-05-01" })],
      RATES,
    );
    expect(h.get("arroz")!.map((e) => e.lineItemId)).toEqual(["a", "z", "b"]);
    expect(h.get("leche")).toHaveLength(1);
  });
});

describe("avgPriceLast3Months", () => {
  it("sin entradas => null", () => {
    expect(avgPriceLast3Months([], "2026-06-15")).toBeNull();
  });

  it("promedia solo la ventana de 3 meses (limite inclusive)", () => {
    const out = avgPriceLast3Months(
      [
        entry({ spentOn: "2026-06-10", pricePerBaseUnit: 2 }),
        entry({ spentOn: "2026-03-15", pricePerBaseUnit: 4 }), // justo en el corte
        entry({ spentOn: "2026-03-14", pricePerBaseUnit: 100 }), // afuera
      ],
      "2026-06-15",
    );
    expect(out).toEqual({ avg: 3, samples: 2 });
  });

  it("todo viejo => null", () => {
    expect(avgPriceLast3Months([entry({ spentOn: "2025-01-01" })], "2026-06-15")).toBeNull();
  });

  it("incluye fechas futuras", () => {
    expect(avgPriceLast3Months([entry({ spentOn: "2026-07-01", pricePerBaseUnit: 5 })], "2026-06-15")).toEqual({
      avg: 5,
      samples: 1,
    });
  });

  it("si hay muestras en DKK descarta las convertidas", () => {
    const out = avgPriceLast3Months(
      [
        entry({ currency: "DKK", pricePerBaseUnit: 2 }),
        entry({ currency: "ARS", pricePerBaseUnit: 50 }),
      ],
      "2026-06-15",
    );
    expect(out).toEqual({ avg: 2, samples: 1 });
  });

  it("si solo hay convertidas las usa", () => {
    const out = avgPriceLast3Months(
      [entry({ currency: "ARS", pricePerBaseUnit: 3 }), entry({ currency: "USD", pricePerBaseUnit: 5 })],
      "2026-06-15",
    );
    expect(out).toEqual({ avg: 4, samples: 2 });
  });

  it("fin de mes: 31/5 - 3 meses rueda a principios de marzo", () => {
    // 31/2 no existe -> 3/3. Una compra del 2/3 queda afuera, la del 3/3 adentro.
    const out = avgPriceLast3Months(
      [entry({ spentOn: "2026-03-03", pricePerBaseUnit: 1 }), entry({ spentOn: "2026-03-02", pricePerBaseUnit: 9 })],
      "2026-05-31",
    );
    expect(out).toEqual({ avg: 1, samples: 1 });
  });

  it("cruce de año: 15/1 - 3 meses = 15/10 del año anterior", () => {
    const out = avgPriceLast3Months(
      [entry({ spentOn: "2025-10-15", pricePerBaseUnit: 2 }), entry({ spentOn: "2025-10-14", pricePerBaseUnit: 9 })],
      "2026-01-15",
    );
    expect(out).toEqual({ avg: 2, samples: 1 });
  });
});

describe("estimatedUnitPrice", () => {
  const today = () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15, 12, 0));
  };

  it("1) promedio de 3 meses si hay compras recientes", () => {
    today();
    const history = new Map([
      ["arroz", [entry({ spentOn: "2026-06-01", pricePerBaseUnit: 2 }), entry({ spentOn: "2026-05-01", pricePerBaseUnit: 4 })]],
    ]);
    expect(estimatedUnitPrice("arroz", history, [pres({ price: 1 })])).toBeCloseTo(3);
  });

  it("2) si todo es viejo, la compra mas reciente", () => {
    today();
    const history = new Map([
      ["arroz", [entry({ spentOn: "2025-12-01", pricePerBaseUnit: 7 }), entry({ spentOn: "2025-01-01", pricePerBaseUnit: 1 })]],
    ]);
    expect(estimatedUnitPrice("arroz", history, [])).toBe(7);
  });

  it("2) la mas reciente prefiere DKK sobre convertidas", () => {
    today();
    const history = new Map([
      [
        "arroz",
        [
          entry({ spentOn: "2025-12-01", currency: "ARS", pricePerBaseUnit: 50 }),
          entry({ spentOn: "2025-11-01", currency: "DKK", pricePerBaseUnit: 3 }),
        ],
      ],
    ]);
    expect(estimatedUnitPrice("arroz", history, [])).toBe(3);
  });

  it("3) catalogo: package se divide por size, bulk ya es por unidad; gana el mas barato", () => {
    const presentations = [
      pres({ id: "1kg", kind: "package", size: 1000, price: 30 }), // 0.03
      pres({ id: "granel", kind: "bulk", size: 0, price: 0.02 }), // 0.02
      pres({ id: "5kg", kind: "package", size: 5000, price: 125 }), // 0.025
    ];
    expect(estimatedUnitPrice("arroz", new Map(), presentations)).toBeCloseTo(0.02);
  });

  it("bulk no lee size (aunque sea 0 o basura)", () => {
    expect(estimatedUnitPrice("arroz", new Map(), [pres({ kind: "bulk", size: 999, price: 0.5 })])).toBe(0.5);
  });

  it("ignora presentaciones de otro ingrediente, borradas, sin precio o con size invalido", () => {
    const presentations = [
      pres({ ingredientId: "otro", price: 0.001 }),
      pres({ deletedAt: "x", price: 0.001 }),
      pres({ price: null }),
      pres({ price: 0 }),
      pres({ price: -3 }),
      pres({ kind: "package", size: 0, price: 5 }),
    ];
    expect(estimatedUnitPrice("arroz", new Map(), presentations)).toBeNull();
  });

  it("sin historial ni catalogo => null", () => {
    expect(estimatedUnitPrice("arroz", new Map(), [])).toBeNull();
  });
});

describe("byMerchant", () => {
  it("agrupa por comercio conservando null", () => {
    const a = entry({ merchantId: "netto" });
    const b = entry({ merchantId: null });
    const c = entry({ merchantId: "netto" });
    const m = byMerchant([a, b, c]);
    expect(m.get("netto")).toEqual([a, c]);
    expect(m.get(null)).toEqual([b]);
  });

  it("vacio => mapa vacio", () => {
    expect(byMerchant([]).size).toBe(0);
  });
});

describe("cheapestMerchant", () => {
  it("sin entradas => null", () => {
    expect(cheapestMerchant([])).toBeNull();
  });

  it("compara promedios por comercio, no el minimo absoluto", () => {
    const out = cheapestMerchant([
      // netto: promo de 1 y normal de 9 -> promedio 5
      entry({ merchantId: "netto", pricePerBaseUnit: 1 }),
      entry({ merchantId: "netto", pricePerBaseUnit: 9 }),
      // lidl: siempre 4
      entry({ merchantId: "lidl", pricePerBaseUnit: 4 }),
      entry({ merchantId: "lidl", pricePerBaseUnit: 4 }),
    ]);
    expect(out).toEqual({ merchantId: "lidl", price: 4 });
  });

  it("puede ganar el grupo sin comercio (null)", () => {
    expect(cheapestMerchant([entry({ merchantId: null, pricePerBaseUnit: 1 }), entry({ merchantId: "x", pricePerBaseUnit: 2 })]))
      .toEqual({ merchantId: null, price: 1 });
  });

  it("descarta las convertidas si hay muestras en DKK", () => {
    const out = cheapestMerchant([
      entry({ merchantId: "ar", currency: "ARS", pricePerBaseUnit: 0.1 }),
      entry({ merchantId: "dk", currency: "DKK", pricePerBaseUnit: 2 }),
    ]);
    expect(out).toEqual({ merchantId: "dk", price: 2 });
  });
});
