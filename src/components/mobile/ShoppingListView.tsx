import { useEffect, useMemo, useState } from "react";
import {
  useCreateShoppingItem,
  useDeleteShoppingItem,
  useIngredientPresentations,
  useIngredients,
  usePatchShoppingItem,
  useShoppingItems,
} from "../../lib/queries";
import { findMergeTarget } from "../../lib/compras";
import { fmtMoney, fmtUsdFromDkk } from "../../lib/money";
import { useUsdRate } from "../../lib/useUsdRate";
import { useToggleBought } from "../../lib/useToggleBought";
import type { IngredientPresentation, ShoppingItem } from "../../types";

export function ShoppingListView() {
  const itemsQ = useShoppingItems();
  const presentationsQ = useIngredientPresentations();
  const patchItem = usePatchShoppingItem();
  const deleteItem = useDeleteShoppingItem();
  const toggleBought = useToggleBought();
  const usdRate = useUsdRate();
  const [sheetOpen, setSheetOpen] = useState(false);

  const items = itemsQ.data ?? [];
  const priceById = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const p of presentationsQ.data ?? []) m.set(p.id, p.price);
    return m;
  }, [presentationsQ.data]);
  const itemPrice = (it: ShoppingItem): number | null => {
    if (!it.presentationId) return null;
    const unit = priceById.get(it.presentationId);
    return unit == null ? null : unit * it.quantity;
  };
  const { pending, bought } = useMemo(() => {
    const pending: ShoppingItem[] = [];
    const bought: ShoppingItem[] = [];
    for (const it of items) (it.bought ? bought : pending).push(it);
    return { pending, bought };
  }, [items]);
  const total = items.reduce((s, it) => s + (itemPrice(it) ?? 0), 0);

  const setQtyAbs = (it: ShoppingItem, n: number) => {
    const next = Math.max(1, n);
    if (next !== it.quantity) patchItem.mutate({ id: it.id, patch: { quantity: next } });
  };

  const clearBought = () => {
    if (bought.length === 0) return;
    if (!window.confirm(`Vaciar ${bought.length} producto(s) comprado(s)?`)) return;
    for (const it of bought) deleteItem.mutate(it.id);
  };

  return (
    <div className="m-shopping">
      {total > 0 && (
        <div className="m-total">
          <span>Total · {items.length} {items.length === 1 ? "ítem" : "ítems"}</span>
          <span>
            <strong>{fmtMoney(total)}</strong> <span style={{ color: "var(--fg-subtle)" }}>≈ {fmtUsdFromDkk(total, usdRate)}</span>
          </span>
        </div>
      )}
      {itemsQ.isLoading ? (
        <p className="m-empty">Cargando…</p>
      ) : items.length === 0 ? (
        <p className="m-empty">La lista está vacía. Tocá el botón + para agregar.</p>
      ) : (
        <ul className="m-list">
          {pending.map((it) => (
            <ItemRow
              key={it.id}
              item={it}
              price={itemPrice(it)}
              usdRate={usdRate}
              onToggle={() => toggleBought(it, !it.bought)}
              onSetQty={(n) => setQtyAbs(it, n)}
              onDelete={() => deleteItem.mutate(it.id)}
            />
          ))}
          {bought.length > 0 && (
            <li className="m-section-head">
              <span>Comprados ({bought.length})</span>
              <button className="m-clear-btn" type="button" onClick={clearBought}>
                Vaciar comprados
              </button>
            </li>
          )}
          {bought.map((it) => (
            <ItemRow
              key={it.id}
              item={it}
              price={itemPrice(it)}
              usdRate={usdRate}
              onToggle={() => toggleBought(it, !it.bought)}
              onSetQty={(n) => setQtyAbs(it, n)}
              onDelete={() => deleteItem.mutate(it.id)}
            />
          ))}
        </ul>
      )}

      <button className="m-fab" type="button" onClick={() => setSheetOpen(true)} aria-label="Agregar">
        +
      </button>

      {sheetOpen && <AddSheet onClose={() => setSheetOpen(false)} />}
    </div>
  );
}

function AddSheet({ onClose }: { onClose: () => void }) {
  const createItem = useCreateShoppingItem();
  const patchItem = usePatchShoppingItem();
  const itemsQ = useShoppingItems();
  const ingredientsQ = useIngredients();
  const presentationsQ = useIngredientPresentations();
  const ingredients = ingredientsQ.data ?? [];
  const [search, setSearch] = useState("");

  const presByIng = useMemo(() => {
    const m = new Map<string, IngredientPresentation[]>();
    for (const p of presentationsQ.data ?? []) {
      const arr = m.get(p.ingredientId) ?? [];
      arr.push(p);
      m.set(p.ingredientId, arr);
    }
    return m;
  }, [presentationsQ.data]);

  const filtered = search.trim()
    ? ingredients.filter((i) => i.name.toLowerCase().includes(search.trim().toLowerCase()))
    : ingredients;

  const addMerged = (add: { name: string; quantity: number; ingredientId?: string | null; presentationId?: string | null }) => {
    const current = itemsQ.data ?? [];
    const target = findMergeTarget(current, add);
    if (target) patchItem.mutate({ id: target.id, patch: { quantity: target.quantity + add.quantity } });
    else createItem.mutate(add);
  };

  return (
    <div className="m-sheet-backdrop" onClick={onClose}>
      <div className="m-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="m-sheet-head">
          <span>Agregar a la lista</span>
          <button className="m-sheet-close" type="button" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        <div className="m-sheet-section">Mis ingredientes</div>
        {ingredients.length === 0 ? (
          <p className="m-empty" style={{ padding: "16px 0" }}>
            No tenés ingredientes guardados. Cargalos desde la versión de escritorio.
          </p>
        ) : (
          <>
            <input
              className="m-add-name"
              type="text"
              placeholder="Buscar ingrediente…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ marginBottom: 8 }}
            />
            <div className="m-quick-list">
              {filtered.map((i) => {
                const pres = presByIng.get(i.id) ?? [];
                return (
                  <div key={i.id} className="m-quick-row">
                    <div className="m-quick-name">{i.name}</div>
                    <div className="m-quick-chips">
                      {pres.length === 0 ? (
                        <button
                          type="button"
                          className="m-quick-chip"
                          onClick={() => addMerged({ name: i.name, quantity: 1, ingredientId: i.id })}
                        >
                          + Agregar
                        </button>
                      ) : (
                        pres.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            className="m-quick-chip"
                            onClick={() =>
                              addMerged({
                                name: `${i.name} (${p.label})`,
                                quantity: 1,
                                ingredientId: i.id,
                                presentationId: p.id,
                              })
                            }
                          >
                            {p.label}
                            {p.price != null && ` · $${p.price.toLocaleString("es-AR")}`}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ItemRow({
  item,
  price,
  usdRate,
  onToggle,
  onSetQty,
  onDelete,
}: {
  item: ShoppingItem;
  price: number | null;
  usdRate: number;
  onToggle: () => void;
  onSetQty: (n: number) => void;
  onDelete: () => void;
}) {
  const [text, setText] = useState(String(item.quantity));
  useEffect(() => setText(String(item.quantity)), [item.quantity]);
  const commit = () => {
    const n = Math.max(1, Math.round(Number(text.replace(",", ".")) || 1));
    onSetQty(n);
    setText(String(n));
  };

  return (
    <li className={`m-item${item.bought ? " is-bought" : ""}`}>
      <button className="m-check" type="button" onClick={onToggle} aria-label="Marcar comprado">
        {item.bought ? "✓" : ""}
      </button>
      <span className="m-item-name" onClick={onToggle}>
        {item.name}
        {price != null && (
          <span className="m-item-price"> {fmtMoney(price)} · ≈{fmtUsdFromDkk(price, usdRate)}</span>
        )}
      </span>
      <div className="m-stepper">
        <button type="button" onClick={() => onSetQty(item.quantity - 1)} aria-label="Menos">−</button>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          inputMode="numeric"
          aria-label="Cantidad"
        />
        <button type="button" onClick={() => onSetQty(item.quantity + 1)} aria-label="Más">+</button>
      </div>
      <button className="m-del" type="button" onClick={onDelete} aria-label="Borrar">
        ✕
      </button>
    </li>
  );
}
