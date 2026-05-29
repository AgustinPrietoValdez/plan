import {
  useCreateMealLog,
  useDeleteInventory,
  useInventory,
  usePatchInventory,
  useRecipeIngredients,
} from "./queries";
import type { MealSlot, MealType, Recipe } from "../types";

/** Default meal slot for a recipe's bucket (used when logging without an
 *  explicit slot). */
export function defaultSlot(mealType: MealType): MealSlot {
  return mealType === "breakfast_snack" ? "desayuno" : "almuerzo";
}

/** Returns a function that logs a meal (recipe + servings) and consumes the
 *  required amount of each ingredient from inventory lots, FIFO by expiry
 *  (soonest first). Lots that reach zero are removed. Ingredients with no
 *  stock are left as-is. */
export function useLogMeal() {
  const createMealLog = useCreateMealLog();
  const patchInventory = usePatchInventory();
  const deleteInventory = useDeleteInventory();
  const riQ = useRecipeIngredients();
  const inventoryQ = useInventory();

  return async (recipe: Recipe, cookedServings: number, eatenServings: number, slot: MealSlot, eatenOn: string) => {
    // meal_log records what was eaten (drives plan progress)
    if (eatenServings > 0) {
      await createMealLog.mutateAsync({ eatenOn, mealSlot: slot, recipeId: recipe.id, servings: eatenServings });
    }
    // ingredients are consumed by what was cooked
    if (cookedServings <= 0) return;
    const ris = (riQ.data ?? []).filter((ri) => ri.recipeId === recipe.id);
    const factor = recipe.servings > 0 ? cookedServings / recipe.servings : 1;
    const inv = inventoryQ.data ?? [];
    for (const ri of ris) {
      let need = ri.quantity * factor;
      if (need <= 0) continue;
      const lots = inv
        .filter((l) => l.ingredientId === ri.ingredientId)
        .sort((a, b) => (a.expiresOn ?? "9999").localeCompare(b.expiresOn ?? "9999"));
      for (const lot of lots) {
        if (need <= 0) break;
        const take = Math.min(lot.quantity, need);
        need -= take;
        const remaining = lot.quantity - take;
        if (remaining <= 0.0001) await deleteInventory.mutateAsync(lot.id);
        else await patchInventory.mutateAsync({ id: lot.id, patch: { quantity: remaining } });
      }
    }
  };
}
