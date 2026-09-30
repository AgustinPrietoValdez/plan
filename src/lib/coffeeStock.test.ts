import { describe, expect, it } from "vitest";
import type { BrewSession, CoffeeBean } from "../types";
import {
  LOW_STOCK_G,
  activeBeans,
  avgFlowGs,
  isLowStock,
  lastSession,
  lastSessionFor,
  sessionRatio,
} from "./coffeeStock";

function bean(p: Partial<CoffeeBean>): CoffeeBean {
  return {
    id: "b", name: "b", roaster: "", varietal: "", country: "", process: "", producer: "",
    roastedOn: null, weightGrams: 250, initialWeightGrams: 250, notes: "", cataInicial: "",
    notaFinal: "", lastTweak: null, finishedAt: null, rating: null, flavorTags: [],
    createdAt: "", updatedAt: "", deletedAt: null, version: 1, ...p,
  };
}

function session(p: Partial<BrewSession>): BrewSession {
  return {
    id: "s", recipeId: null, recipeName: "", beanId: null, beanName: "", doseGrams: 15,
    totalWaterGrams: 250, durationMs: 180_000, notes: "", createdAt: "2026-09-01T10:00:00Z",
    updatedAt: "", deletedAt: null, version: 1, ...p,
  };
}

describe("isLowStock", () => {
  it("entre 1 y LOW_STOCK_G es bajo", () => {
    expect(isLowStock(bean({ weightGrams: 1 }))).toBe(true);
    expect(isLowStock(bean({ weightGrams: LOW_STOCK_G }))).toBe(true);
  });
  it("por encima del umbral no", () => {
    expect(isLowStock(bean({ weightGrams: LOW_STOCK_G + 1 }))).toBe(false);
  });
  it("0 g y negativos NO cuentan (se asume terminado)", () => {
    expect(isLowStock(bean({ weightGrams: 0 }))).toBe(false);
    expect(isLowStock(bean({ weightGrams: -5 }))).toBe(false);
  });
});

describe("activeBeans", () => {
  it("saca borrados y terminados", () => {
    const beans = [
      bean({ id: "a" }),
      bean({ id: "borrado", deletedAt: "2026-01-01" }),
      bean({ id: "terminado", finishedAt: "2026-01-01" }),
    ];
    expect(activeBeans(beans).map((b) => b.id)).toEqual(["a"]);
  });
  it("lista vacia", () => {
    expect(activeBeans([])).toEqual([]);
  });
});

describe("lastSessionFor / lastSession", () => {
  const s1 = session({ id: "s1", beanId: "x", createdAt: "2026-09-01T10:00:00Z" });
  const s2 = session({ id: "s2", beanId: "x", createdAt: "2026-09-03T10:00:00Z" });
  const s3 = session({ id: "s3", beanId: "y", createdAt: "2026-09-05T10:00:00Z" });

  it("ultimo brew del grano, sin depender del orden", () => {
    expect(lastSessionFor([s2, s1, s3], "x")?.id).toBe("s2");
    expect(lastSessionFor([s1, s3, s2], "x")?.id).toBe("s2");
  });
  it("grano sin brews => null", () => {
    expect(lastSessionFor([s1], "z")).toBeNull();
    expect(lastSessionFor([], "x")).toBeNull();
  });

  it("ultimo brew global, descartando borrados", () => {
    const borrado = session({ id: "del", createdAt: "2026-12-01T00:00:00Z", deletedAt: "2026-12-02" });
    expect(lastSession([s1, borrado, s3, s2])?.id).toBe("s3");
  });
  it("todo borrado o vacio => null", () => {
    expect(lastSession([])).toBeNull();
    expect(lastSession([session({ deletedAt: "x" })])).toBeNull();
  });
});

describe("avgFlowGs", () => {
  it("agua total / segundos", () => {
    expect(avgFlowGs(session({ totalWaterGrams: 300, durationMs: 150_000 }))).toBe(2);
  });
  it("null sin duracion o sin agua", () => {
    expect(avgFlowGs(session({ durationMs: 0 }))).toBeNull();
    expect(avgFlowGs(session({ durationMs: -1 }))).toBeNull();
    expect(avgFlowGs(session({ totalWaterGrams: 0 }))).toBeNull();
    expect(avgFlowGs(session({ durationMs: Number.NaN }))).toBeNull();
  });
});

describe("sessionRatio", () => {
  it("ratio 1:N redondeado", () => {
    expect(sessionRatio(session({ doseGrams: 15, totalWaterGrams: 250 }))).toBe(17);
    expect(sessionRatio(session({ doseGrams: 20, totalWaterGrams: 320 }))).toBe(16);
  });
  it("null sin dosis o sin agua", () => {
    expect(sessionRatio(session({ doseGrams: 0 }))).toBeNull();
    expect(sessionRatio(session({ totalWaterGrams: 0 }))).toBeNull();
  });
});
