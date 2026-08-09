import { useEffect, useMemo, useState } from "react";
import {
  useCreateShoppingItem,
  useDeleteShoppingItem,
  useExpenseLineItems,
  useExpenses,
  useFinanzasSettings,
  useIngredientPresentations,
  useIngredients,
  usePatchShoppingItem,
  useShoppingItems,
} from "../../lib/queries";
import { findMergeTarget, mergeQuantities } from "../../lib/compras";
import { weekStartOf } from "../../lib/date";
import { DEFAULT_RATES_PER_USD, fmtMoney, fmtUsdFromDkk } from "../../lib/money";
import { buildPriceHistory, estimatedUnitPrice, type PriceEntry } from "../../lib/priceHistory";
import { baseUnit, formatQuantity, parseQuantity } from "../../lib/units";
import { useUsdRate } from "../../lib/useUsdRate";
import { useToggleBought } from "../../lib/useToggleBought";
import type {
  Ingredient,
  IngredientDimension,
  IngredientPresentation,
  ShoppingItem,
} from "../../types";

// Variantes "a granel": `price` es por unidad base (g / ml / u) y la cantidad
// real vive en `baseQuantity`, no en `quantity`. Ver src/types + lib/compras.
const BULK_PRICE_UNIT: Record<IngredientDimension, { label: string; perBase: number }> = {
  weight: { label: "kg", perBase: 1000 },
  volume: { label: "L", perBase: 1000 },
  count: { label: "u", perBase: 1 },
};

/** costo = precio del paquete x paquetes, o precio por unidad base x cantidad.
 *  null cuando no hay precio, o cuando el item a granel no tiene cantidad (asi
 *  queda fuera del total en vez de contar 0).
 *
 *  `perBaseUnit` es el precio por unidad base sacado de las compras reales (ver
 *  lib/priceHistory): cuando lo hay le gana al `price` del catalogo, que es un
 *  numero tipeado a mano. Mismo criterio que ComprasView en escritorio. */
function itemCost(
  it: ShoppingItem,
  p: IngredientPresentation | null | undefined,
  perBaseUnit?: number | null,
): number | null {
  if (!p) return null;
  if (p.kind === "bulk") {
    const price = perBaseUnit ?? p.price;
    if (price == null || it.baseQuantity == null) return null;
    return price * it.baseQuantity;
  }
  // Paquete: el historial da precio por unidad base -> x el tamaño del paquete.
  if (perBaseUnit != null && p.size > 0) return perBaseUnit * p.size * it.quantity;
  if (p.price == null) return null;
  return p.price * it.quantity;
}

/** Precio por unidad base según lo que realmente se pagó (promedio de 3 meses, o
 *  la compra más reciente). `null` = este ingrediente todavía no aparece en
 *  ningún gasto, y ahí manda el precio de catálogo de la variante.
 *
 *  Se pregunta por `history.has()` en vez de dejar que `estimatedUnitPrice` caiga
 *  solo al catálogo: ese fallback toma el mínimo entre TODAS las variantes del
 *  ingrediente, que para un item que ya eligió la suya sería el precio de otra. */
function historyUnitPrice(
  ingredientId: string | null,
  history: Map<string, PriceEntry[]>,
  presentations: IngredientPresentation[],
): number | null {
  if (!ingredientId || !history.has(ingredientId)) return null;
  return estimatedUnitPrice(ingredientId, history, presentations);
}

/** Texto del chip de una variante: precio del paquete, o precio por kg/L/u. */
function presentationChipDetail(p: IngredientPresentation, dim: IngredientDimension): string {
  // La plata de la app es DKK/da-DK: `fmtMoney` (como en el resto del archivo y
  // en ComprasView), no un "$" con agrupación es-AR pegada a mano.
  if (p.kind !== "bulk") return p.price != null ? ` · ${fmtMoney(p.price)}` : "";
  if (p.price == null) return " · a granel";
  const u = BULK_PRICE_UNIT[dim];
  return ` · ${fmtMoney(p.price * u.perBase)}/${u.label}`;
}

export function ShoppingListView() {
  const itemsQ = useShoppingItems();
  const presentationsQ = useIngredientPresentations();
  const ingredientsQ = useIngredients();
  const patchItem = usePatchShoppingItem();
  const deleteItem = useDeleteShoppingItem();
  const toggleBought = useToggleBought();
  const usdRate = useUsdRate();
  const [sheetOpen, setSheetOpen] = useState(false);

  // Historial de precios: mismo cálculo que en escritorio (lib/priceHistory),
  // con las cotizaciones vivas de Finanzas para normalizar gastos en otra moneda.
  const lineItemsQ = useExpenseLineItems();
  const expensesQ = useExpenses();
  const finSettingsQ = useFinanzasSettings();
  const rates = finSettingsQ.data?.ratesPerUsd;
  const ratesPerUsd = useMemo(
    () => ({
      USD: 1,
      DKK: rates?.DKK ?? DEFAULT_RATES_PER_USD.DKK,
      EUR: rates?.EUR ?? DEFAULT_RATES_PER_USD.EUR,
      ARS: rates?.ARS ?? DEFAULT_RATES_PER_USD.ARS,
    }),
    [rates?.DKK, rates?.EUR, rates?.ARS],
  );
  const priceHistory = useMemo(
    () => buildPriceHistory(lineItemsQ.data ?? [], expensesQ.data ?? [], ratesPerUsd),
    [lineItemsQ.data, expensesQ.data, ratesPerUsd],
  );

  const weekStart = weekStartOf();
  const items = useMemo(() => (itemsQ.data ?? []).filter((i) => i.weekStart === weekStart), [itemsQ.data, weekStart]);
  const presentations = useMemo(() => presentationsQ.data ?? [], [presentationsQ.data]);
  const presById = useMemo(() => {
    const m = new Map<string, IngredientPresentation>();
    for (const p of presentationsQ.data ?? []) m.set(p.id, p);
    return m;
  }, [presentationsQ.data]);
  const ingById = useMemo(() => {
    const m = new Map<string, Ingredient>();
    for (const i of ingredientsQ.data ?? []) m.set(i.id, i);
    return m;
  }, [ingredientsQ.data]);
  const presOf = (it: ShoppingItem) => (it.presentationId ? presById.get(it.presentationId) ?? null : null);
  const itemPrice = (it: ShoppingItem): number | null =>
    itemCost(it, presOf(it), historyUnitPrice(it.ingredientId, priceHistory, presentations));
  /** Para items a granel, cuanto se compra ("750 g"); null = item por paquete. */
  const bulkLabel = (it: ShoppingItem): string | null => {
    if (presOf(it)?.kind !== "bulk") return null;
    if (it.baseQuantity == null) return "a granel";
    const dim = it.ingredientId ? ingById.get(it.ingredientId)?.dimension : undefined;
    return dim ? formatQuantity(it.baseQuantity, dim) : String(it.baseQuantity);
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
    if (next !== it.quantity) {
      patchItem.mutateAsync({ id: it.id, patch: { quantity: next } }).catch((err) =>
        window.alert(err instanceof Error ? err.message : "No se pudo guardar la cantidad"),
      );
    }
  };

  const clearBought = () => {
    if (bought.length === 0) return;
    if (!window.confirm(`Vaciar ${bought.length} ítem(s) comprado(s)?`)) return;
    for (const it of bought) {
      deleteItem.mutateAsync(it.id).catch((err) =>
        window.alert(err instanceof Error ? err.message : "No se pudo borrar un ítem"),
      );
    }
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
              bulkLabel={bulkLabel(it)}
              usdRate={usdRate}
              onToggle={() => toggleBought(it, !it.bought)}
              onSetQty={(n) => setQtyAbs(it, n)}
              onDelete={() =>
                deleteItem.mutateAsync(it.id).catch((err) =>
                  window.alert(err instanceof Error ? err.message : "No se pudo borrar"),
                )
              }
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
              bulkLabel={bulkLabel(it)}
              usdRate={usdRate}
              onToggle={() => toggleBought(it, !it.bought)}
              onSetQty={(n) => setQtyAbs(it, n)}
              onDelete={() =>
                deleteItem.mutateAsync(it.id).catch((err) =>
                  window.alert(err instanceof Error ? err.message : "No se pudo borrar"),
                )
              }
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

  const weekStart = weekStartOf();
  const addMerged = (add: {
    name: string;
    quantity: number;
    baseQuantity?: number | null;
    ingredientId?: string | null;
    presentationId?: string | null;
  }) => {
    const item = { ...add, weekStart };
    const current = (itemsQ.data ?? []).filter((i) => i.weekStart === weekStart);
    const target = findMergeTarget(current, item);
    const p = target
      ? patchItem.mutateAsync({ id: target.id, patch: mergeQuantities(target, item) })
      : createItem.mutateAsync(item);
    p.catch((err) => window.alert(err instanceof Error ? err.message : "No se pudo agregar"));
  };

  /** A granel no se agrega "1": hay que preguntar cuanto, en unidad base. */
  const addPresentation = (ing: Ingredient, p: IngredientPresentation) => {
    const base = { name: `${ing.name} (${p.label})`, quantity: 1, ingredientId: ing.id, presentationId: p.id };
    if (p.kind !== "bulk") {
      addMerged(base);
      return;
    }
    const raw = window.prompt(`¿Cuánto de "${ing.name} (${p.label})"? En ${baseUnit(ing.dimension)}.`, "");
    if (raw == null) return;
    const amount = parseQuantity(raw);
    if (amount == null || amount <= 0) {
      window.alert("No entendí esa cantidad.");
      return;
    }
    addMerged({ ...base, baseQuantity: amount });
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
                            onClick={() => addPresentation(i, p)}
                          >
                            {p.label}
                            {presentationChipDetail(p, i.dimension)}
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
  bulkLabel,
  usdRate,
  onToggle,
  onSetQty,
  onDelete,
}: {
  item: ShoppingItem;
  price: number | null;
  /** Item a granel: cuanto se compra ("750 g"). null = item por paquete. */
  bulkLabel: string | null;
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
      {bulkLabel != null ? (
        // A granel se compra un peso/volumen: "quantity ± 1" no significa nada.
        // El monto se edita desde la app de escritorio.
        <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--fg-muted)", whiteSpace: "nowrap" }}>
          {bulkLabel}
        </span>
      ) : (
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
      )}
      <button className="m-del" type="button" onClick={onDelete} aria-label="Borrar">
        ✕
      </button>
    </li>
  );
}
