import type {
  Ingredient,
  IngredientCategory,
  IngredientPresentation,
  InventoryItem,
  MealType,
  Recipe,
  RecipeIngredient,
  ShoppingItem,
} from "../types";
import type { ShoppingItemCreate } from "./repo";
import { formatQuantity, leastWastePresentation } from "./units";
import { fromYmd, todayYmd, ymd } from "./date";

/** Find an existing (not-yet-bought) list item that the new item should merge
 *  into, so adding the same thing twice sums quantities instead of duplicating.
 *  Matches by presentation, else by ingredient (no presentation), else by name.
 *  Bulk items carry a presentationId like any other, so two bulk adds of the
 *  same variante already find each other here — what they merge is computed by
 *  `mergeQuantities` below. */
export function findMergeTarget(
  existing: ShoppingItem[],
  add: ShoppingItemCreate,
): ShoppingItem | null {
  return (
    existing.find((it) => {
      if (it.bought) return false;
      if (add.presentationId) return it.presentationId === add.presentationId;
      if (add.ingredientId) return it.ingredientId === add.ingredientId && !it.presentationId;
      return !it.ingredientId && it.name.trim().toLowerCase() === add.name.trim().toLowerCase();
    }) ?? null
  );
}

/** The patch that merges `add` into the target returned by `findMergeTarget`.
 *  Package/free-text items only ever sum `quantity` (how many packages), which
 *  is what callers have always done. Bulk items carry the real amount in
 *  `baseQuantity` — `quantity` is INTEGER in SQLite and both editors round it,
 *  so 750 g cannot live there — and that amount has to add too, otherwise
 *  asking for salmon twice would silently keep only the first weight.
 *  `baseQuantity` is left out of the patch entirely when neither side has one,
 *  so a list with zero bulk items produces byte-identical patches. */
export function mergeQuantities(
  target: Pick<ShoppingItem, "quantity" | "baseQuantity">,
  add: Pick<ShoppingItemCreate, "quantity" | "baseQuantity">,
): { quantity: number; baseQuantity?: number } {
  const quantity = target.quantity + add.quantity;
  const base = (target.baseQuantity ?? 0) + (add.baseQuantity ?? 0);
  if (base <= 0) return { quantity };
  return { quantity, baseQuantity: base };
}

/** Build shopping-list items for a set of required ingredient quantities (base
 *  unit), choosing the presentation combination with the least waste.
 *  Three outcomes per ingredient, in order of preference:
 *   1. some package presentation fits → one item per package, `quantity` = how
 *      many of that package (unchanged behaviour);
 *   2. no package but a bulk one exists → a single item pinned to that bulk
 *      presentation with `quantity: 1` and the real amount in `baseQuantity`,
 *      so the link to the ingredient (and its price per base unit) survives;
 *   3. no presentations at all → free-text item, no ids.
 *  `needByIngredient` maps ingredientId → required base quantity. */
export function neededToShoppingItems(
  needByIngredient: Map<string, number>,
  ingredientById: Map<string, Ingredient>,
  presentationsByIngredient: Map<string, IngredientPresentation[]>,
  weekStart: string,
): ShoppingItemCreate[] {
  const out: ShoppingItemCreate[] = [];
  for (const [ingredientId, needed] of needByIngredient) {
    if (needed <= 0) continue;
    const ing = ingredientById.get(ingredientId);
    if (!ing) continue;
    const pres = presentationsByIngredient.get(ingredientId) ?? [];
    const choice = leastWastePresentation(needed, pres);
    if (choice) {
      for (const p of pres) {
        const count = choice.counts.get(p.id) ?? 0;
        if (count > 0) {
          out.push({
            name: `${ing.name} (${p.label})`,
            quantity: count,
            ingredientId: ing.id,
            presentationId: p.id,
            unit: null,
            weekStart,
          });
        }
      }
    } else {
      // No package covers this (or there is none). If the ingredient is sold
      // loose, keep the identity: pin the bulk presentation and put the amount
      // in baseQuantity. The name deliberately omits the amount — merges grow
      // baseQuantity without rewriting the name, so an amount baked into the
      // label would go stale. First bulk row wins; an ingredient with several
      // is a data-entry oddity, not a case worth ranking.
      const bulk = pres.find((p) => p.kind === "bulk");
      if (bulk) {
        out.push({
          name: `${ing.name} (${bulk.label})`,
          quantity: 1,
          baseQuantity: needed,
          ingredientId: ing.id,
          presentationId: bulk.id,
          unit: null,
          weekStart,
        });
      } else {
        out.push({
          name: `${ing.name} · ${formatQuantity(needed, ing.dimension)}`,
          quantity: 1,
          ingredientId: ing.id,
          presentationId: null,
          unit: null,
          weekStart,
        });
      }
    }
  }
  return out;
}

export interface RecipeSuggestion {
  recipe: Recipe;
  /** ingredientIds de la receta que coinciden con lotes por vencer */
  matchedIngredientIds: string[];
  /** matched.length / total ingredientes de la receta — [0,1] */
  coverage: number;
  /** YYYY-MM-DD del lote más urgente entre los matched */
  earliestExpiry: string;
}

/** Sugerir recetas propias que usen ingredientes con lotes por vencer.
 *  Sin IA, pura lógica. Rankea por cobertura (qué % de los ingredientes de la
 *  receta están entre los por vencer) y, a igualdad, por urgencia del lote más
 *  cercano a vencer. Filtra recetas sin ingredientes coincidentes. */
export function suggestRecipesForExpiringLots(
  inventory: InventoryItem[],
  recipes: Recipe[],
  recipeIngredients: RecipeIngredient[],
  daysHorizon = 5,
): RecipeSuggestion[] {
  const today = todayYmd();
  const horizonDate = (() => { const d = fromYmd(today); d.setDate(d.getDate() + daysHorizon); return ymd(d); })();
  const earliestByIngredient = new Map<string, string>();
  for (const lot of inventory) {
    if (!lot.expiresOn) continue;
    if (lot.quantity <= 0) continue;
    if (lot.expiresOn > horizonDate) continue;
    const prev = earliestByIngredient.get(lot.ingredientId);
    if (!prev || lot.expiresOn < prev) earliestByIngredient.set(lot.ingredientId, lot.expiresOn);
  }
  if (earliestByIngredient.size === 0) return [];

  const risByRecipe = new Map<string, RecipeIngredient[]>();
  for (const ri of recipeIngredients) {
    const arr = risByRecipe.get(ri.recipeId) ?? [];
    arr.push(ri);
    risByRecipe.set(ri.recipeId, arr);
  }

  const out: RecipeSuggestion[] = [];
  for (const recipe of recipes) {
    const ris = risByRecipe.get(recipe.id) ?? [];
    if (ris.length === 0) continue;
    const matched: string[] = [];
    let earliest: string | null = null;
    for (const ri of ris) {
      if (!ri.ingredientId) continue; // slot generico (categoria): no matchea lotes
      const exp = earliestByIngredient.get(ri.ingredientId);
      if (!exp) continue;
      matched.push(ri.ingredientId);
      if (!earliest || exp < earliest) earliest = exp;
    }
    if (matched.length === 0 || !earliest) continue;
    out.push({
      recipe,
      matchedIngredientIds: matched,
      coverage: matched.length / ris.length,
      earliestExpiry: earliest,
    });
  }

  out.sort((a, b) => {
    if (b.coverage !== a.coverage) return b.coverage - a.coverage;
    return a.earliestExpiry.localeCompare(b.earliestExpiry);
  });
  return out;
}

/** Sum required base quantities per ingredient across recipe ingredients,
 *  scaling each recipe by `portions / servings`. */
export function aggregateNeed(
  entries: { recipeIngredients: RecipeIngredient[]; servings: number; portions: number }[],
): Map<string, number> {
  const need = new Map<string, number>();
  for (const e of entries) {
    const factor = e.servings > 0 ? e.portions / e.servings : 1;
    for (const ri of e.recipeIngredients) {
      if (!ri.ingredientId) continue; // slot generico -> va por aggregateCategoryNeed
      need.set(ri.ingredientId, (need.get(ri.ingredientId) ?? 0) + ri.quantity * factor);
    }
  }
  return need;
}

/** Igual que aggregateNeed pero para los slots genericos (por categoria de
 *  ingrediente). Devuelve categoryId -> cantidad requerida. */
export function aggregateCategoryNeed(
  entries: { recipeIngredients: RecipeIngredient[]; servings: number; portions: number }[],
): Map<string, number> {
  const need = new Map<string, number>();
  for (const e of entries) {
    const factor = e.servings > 0 ? e.portions / e.servings : 1;
    for (const ri of e.recipeIngredients) {
      if (!ri.categoryId) continue;
      need.set(ri.categoryId, (need.get(ri.categoryId) ?? 0) + ri.quantity * factor);
    }
  }
  return need;
}

/** Convierte los slots genericos en items de lista de texto libre "[Categoria] · qty".
 *  El usuario elige el producto concreto al comprar. Merge por nombre lo une si
 *  dos recetas piden la misma categoria. */
export function categoryNeedToShoppingItems(
  needByCategory: Map<string, number>,
  categoryById: Map<string, IngredientCategory>,
  weekStart: string,
): ShoppingItemCreate[] {
  const out: ShoppingItemCreate[] = [];
  for (const [categoryId, needed] of needByCategory) {
    if (needed <= 0) continue;
    const cat = categoryById.get(categoryId);
    if (!cat) continue;
    const qtyText = Number.isInteger(needed) ? String(needed) : needed.toFixed(1);
    out.push({
      name: `[${cat.name}] x${qtyText}`,
      quantity: 1,
      ingredientId: null,
      presentationId: null,
      unit: null,
      weekStart,
    });
  }
  return out;
}

/** Pick how many times ("veces") to cook each recipe to fill each meal-type's
 *  weekly serving target. Favors variety over an exact fit: cycles round-robin
 *  through the candidate recipes for that meal type (never repeats one before
 *  trying the next), stopping as soon as the running total meets or passes the
 *  target — so any overshoot ("desperdicio") is bounded by the last recipe's
 *  own serving size, not compounded across the whole plan. Recipes with no
 *  servings, or meal types with no target/candidates, are skipped. */
export function planWeeklyMeals(
  recipes: Recipe[],
  targets: Record<MealType, number>,
): Map<string, number> {
  const times = new Map<string, number>();
  const buckets: MealType[] = ["breakfast_snack", "lunch_dinner"];
  for (const bucket of buckets) {
    const target = targets[bucket] ?? 0;
    if (target <= 0) continue;
    const candidates = recipes.filter((r) => r.mealType === bucket && r.servings > 0);
    if (candidates.length === 0) continue;
    let remaining = target;
    let idx = 0;
    while (remaining > 0) {
      const r = candidates[idx % candidates.length];
      times.set(r.id, (times.get(r.id) ?? 0) + 1);
      remaining -= r.servings;
      idx++;
    }
  }
  return times;
}
