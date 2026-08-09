import { usePatchShoppingItem } from "./queries";
import type { ShoppingItem } from "../types";

/** Toggle a shopping item's "bought" flag. Nothing more.
 *
 *  La lista de compras es PURAMENTE VISUAL: tildar un item ya no toca la
 *  despensa. El stock entra por una sola puerta — cargar el gasto real y
 *  vincular sus líneas al ingrediente (ver el bloque de stock en
 *  `repo/local.ts`) — y eso vive en el repo, no en un hook, porque sync y
 *  realtime escriben derecho en SQLite sin correr efectos de React.
 *
 *  Lo que había acá antes creaba un lote por unidad al tildar y los borraba al
 *  destildar, con el vencimiento contado desde HOY: cargar la compra un día
 *  tarde ya daba una fecha equivocada, y no había ni precio ni comercio.
 *
 *  Sigue devolviendo una promesa (misma firma que antes) para que los llamadores
 *  puedan deshabilitar el control mientras está en vuelo. */
export function useToggleBought() {
  const patchItem = usePatchShoppingItem();

  return async (item: ShoppingItem, nextBought: boolean) => {
    await patchItem.mutateAsync({ id: item.id, patch: { bought: nextBought } });
  };
}
