import {
  useCreateInventory,
  useDeleteInventory,
  useIngredientPresentations,
  useIngredients,
  useInventory,
  usePatchShoppingItem,
} from "./queries";
import { fromYmd, todayYmd, ymd } from "./date";
import type { ShoppingItem } from "../types";

/** Toggle a shopping item's "bought" flag. When the item is linked to a
 *  presentation, marking it bought adds that many inventory lots (one per
 *  unit, each with its own expiry from the ingredient's shelf life); un-marking
 *  removes that many still-full lots of the same presentation. */
export function useToggleBought() {
  const patchItem = usePatchShoppingItem();
  const createInventory = useCreateInventory();
  const deleteInventory = useDeleteInventory();
  const ingredientsQ = useIngredients();
  const presentationsQ = useIngredientPresentations();
  const inventoryQ = useInventory();

  return (item: ShoppingItem, nextBought: boolean) => {
    patchItem.mutate({ id: item.id, patch: { bought: nextBought } });
    if (!item.ingredientId || !item.presentationId) return;
    const pres = (presentationsQ.data ?? []).find((p) => p.id === item.presentationId);
    if (!pres) return;
    const count = Math.max(1, Math.round(item.quantity));

    if (nextBought) {
      let expiresOn: string | null = null;
      const ing = (ingredientsQ.data ?? []).find((i) => i.id === item.ingredientId);
      if (ing?.shelfLifeDays != null) {
        const d = fromYmd(todayYmd());
        d.setDate(d.getDate() + ing.shelfLifeDays);
        expiresOn = ymd(d);
      }
      for (let k = 0; k < count; k++) {
        createInventory.mutate({
          ingredientId: item.ingredientId,
          presentationId: pres.id,
          quantity: pres.size,
          expiresOn,
        });
      }
    } else {
      // undo: remove up to `count` still-full lots of this presentation (newest first)
      const lots = (inventoryQ.data ?? [])
        .filter(
          (l) =>
            l.ingredientId === item.ingredientId &&
            l.presentationId === item.presentationId &&
            Math.abs(l.quantity - pres.size) < 0.0001,
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      for (const lot of lots.slice(0, count)) deleteInventory.mutate(lot.id);
    }
  };
}
