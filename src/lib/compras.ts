import type {
  Ingredient,
  IngredientPresentation,
  InventoryItem,
  Recipe,
  RecipeIngredient,
  ShoppingItem,
} from "../types";
import type { ShoppingItemCreate } from "./repo";
import { formatQuantity, leastWastePresentation } from "./units";
import { fromYmd, todayYmd, ymd } from "./date";

/** Find an existing (not-yet-bought) list item that the new item should merge
 *  into, so adding the same thing twice sums quantities instead of duplicating.
 *  Matches by presentation, else by ingredient (no presentation), else by name. */
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

/** Build shopping-list items for a set of required ingredient quantities (base
 *  unit), choosing the presentation combination with the least waste. When an
 *  ingredient has no presentations, emit a single free-text item carrying the
 *  needed amount. `needByIngredient` maps ingredientId → required base quantity. */
export function neededToShoppingItems(
  needByIngredient: Map<string, number>,
  ingredientById: Map<string, Ingredient>,
  presentationsByIngredient: Map<string, IngredientPresentation[]>,
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
          });
        }
      }
    } else {
      out.push({
        name: `${ing.name} · ${formatQuantity(needed, ing.dimension)}`,
        quantity: 1,
        ingredientId: ing.id,
        presentationId: null,
        unit: null,
      });
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
      need.set(ri.ingredientId, (need.get(ri.ingredientId) ?? 0) + ri.quantity * factor);
    }
  }
  return need;
}
