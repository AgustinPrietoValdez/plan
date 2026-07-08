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
    // Consume ingredients FIRST, log the meal LAST: if the app is killed
    // partway through, worst case is inventory already deducted with no log
    // entry yet (re-runnable/harmless) rather than a log claiming the full
    // recipe was cooked while some ingredients were never deducted.
    if (cookedServings > 0) {
      const ris = (riQ.data ?? []).filter((ri) => ri.recipeId === recipe.id);
      const factor = recipe.servings > 0 ? cookedServings / recipe.servings : 1;
      // Local running quantities per lot, updated as each recipe_ingredient row
      // consumes — a snapshot read once and never updated would let a second
      // row for the same ingredient overwrite the first row's deduction.
      const remainingByLot = new Map<string, number>();
      for (const l of inventoryQ.data ?? []) remainingByLot.set(l.id, l.quantity);

      for (const ri of ris) {
        let need = ri.quantity * factor;
        if (need <= 0) continue;
        const lots = (inventoryQ.data ?? [])
          .filter((l) => l.ingredientId === ri.ingredientId)
          .sort((a, b) => (a.expiresOn ?? "9999").localeCompare(b.expiresOn ?? "9999"));
        for (const lot of lots) {
          if (need <= 0) break;
          const available = remainingByLot.get(lot.id) ?? lot.quantity;
          if (available <= 0) continue;
          const take = Math.min(available, need);
          need -= take;
          const remaining = available - take;
          remainingByLot.set(lot.id, remaining);
          if (remaining <= 0.0001) await deleteInventory.mutateAsync(lot.id);
          else await patchInventory.mutateAsync({ id: lot.id, patch: { quantity: remaining } });
        }
      }
    }
    // meal_log records what was eaten (drives plan progress)
    if (eatenServings > 0) {
      await createMealLog.mutateAsync({ eatenOn, mealSlot: slot, recipeId: recipe.id, servings: eatenServings });
    }
  };
}
