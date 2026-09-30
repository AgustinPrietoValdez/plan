import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  Ingredient,
  IngredientCategory,
  IngredientPresentation,
  InventoryItem,
  Recipe,
  RecipeIngredient,
  ShoppingItem,
} from "../types";
import {
  aggregateCategoryNeed,
  aggregateNeed,
  categoryNeedToShoppingItems,
  findMergeTarget,
  mergeQuantities,
  neededToShoppingItems,
  planWeeklyMeals,
  suggestRecipesForExpiringLots,
} from "./compras";

const META = { createdAt: "", updatedAt: "", deletedAt: null, version: 1 };
const WEEK = "2026-09-26";

function item(p: Partial<ShoppingItem>): ShoppingItem {
  return {
    id: "i", name: "x", quantity: 1, bought: false, position: 0, ingredientId: null,
    presentationId: null, unit: null, baseQuantity: null, weekStart: WEEK, ...META, ...p,
  };
}
function ingredient(p: Partial<Ingredient>): Ingredient {
  return { id: "ing", name: "Ing", categoryId: null, dimension: "weight", shelfLifeDays: null, ...META, ...p };
}
function presentation(p: Partial<IngredientPresentation>): IngredientPresentation {
  return { id: "p", ingredientId: "ing", label: "p", size: 0, price: null, kind: "package", ...META, ...p };
}
function recipe(p: Partial<Recipe>): Recipe {
  return { id: "r", name: "r", servings: 2, mealType: "lunch_dinner", steps: [], ...META, ...p };
}
function ri(p: Partial<RecipeIngredient>): RecipeIngredient {
  return { id: "ri", recipeId: "r", ingredientId: null, categoryId: null, quantity: 0, ...META, ...p };
}
function lot(p: Partial<InventoryItem>): InventoryItem {
  return {
    id: "l", ingredientId: "ing", presentationId: null, quantity: 1, expiresOn: null,
    sourceLineItemId: null, ...META, ...p,
  };
}
function category(p: Partial<IngredientCategory>): IngredientCategory {
  return { id: "c", name: "Cat", hue: 0, position: 0, archived: false, ...META, ...p };
}

describe("findMergeTarget", () => {
  it("matchea por presentacion", () => {
    const a = item({ id: "a", presentationId: "p1", ingredientId: "ing" });
    const b = item({ id: "b", presentationId: "p2", ingredientId: "ing" });
    const r = findMergeTarget([a, b], { name: "otro", quantity: 1, weekStart: WEEK, presentationId: "p2", ingredientId: "ing" });
    expect(r?.id).toBe("b");
  });

  it("ignora items ya comprados", () => {
    const a = item({ id: "a", presentationId: "p1", bought: true });
    expect(findMergeTarget([a], { name: "x", quantity: 1, weekStart: WEEK, presentationId: "p1" })).toBeNull();
  });

  it("por ingrediente solo matchea items sin presentacion", () => {
    const withPres = item({ id: "a", ingredientId: "ing", presentationId: "p1" });
    const plain = item({ id: "b", ingredientId: "ing" });
    const add = { name: "x", quantity: 1, weekStart: WEEK, ingredientId: "ing" };
    expect(findMergeTarget([withPres], add)).toBeNull();
    expect(findMergeTarget([withPres, plain], add)?.id).toBe("b");
  });

  it("texto libre: por nombre, sin importar mayusculas ni espacios", () => {
    const a = item({ id: "a", name: "  Pan Lactal " });
    expect(findMergeTarget([a], { name: "pan lactal", quantity: 1, weekStart: WEEK })?.id).toBe("a");
  });

  it("texto libre no matchea items atados a un ingrediente", () => {
    const a = item({ id: "a", name: "Pan", ingredientId: "ing" });
    expect(findMergeTarget([a], { name: "Pan", quantity: 1, weekStart: WEEK })).toBeNull();
  });

  it("lista vacia => null", () => {
    expect(findMergeTarget([], { name: "x", quantity: 1, weekStart: WEEK })).toBeNull();
  });
});

describe("mergeQuantities", () => {
  it("paquetes: solo suma quantity y no agrega baseQuantity", () => {
    const r = mergeQuantities({ quantity: 2, baseQuantity: null }, { quantity: 3 });
    expect(r).toEqual({ quantity: 5 });
    expect("baseQuantity" in r).toBe(false);
  });

  it("granel: suma tambien baseQuantity", () => {
    expect(mergeQuantities({ quantity: 1, baseQuantity: 750 }, { quantity: 1, baseQuantity: 250 }))
      .toEqual({ quantity: 2, baseQuantity: 1000 });
  });

  it("si solo un lado tiene baseQuantity, se conserva", () => {
    expect(mergeQuantities({ quantity: 1, baseQuantity: null }, { quantity: 1, baseQuantity: 300 }))
      .toEqual({ quantity: 2, baseQuantity: 300 });
    expect(mergeQuantities({ quantity: 1, baseQuantity: 300 }, { quantity: 1, baseQuantity: null }))
      .toEqual({ quantity: 2, baseQuantity: 300 });
  });
});

describe("neededToShoppingItems", () => {
  const ing = ingredient({ id: "harina", name: "Harina", dimension: "weight" });
  const byId = new Map([[ing.id, ing]]);

  it("paquetes: un item por paquete con su cantidad", () => {
    const pres = [
      presentation({ id: "p1k", ingredientId: "harina", label: "1 kg", size: 1000 }),
      presentation({ id: "p300", ingredientId: "harina", label: "300 g", size: 300 }),
    ];
    const out = neededToShoppingItems(new Map([["harina", 1300]]), byId, new Map([["harina", pres]]), WEEK);
    expect(out).toEqual([
      { name: "Harina (1 kg)", quantity: 1, ingredientId: "harina", presentationId: "p1k", unit: null, weekStart: WEEK },
      { name: "Harina (300 g)", quantity: 1, ingredientId: "harina", presentationId: "p300", unit: null, weekStart: WEEK },
    ]);
  });

  it("solo granel: un item fijado a la variante bulk con baseQuantity", () => {
    const pres = [presentation({ id: "suelto", ingredientId: "harina", label: "suelta", kind: "bulk", size: 0 })];
    const out = neededToShoppingItems(new Map([["harina", 750]]), byId, new Map([["harina", pres]]), WEEK);
    expect(out).toEqual([
      { name: "Harina (suelta)", quantity: 1, baseQuantity: 750, ingredientId: "harina", presentationId: "suelto", unit: null, weekStart: WEEK },
    ]);
  });

  it("sin presentaciones: texto libre con la cantidad formateada", () => {
    const out = neededToShoppingItems(new Map([["harina", 1500]]), byId, new Map(), WEEK);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("Harina · 1,5 kg");
    expect(out[0].presentationId).toBeNull();
    expect(out[0].ingredientId).toBe("harina");
  });

  it("saltea cantidades <= 0 e ingredientes desconocidos", () => {
    const out = neededToShoppingItems(
      new Map([["harina", 0], ["fantasma", 100], ["otro", -3]]),
      byId,
      new Map(),
      WEEK,
    );
    expect(out).toEqual([]);
  });
});

describe("aggregateNeed / aggregateCategoryNeed", () => {
  it("escala por porciones / servings y suma por ingrediente", () => {
    const need = aggregateNeed([
      { recipeIngredients: [ri({ ingredientId: "a", quantity: 100 })], servings: 2, portions: 4 },
      { recipeIngredients: [ri({ ingredientId: "a", quantity: 50 }), ri({ ingredientId: "b", quantity: 10 })], servings: 1, portions: 1 },
    ]);
    expect(need.get("a")).toBe(250);
    expect(need.get("b")).toBe(10);
  });

  it("servings 0 => factor 1 (no divide por cero)", () => {
    const need = aggregateNeed([{ recipeIngredients: [ri({ ingredientId: "a", quantity: 30 })], servings: 0, portions: 5 }]);
    expect(need.get("a")).toBe(30);
  });

  it("slots genericos van solo por categoria", () => {
    const entries = [{
      recipeIngredients: [ri({ ingredientId: "a", quantity: 1 }), ri({ categoryId: "verdura", quantity: 2 })],
      servings: 2,
      portions: 3,
    }];
    const byIng = aggregateNeed(entries);
    const byCat = aggregateCategoryNeed(entries);
    expect([...byIng.keys()]).toEqual(["a"]);
    expect([...byCat.keys()]).toEqual(["verdura"]);
    expect(byCat.get("verdura")).toBe(3);
  });

  it("sin entradas => mapa vacio", () => {
    expect(aggregateNeed([]).size).toBe(0);
    expect(aggregateCategoryNeed([]).size).toBe(0);
  });
});

describe("categoryNeedToShoppingItems", () => {
  const cats = new Map([["v", category({ id: "v", name: "Verdura" })]]);

  it("item de texto libre con la cantidad", () => {
    expect(categoryNeedToShoppingItems(new Map([["v", 2]]), cats, WEEK)).toEqual([
      { name: "[Verdura] x2", quantity: 1, ingredientId: null, presentationId: null, unit: null, weekStart: WEEK },
    ]);
  });

  it("decimales con un digito", () => {
    expect(categoryNeedToShoppingItems(new Map([["v", 1.5]]), cats, WEEK)[0].name).toBe("[Verdura] x1.5");
  });

  it("saltea <= 0 y categorias desconocidas", () => {
    expect(categoryNeedToShoppingItems(new Map([["v", 0], ["zz", 3]]), cats, WEEK)).toEqual([]);
  });
});

describe("planWeeklyMeals", () => {
  it("round-robin hasta cubrir el objetivo", () => {
    const a = recipe({ id: "a", servings: 4 });
    const b = recipe({ id: "b", servings: 4 });
    const r = planWeeklyMeals([a, b], { breakfast_snack: 0, lunch_dinner: 10 });
    expect(r.get("a")).toBe(2);
    expect(r.get("b")).toBe(1);
  });

  it("para en cuanto alcanza, sin repetir si no hace falta", () => {
    const a = recipe({ id: "a", servings: 6 });
    const b = recipe({ id: "b", servings: 6 });
    const r = planWeeklyMeals([a, b], { breakfast_snack: 0, lunch_dinner: 6 });
    expect(r.get("a")).toBe(1);
    expect(r.has("b")).toBe(false);
  });

  it("separa por tipo de comida", () => {
    const desayuno = recipe({ id: "d", servings: 3, mealType: "breakfast_snack" });
    const cena = recipe({ id: "c", servings: 2, mealType: "lunch_dinner" });
    const r = planWeeklyMeals([desayuno, cena], { breakfast_snack: 7, lunch_dinner: 4 });
    expect(r.get("d")).toBe(3);
    expect(r.get("c")).toBe(2);
  });

  it("ignora recetas sin servings y objetivos <= 0", () => {
    const vacia = recipe({ id: "v", servings: 0 });
    expect(planWeeklyMeals([vacia], { breakfast_snack: 0, lunch_dinner: 5 }).size).toBe(0);
    expect(planWeeklyMeals([recipe({ id: "a" })], { breakfast_snack: 0, lunch_dinner: 0 }).size).toBe(0);
    expect(planWeeklyMeals([], { breakfast_snack: 5, lunch_dinner: 5 }).size).toBe(0);
  });
});

describe("suggestRecipesForExpiringLots", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 29, 12, 0, 0)); // 2026-09-29 local
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const r1 = recipe({ id: "r1" });
  const r2 = recipe({ id: "r2" });
  const ris = [
    ri({ recipeId: "r1", ingredientId: "leche" }),
    ri({ recipeId: "r1", ingredientId: "huevo" }),
    ri({ recipeId: "r2", ingredientId: "leche" }),
    ri({ recipeId: "r2", categoryId: "verdura" }),
  ];

  it("sin lotes por vencer => []", () => {
    expect(suggestRecipesForExpiringLots([], [r1, r2], ris)).toEqual([]);
    expect(suggestRecipesForExpiringLots([lot({ ingredientId: "leche" })], [r1], ris)).toEqual([]);
  });

  it("horizonte inclusivo: hoy+5 entra, hoy+6 no", () => {
    const dentro = suggestRecipesForExpiringLots([lot({ ingredientId: "huevo", expiresOn: "2026-10-04" })], [r1], ris);
    expect(dentro).toHaveLength(1);
    const fuera = suggestRecipesForExpiringLots([lot({ ingredientId: "huevo", expiresOn: "2026-10-05" })], [r1], ris);
    expect(fuera).toEqual([]);
  });

  it("respeta daysHorizon custom", () => {
    const l = [lot({ ingredientId: "huevo", expiresOn: "2026-10-05" })];
    expect(suggestRecipesForExpiringLots(l, [r1], ris, 6)).toHaveLength(1);
  });

  it("ignora lotes con cantidad <= 0", () => {
    const l = [lot({ ingredientId: "huevo", expiresOn: "2026-09-30", quantity: 0 })];
    expect(suggestRecipesForExpiringLots(l, [r1], ris)).toEqual([]);
  });

  it("rankea por cobertura y usa el lote mas urgente", () => {
    const l = [
      lot({ ingredientId: "leche", expiresOn: "2026-10-02" }),
      lot({ ingredientId: "leche", expiresOn: "2026-09-30" }),
      lot({ ingredientId: "huevo", expiresOn: "2026-10-01" }),
    ];
    const out = suggestRecipesForExpiringLots(l, [r2, r1], ris);
    expect(out.map((s) => s.recipe.id)).toEqual(["r1", "r2"]);
    expect(out[0].coverage).toBe(1);
    expect(out[0].earliestExpiry).toBe("2026-09-30");
    expect(out[0].matchedIngredientIds.sort()).toEqual(["huevo", "leche"]);
    // el slot generico cuenta en el denominador pero no matchea
    expect(out[1].coverage).toBe(0.5);
  });

  it("a igual cobertura, desempata por urgencia", () => {
    const ra = recipe({ id: "ra" });
    const rb = recipe({ id: "rb" });
    const rs = [ri({ recipeId: "ra", ingredientId: "x" }), ri({ recipeId: "rb", ingredientId: "y" })];
    const l = [lot({ ingredientId: "x", expiresOn: "2026-10-03" }), lot({ ingredientId: "y", expiresOn: "2026-10-01" })];
    expect(suggestRecipesForExpiringLots(l, [ra, rb], rs).map((s) => s.recipe.id)).toEqual(["rb", "ra"]);
  });

  it("recetas sin ingredientes no aparecen", () => {
    const l = [lot({ ingredientId: "leche", expiresOn: "2026-09-30" })];
    expect(suggestRecipesForExpiringLots(l, [recipe({ id: "vacia" })], ris)).toEqual([]);
  });
});
