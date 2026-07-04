import { useEffect, useMemo, useState, type DragEvent, type MouseEvent, type ReactNode } from "react";
import {
  useAccounts,
  useCreateExpense,
  useCreateExpenseLineItem,
  useExpenseCategories,
  useCreateIngredient,
  useCreateIngredientPresentation,
  useCreateRecipe,
  useCreateRecipeIngredient,
  useCreateInventory,
  useCreateMealPlanEntry,
  useCreateShoppingItem,
  useComprasSettings,
  useUpsertComprasSettings,
  useDeleteIngredient,
  useDeleteIngredientPresentation,
  useDeleteMealPlanEntry,
  useDeleteRecipe,
  useDeleteRecipeIngredient,
  useDeleteInventory,
  useDeleteShoppingItem,
  useIngredientPresentations,
  useIngredientCategories,
  useIngredients,
  useInventory,
  useMealLogs,
  useMealPlanEntries,
  usePatchIngredient,
  usePatchIngredientPresentation,
  usePatchInventory,
  usePatchMealPlanEntry,
  usePatchRecipe,
  usePatchShoppingItem,
  useRecipeIngredients,
  useRecipes,
  useShoppingItems,
} from "../lib/queries";
import {
  aggregateNeed,
  aggregateCategoryNeed,
  categoryNeedToShoppingItems,
  findMergeTarget,
  neededToShoppingItems,
  planWeeklyMeals,
} from "../lib/compras";
import type { ShoppingItemCreate } from "../lib/repo";
import { CURRENCY, fmtMoney, fmtUsdFromDkk } from "../lib/money";
import { useUsdRate } from "../lib/useUsdRate";
import { defaultSlot, useLogMeal } from "../lib/useLogMeal";
import { useToggleBought } from "../lib/useToggleBought";
import { fromYmd, mondayOfThisWeek, shiftWeek, todayYmd, weekLabel, ymd } from "../lib/date";
import {
  DIMENSION_LABELS,
  baseUnit,
  formatQuantity,
  parseQuantity,
  toBase,
  unitOptions,
} from "../lib/units";
import type {
  Ingredient,
  IngredientCategory,
  IngredientDimension,
  IngredientPresentation,
  MealPlanEntry,
  MealSlot,
  MealType,
  Recipe,
  RecipeIngredient,
  ShoppingItem,
} from "../types";
import { colorsForHue } from "../lib/categoryColor";
import { useApp, COMPRAS_TABS } from "../lib/store";
import { IngredientCategoryManager } from "./IngredientCategoryManager";
import { ICheck, IChevD, IChevL, IChevR, IEdit, IPlus, ITrash, IX } from "./icons";

const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast_snack: "Desayuno / Merienda",
  lunch_dinner: "Almuerzo / Cena",
};

const DIMENSION_TONE: Record<IngredientDimension, string> = {
  weight: "var(--accent)",
  volume: "var(--ok)",
  count: "var(--warn)",
};
const MEAL_TYPE_TONE: Record<MealType, string> = {
  breakfast_snack: "var(--warn)",
  lunch_dinner: "var(--accent)",
};

function Pill({ tone, children, title }: { tone: string; children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 10.5,
        textTransform: "uppercase",
        letterSpacing: ".04em",
        fontWeight: 700,
        color: tone,
        background: `color-mix(in oklch, ${tone} 22%, var(--bg))`,
        border: `1px solid color-mix(in oklch, ${tone} 55%, transparent)`,
        padding: "2px 8px",
        borderRadius: 999,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: tone, flex: "none" }} />
      {children}
    </span>
  );
}

function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 28 }}>
      <div
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: ".05em",
          fontWeight: 600,
          color: "var(--fg-muted)",
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {children}
      </div>
      {right}
    </div>
  );
}

function IconBtn({ onClick, title, children, danger }: { onClick: () => void; title: string; children: ReactNode; danger?: boolean }) {
  return (
    <button
      className="btn ghost"
      style={{ padding: "3px 7px", fontSize: 11, color: danger ? "var(--danger)" : undefined }}
      onClick={onClick}
      title={title}
      aria-label={title}
    >
      {children}
    </button>
  );
}

export function ComprasView() {
  const { comprasTab: tab } = useApp();

  return (
    <div className="day-view-main" style={{ flex: 1, minHeight: 0 }}>
      {tab !== "listas" && tab !== "plan" && (
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            paddingBottom: 8,
            borderBottom: "1px solid var(--line)",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: ".06em",
                color: "var(--fg-subtle)",
                fontWeight: 600,
              }}
            >
              Compras
            </div>
            <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.1 }}>
              {COMPRAS_TABS.find((t) => t.id === tab)?.label}
            </div>
          </div>
        </header>
      )}

      <div
        style={{
          paddingTop: 14,
          minHeight: 0,
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
        }}
      >
        {tab === "listas" ? (
          <ListasPanel />
        ) : tab === "plan" ? (
          <PlanPanel />
        ) : (
          <AjustesPanel />
        )}
      </div>
    </div>
  );
}

// ---------------- Ajustes ----------------

const MEAL_SLOTS: { id: MealSlot; label: string }[] = [
  { id: "desayuno", label: "Desayuno" },
  { id: "almuerzo", label: "Almuerzo" },
  { id: "merienda", label: "Merienda" },
  { id: "cena", label: "Cena" },
];

const DEFAULT_MEAL_TIMES: Record<MealSlot, string> = {
  desayuno: "08:00", almuerzo: "13:00", merienda: "17:00", cena: "21:00",
};

function AjustesPanel() {
  const settingsQ = useComprasSettings();
  const upsert = useUpsertComprasSettings();

  const derive = (s: typeof settingsQ.data) => ({
    mealTimes: { ...DEFAULT_MEAL_TIMES, ...(s?.mealTimes ?? {}) },
    expiryWarnDays: s?.expiryWarnDays ?? 2,
    notificationsEnabled: s?.notificationsEnabled ?? false,
    dkkPerUsd: s?.dkkPerUsd ?? 6.9,
  });
  const [form, setForm] = useState(() => derive(settingsQ.data));
  useEffect(() => { setForm(derive(settingsQ.data)); }, [settingsQ.data]);

  const [mealTargets, setMealTargetsState] = useState<Record<MealType, number>>({
    breakfast_snack: getMealTarget("breakfast_snack"),
    lunch_dinner: getMealTarget("lunch_dinner"),
  });
  const updateMealTarget = (bucket: MealType, n: number) => {
    const v = Math.max(0, n);
    setMealTargetLS(bucket, v);
    setMealTargetsState((t) => ({ ...t, [bucket]: v }));
  };

  const save = () => {
    upsert.mutate(form);
    window.alert("Ajustes guardados.");
  };

  const labelStyle = { fontSize: 13, color: "var(--fg-muted)", display: "flex", alignItems: "center", gap: 8 } as const;
  const sectionStyle = { background: "var(--bg-elev)", border: "1px solid var(--line)", borderRadius: 10, padding: 16, display: "flex", flexDirection: "column", gap: 12 } as const;

  const SLOT_TONE: Record<MealSlot, string> = {
    desayuno: "var(--warn)",
    almuerzo: "var(--accent)",
    merienda: "var(--warn)",
    cena: "var(--accent)",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 560 }}>
      <section style={sectionStyle}>
        <SectionTitle>Moneda</SectionTitle>
        <label style={labelStyle}>
          US$1 =
          <input
            className="input"
            type="number"
            min={0}
            step="0.01"
            value={form.dkkPerUsd}
            onChange={(e) => setForm((f) => ({ ...f, dkkPerUsd: Number(e.target.value) || 0 }))}
            style={{ width: 90 }}
          />
          coronas (kr)
        </label>
        <div style={{ fontSize: 11, color: "var(--fg-subtle)" }}>Los precios se cargan en kr; se muestra la conversión a US$ con esta cotización.</div>
      </section>

      <section style={sectionStyle}>
        <SectionTitle>Notificaciones (en el celular)</SectionTitle>
        <label style={labelStyle}>
          <input
            type="checkbox"
            checked={form.notificationsEnabled}
            onChange={(e) => setForm((f) => ({ ...f, notificationsEnabled: e.target.checked }))}
            style={{ width: 16, height: 16 }}
          />
          Activar avisos en el celular
        </label>
        <label style={labelStyle}>
          Avisar vencimientos
          <input
            className="input"
            type="number"
            min={0}
            value={form.expiryWarnDays}
            onChange={(e) => setForm((f) => ({ ...f, expiryWarnDays: Math.max(0, Number(e.target.value) || 0) }))}
            style={{ width: 60 }}
          />
          días antes
        </label>
        <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 4 }}>Horarios para preguntar "¿qué vas a comer?"</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {MEAL_SLOTS.map((slot) => (
            <label key={slot.id} style={{ ...labelStyle, padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--bg)" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: SLOT_TONE[slot.id] }} />
              <span style={{ flex: 1 }}>{slot.label}</span>
              <input
                className="input"
                type="time"
                value={form.mealTimes[slot.id]}
                onChange={(e) => setForm((f) => ({ ...f, mealTimes: { ...f.mealTimes, [slot.id]: e.target.value } }))}
              />
            </label>
          ))}
        </div>
      </section>

      <section style={sectionStyle}>
        <SectionTitle>Plan semanal</SectionTitle>
        <div style={{ fontSize: 12, color: "var(--fg-muted)" }}>Cuántas comidas de cada tipo necesitás por semana.</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {MEAL_BUCKETS.map((bucket) => (
            <label key={bucket} style={{ ...labelStyle, padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--bg)" }}>
              <span style={{ flex: 1 }}>{MEAL_TYPE_LABELS[bucket]}</span>
              <input
                className="input"
                type="number"
                min={0}
                value={mealTargets[bucket]}
                onChange={(e) => updateMealTarget(bucket, Number(e.target.value) || 0)}
                style={{ width: 60 }}
              />
            </label>
          ))}
        </div>
      </section>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button className="btn" style={{ background: "var(--accent)", color: "#fff", borderColor: "var(--accent)" }} onClick={save}>
          Guardar ajustes
        </button>
        <span style={{ fontSize: 11, color: "var(--fg-subtle)" }}>Se sincronizan al celular, que es donde suenan las notificaciones.</span>
      </div>
    </div>
  );
}

function RecipeIngredientAdder({
  ingredients,
  categories,
  onAdd,
}: {
  ingredients: Ingredient[];
  categories: IngredientCategory[];
  onAdd: (sel: { ingredientId?: string | null; categoryId?: string | null; quantity: number }) => void;
}) {
  const [mode, setMode] = useState<"ingrediente" | "categoria">("ingrediente");
  const [ingredientId, setIngredientId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const selected = ingredients.find((i) => i.id === ingredientId) ?? null;
  const units = selected ? unitOptions(selected.dimension) : [];
  const [unit, setUnit] = useState("");

  const effectiveUnit = unit || units[0]?.unit || "u";

  const add = () => {
    const amt = parseQuantity(amount);
    if (amt == null || amt <= 0) return;
    if (mode === "categoria") {
      if (!categoryId) return;
      onAdd({ categoryId, ingredientId: null, quantity: amt });
      setAmount(""); setCategoryId("");
      return;
    }
    if (!selected) return;
    onAdd({ ingredientId: selected.id, categoryId: null, quantity: toBase(amt, effectiveUnit) });
    setAmount("");
  };

  if (ingredients.length === 0 && categories.length === 0) {
    return (
      <div style={{ fontSize: 12, color: "var(--fg-subtle)" }}>
        Cargá ingredientes en la pestaña Ingredientes para poder agregarlos.
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        add();
      }}
      style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 2 }}
    >
      <select
        className="input"
        value={mode}
        onChange={(e) => setMode(e.target.value as "ingrediente" | "categoria")}
        style={{ width: 110 }}
        title="Ingrediente concreto o categoria generica"
      >
        <option value="ingrediente">Ingrediente</option>
        <option value="categoria">Categoria</option>
      </select>
      {mode === "ingrediente" ? (
        <select
          className="input"
          value={ingredientId}
          onChange={(e) => {
            setIngredientId(e.target.value);
            setUnit("");
          }}
          style={{ flex: 1, minWidth: 160 }}
        >
          <option value="">Elegí ingrediente…</option>
          {ingredients.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
      ) : (
        <select
          className="input"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          style={{ flex: 1, minWidth: 160 }}
        >
          <option value="">Elegí categoría…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}
      <input
        className="input"
        placeholder={mode === "categoria" ? "Cantidad" : "Cant. (admite 1/2)"}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        style={{ width: 120 }}
      />
      {mode === "ingrediente" && selected && units.length > 1 ? (
        <select className="input" value={effectiveUnit} onChange={(e) => setUnit(e.target.value)}>
          {units.map((u) => (
            <option key={u.unit} value={u.unit}>
              {u.label}
            </option>
          ))}
        </select>
      ) : mode === "ingrediente" && selected ? (
        <span style={{ fontSize: 12, color: "var(--fg-muted)", width: 24 }}>{units[0]?.label}</span>
      ) : null}
      <button
        className="btn"
        type="submit"
        disabled={mode === "categoria" ? !categoryId || !amount.trim() : !selected || !amount.trim()}
      >
        <IPlus size={11} /> Agregar
      </button>
    </form>
  );
}

// ---------------- Listas ----------------

function ListasPanel() {
  const { comprasWeek: weekStart, setComprasWeek: setWeekStart } = useApp();

  const itemsQ = useShoppingItems();
  const ingredientsQ = useIngredients();
  const presentationsQ = useIngredientPresentations();
  const categoriesQ = useIngredientCategories();
  const createItem = useCreateShoppingItem();
  const patchItem = usePatchShoppingItem();
  const deleteItem = useDeleteShoppingItem();
  const deleteIngredient = useDeleteIngredient();
  const toggleBought = useToggleBought();
  const usdRate = useUsdRate();

  const [showClose, setShowClose] = useState(false);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [showAddIngredient, setShowAddIngredient] = useState(false);
  const [editingIngredientId, setEditingIngredientId] = useState<string | null>(null);

  const allItems = useMemo(() => itemsQ.data ?? [], [itemsQ.data]);
  const items = useMemo(() => allItems.filter((i) => i.weekStart === weekStart), [allItems, weekStart]);
  const ingredients = useMemo(() => ingredientsQ.data ?? [], [ingredientsQ.data]);
  const presentations = useMemo(() => presentationsQ.data ?? [], [presentationsQ.data]);
  const categories = useMemo(() => (categoriesQ.data ?? []).filter((c) => !c.archived), [categoriesQ.data]);

  const ingredientById = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients]);
  const presentationById = useMemo(() => new Map(presentations.map((p) => [p.id, p])), [presentations]);
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const presByIngredient = useMemo(() => {
    const m = new Map<string, IngredientPresentation[]>();
    for (const p of presentations) {
      const arr = m.get(p.ingredientId) ?? [];
      arr.push(p);
      m.set(p.ingredientId, arr);
    }
    return m;
  }, [presentations]);

  const priceById = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const p of presentations) m.set(p.id, p.price);
    return m;
  }, [presentations]);

  const editingIngredient = editingIngredientId ? ingredientById.get(editingIngredientId) ?? null : null;

  const pending = items.filter((i) => !i.bought);
  const bought = items.filter((i) => i.bought);

  const itemPrice = (it: ShoppingItem): number | null => {
    if (!it.presentationId) return null;
    const unit = priceById.get(it.presentationId);
    return unit == null ? null : unit * it.quantity;
  };
  const total = items.reduce((s, it) => s + (itemPrice(it) ?? 0), 0);

  const addToList = (it: ShoppingItemCreate) => {
    const target = findMergeTarget(items, it);
    if (target) patchItem.mutate({ id: target.id, patch: { quantity: target.quantity + it.quantity } });
    else createItem.mutate(it);
  };

  const addPresentationToList = (ingredientId: string, presentationId: string) => {
    const ing = ingredientById.get(ingredientId);
    const p = presentationById.get(presentationId);
    if (!ing || !p) return;
    addToList({
      name: `${ing.name} (${p.label})`,
      quantity: 1,
      ingredientId: ing.id,
      presentationId: p.id,
      unit: null,
      weekStart,
    });
  };

  const setQtyAbs = (it: ShoppingItem, n: number) => {
    const next = Math.max(1, n);
    if (next !== it.quantity) patchItem.mutate({ id: it.id, patch: { quantity: next } });
  };

  const deleteBought = () => {
    for (const it of bought) deleteItem.mutate(it.id);
  };

  const [dragOver, setDragOver] = useState(false);
  const onListDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const raw = e.dataTransfer.getData("text/plain");
    if (!raw) return;
    try {
      const { ingredientId, presentationId } = JSON.parse(raw);
      if (ingredientId && presentationId) addPresentationToList(ingredientId, presentationId);
    } catch {
      // ignora payloads que no vengan de un chip de presentacion
    }
  };

  // Inventario compacto debajo de la lista: arrastrar una variante acá suma
  // stock directamente (en vez de agregarla a la lista de compra).
  const inventoryQ = useInventory();
  const createInventory = useCreateInventory();
  const deleteInventory = useDeleteInventory();
  const inventory = useMemo(() => inventoryQ.data ?? [], [inventoryQ.data]);
  const inventoryGroups = useMemo(() => {
    const m = new Map<string, typeof inventory>();
    for (const lot of inventory) {
      const arr = m.get(lot.ingredientId) ?? [];
      arr.push(lot);
      m.set(lot.ingredientId, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => (a.expiresOn ?? "9999").localeCompare(b.expiresOn ?? "9999"));
    return m;
  }, [inventory]);
  const today = todayYmd();
  const warnLimit = ymd((() => { const d = fromYmd(today); d.setDate(d.getDate() + 3); return d; })());

  const [dragOverInv, setDragOverInv] = useState(false);
  const onInventoryDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOverInv(false);
    const raw = e.dataTransfer.getData("text/plain");
    if (!raw) return;
    try {
      const { ingredientId, presentationId } = JSON.parse(raw);
      const p = presentationById.get(presentationId);
      if (ingredientId && p) {
        createInventory.mutate({ ingredientId, presentationId: p.id, quantity: p.size, expiresOn: null });
      }
    } catch {
      // ignora payloads que no vengan de un chip de presentacion
    }
  };

  return (
    <>
      {showClose && (
        <CloseListModal
          bought={bought}
          priceById={priceById}
          onClose={() => setShowClose(false)}
          onClearBought={deleteBought}
        />
      )}
      {showCategoryManager && <IngredientCategoryManager onClose={() => setShowCategoryManager(false)} />}
      {showAddIngredient && <AddIngredientModal categories={categories} onClose={() => setShowAddIngredient(false)} />}
      {editingIngredient && (
        <EditIngredientModal
          ingredient={editingIngredient}
          presentations={presByIngredient.get(editingIngredient.id) ?? []}
          categories={categories}
          onClose={() => setEditingIngredientId(null)}
          onDelete={() => { deleteIngredient.mutate(editingIngredient.id); setEditingIngredientId(null); }}
        />
      )}

      {/* Header estilo Finanzas: titulo grande a la izquierda, semana + acciones a la derecha */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          paddingBottom: 8,
          marginBottom: 12,
          borderBottom: "1px solid var(--line)",
        }}
      >
        <div>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--fg-subtle)", fontWeight: 600 }}>
            Listas
          </div>
          <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>
            {weekLabel(weekStart)}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <button className="icon-btn" title="Semana anterior" onClick={() => setWeekStart(shiftWeek(weekStart, -1))}>
          <IChevL size={15} />
        </button>
        <button className="icon-btn" title="Semana siguiente" onClick={() => setWeekStart(shiftWeek(weekStart, 1))}>
          <IChevR size={15} />
        </button>
        {weekStart !== mondayOfThisWeek() && (
          <button className="btn ghost" style={{ fontSize: 11, padding: "3px 8px" }} onClick={() => setWeekStart(mondayOfThisWeek())}>
            Hoy
          </button>
        )}
        <button className="btn ghost" onClick={() => setShowAddIngredient(true)}>
          <IPlus size={12} /> Agregar ingrediente
        </button>
        <button className="btn ghost" onClick={() => setShowCategoryManager(true)}>
          Categorías
        </button>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, flex: 1, minHeight: 0, overflowY: "auto" }}>
        {/* IZQUIERDA — arriba la lista de esta semana, abajo el inventario (50/50) */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0, minHeight: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, minHeight: 0 }}>
            <SectionTitle
              right={
                <button className="btn ghost" style={{ fontSize: 11, padding: "3px 8px" }} onClick={() => setShowClose(true)} disabled={bought.length === 0} title="Registrar lo comprado como gasto en Finanzas">
                  Cerrar lista / registrar gasto
                </button>
              }
            >
              Lista · {items.length}
              {total > 0 && (
                <span style={{ marginLeft: 8, color: "var(--fg)", fontWeight: 700, textTransform: "none" }}>
                  {fmtMoney(total)} <span style={{ color: "var(--fg-muted)", fontWeight: 500 }}>≈ {fmtUsdFromDkk(total, usdRate)}</span>
                </span>
              )}
            </SectionTitle>

            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onListDrop}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                flex: 1,
                minHeight: 0,
                padding: 6,
                boxSizing: "border-box",
                borderRadius: 10,
                overflowY: "auto",
                border: dragOver ? "2px dashed var(--accent)" : "2px dashed transparent",
                transition: "border-color .1s",
              }}
            >
              {items.length === 0 && (
                <div style={{ fontSize: 12.5, color: "var(--fg-subtle)", padding: "8px 2px" }}>
                  La lista de esta semana esta vacia. Arrastra una variante desde Ingredientes.
                </div>
              )}
              {pending.map((it) => (
                <ListCard
                  key={it.id}
                  item={it}
                  ingredient={it.ingredientId ? ingredientById.get(it.ingredientId) ?? null : null}
                  presentation={it.presentationId ? presentationById.get(it.presentationId) ?? null : null}
                  price={itemPrice(it)}
                  onToggle={() => toggleBought(it, true)}
                  onSetQty={(n) => setQtyAbs(it, n)}
                  onDelete={() => deleteItem.mutate(it.id)}
                />
              ))}
              {bought.length > 0 && (
                <div style={{ fontSize: 11, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: ".04em", marginTop: 6 }}>
                  Comprados · {bought.length}
                </div>
              )}
              {bought.map((it) => (
                <ListCard
                  key={it.id}
                  item={it}
                  ingredient={it.ingredientId ? ingredientById.get(it.ingredientId) ?? null : null}
                  presentation={it.presentationId ? presentationById.get(it.presentationId) ?? null : null}
                  price={itemPrice(it)}
                  onToggle={() => toggleBought(it, false)}
                  onSetQty={(n) => setQtyAbs(it, n)}
                  onDelete={() => deleteItem.mutate(it.id)}
                />
              ))}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, minHeight: 0 }}>
            <SectionTitle>Inventario · {inventory.length}</SectionTitle>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOverInv(true); }}
              onDragLeave={() => setDragOverInv(false)}
              onDrop={onInventoryDrop}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                flex: 1,
                minHeight: 0,
                padding: 6,
                boxSizing: "border-box",
                borderRadius: 10,
                overflowY: "auto",
                border: dragOverInv ? "2px dashed var(--accent)" : "2px dashed transparent",
                transition: "border-color .1s",
              }}
            >
              {inventory.length === 0 && (
                <div style={{ fontSize: 12.5, color: "var(--fg-subtle)", padding: "8px 2px" }}>
                  Sin stock cargado. Arrastra una variante desde Ingredientes para sumarla.
                </div>
              )}
              {[...inventoryGroups.entries()].map(([ingId, lots]) => {
                const ing = ingredientById.get(ingId);
                const totalQty = lots.reduce((s, l) => s + l.quantity, 0);
                return (
                  <InventoryGroup
                    key={ingId}
                    name={ing?.name ?? "—"}
                    totalLabel={ing ? formatQuantity(totalQty, ing.dimension) : String(totalQty)}
                    count={lots.length}
                    lots={lots}
                    presentationById={presentationById}
                    ingredient={ing}
                    today={today}
                    warnLimit={warnLimit}
                    onDelete={(id) => deleteInventory.mutate(id)}
                  />
                );
              })}
            </div>
          </div>
        </div>

        {/* DERECHA — catalogo de ingredientes (arrastrar una variante a la izquierda para agregarla) */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0, minHeight: 0 }}>
          <SectionTitle>Ingredientes</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, minHeight: 0, padding: 6, boxSizing: "border-box", overflowY: "auto" }}>
            {ingredients.length === 0 && (
              <div style={{ fontSize: 12.5, color: "var(--fg-subtle)", padding: "8px 2px" }}>
                Todavia no cargaste ingredientes. Usa "Agregar ingrediente" arriba.
              </div>
            )}
            {ingredients.map((ing) => (
              <IngredientCard
                key={ing.id}
                ingredient={ing}
                presentations={presByIngredient.get(ing.id) ?? []}
                category={ing.categoryId ? categoryById.get(ing.categoryId) : undefined}
                onEdit={() => setEditingIngredientId(ing.id)}
                onDelete={() => { if (window.confirm(`Borrar "${ing.name}"?`)) deleteIngredient.mutate(ing.id); }}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

// ---------------- Cerrar lista / registrar gasto ----------------

function CloseListModal({
  bought,
  priceById,
  onClose,
  onClearBought,
}: {
  bought: ShoppingItem[];
  priceById: Map<string, number | null>;
  onClose: () => void;
  onClearBought: () => void;
}) {
  const categoriesQ = useExpenseCategories();
  const accountsQ = useAccounts();
  const createExpense = useCreateExpense();
  const createLineItem = useCreateExpenseLineItem();

  const categories = useMemo(
    () => (categoriesQ.data ?? []).filter((c) => !c.archived),
    [categoriesQ.data],
  );
  // Cuentas que pagan gastos; si ninguna tiene la capacidad, mostrar todas.
  const accounts = useMemo(() => {
    const active = (accountsQ.data ?? []).filter((a) => !a.archived);
    const paying = active.filter((a) => a.paysExpenses);
    return paying.length > 0 ? paying : active;
  }, [accountsQ.data]);

  const unitPriceOf = (it: ShoppingItem): number | null =>
    it.presentationId ? priceById.get(it.presentationId) ?? null : null;

  const priced = bought.filter((it) => unitPriceOf(it) != null);
  const missingPrice = bought.length - priced.length;
  const total = priced.reduce((s, it) => s + (unitPriceOf(it) ?? 0) * it.quantity, 0);

  const today = todayYmd();
  const defaultNote = useMemo(() => {
    const d = fromYmd(today);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `Compras ${dd}/${mm}/${d.getFullYear()}`;
  }, [today]);

  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [spentOn, setSpentOn] = useState(today);
  const [note, setNote] = useState(defaultNote);
  const [clearAfter, setClearAfter] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const account = accountId ? accounts.find((a) => a.id === accountId) ?? null : null;
      const currency = account ? account.currency : CURRENCY;
      const expense = await createExpense.mutateAsync({
        name: note.trim() || defaultNote,
        amount: total,
        currency,
        categoryId: categoryId || null,
        accountId: accountId || null,
        spentOn,
        note: note.trim() || defaultNote,
        recurrence: null,
        recurrenceParentId: null,
      });
      for (const it of priced) {
        await createLineItem.mutateAsync({
          expenseId: expense.id,
          name: it.name,
          quantity: it.quantity,
          unitPrice: unitPriceOf(it) ?? 0,
        });
      }
      if (clearAfter) onClearBought();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const onBackdropMouseDown = (e: MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className="modal-backdrop" onMouseDown={onBackdropMouseDown}>
      <div className="modal" style={{ width: 460 }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span style={{ flex: 1, fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" }}>
            Cerrar lista / registrar gasto
          </span>
          <button className="icon-btn" onClick={onClose} title="Cerrar">
            <IX size={14} />
          </button>
        </div>

        <div className="modal-body">
          <div className="field">
            <label>Comprados · {bought.length}</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 180, overflowY: "auto" }}>
              {bought.map((it) => {
                const unit = unitPriceOf(it);
                return (
                  <div
                    key={it.id}
                    style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, alignItems: "center", fontSize: 12.5, color: "var(--fg-muted)" }}
                  >
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.name}</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{it.quantity}×</span>
                    <span style={{ color: unit == null ? "var(--fg-subtle)" : "var(--fg)", fontVariantNumeric: "tabular-nums" }}>
                      {unit == null ? "sin precio" : fmtMoney(unit * it.quantity)}
                    </span>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
              <span style={{ fontSize: 12, color: "var(--fg-muted)" }}>Total</span>
              <span style={{ fontSize: 16, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(total)}</span>
            </div>
            {missingPrice > 0 && (
              <div style={{ fontSize: 11, color: "var(--warn)", marginTop: 2 }}>
                {missingPrice} ítem(s) sin precio no suman al total ni se registran como detalle.
              </div>
            )}
          </div>

          <div className="field">
            <label>Categoría</label>
            <div className="control">
              <select className="input" style={{ width: "auto" }} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">(ninguna)</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          {accounts.length > 0 && (
            <div className="field">
              <label>Cuenta</label>
              <div className="control">
                <select className="input" style={{ width: "auto" }} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  <option value="">(ninguna)</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name} · {a.currency}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="field">
            <label>Fecha</label>
            <div className="control">
              <input type="date" className="input" style={{ width: "auto" }} value={spentOn} onChange={(e) => setSpentOn(e.target.value)} />
            </div>
          </div>

          <div className="field">
            <label>Nota</label>
            <input type="text" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={defaultNote} />
          </div>

          <div className="field">
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={clearAfter} onChange={(e) => setClearAfter(e.target.checked)} style={{ width: 16, height: 16 }} />
              Vaciar los comprados de la lista
            </label>
          </div>
        </div>

        <div className="modal-foot">
          <span />
          <div className="actions">
            <button className="btn ghost" onClick={onClose}>Cancelar</button>
            <button className="btn primary" onClick={() => void confirm()} disabled={busy}>
              <ICheck size={12} stroke={2.4} /> Registrar gasto
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function InventoryGroup({
  name,
  totalLabel,
  count,
  lots,
  presentationById,
  ingredient,
  today,
  warnLimit,
  onDelete,
}: {
  name: string;
  totalLabel: string;
  count: number;
  lots: { id: string; presentationId: string | null; quantity: number; expiresOn: string | null }[];
  presentationById: Map<string, IngredientPresentation>;
  ingredient: Ingredient | undefined;
  today: string;
  warnLimit: string;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const [amount, setAmount] = useState("");
  const patchInventory = usePatchInventory();
  const soonest = lots.find((l) => l.expiresOn)?.expiresOn ?? null;
  const groupWarn = soonest != null && soonest <= warnLimit;

  // Resta del total del ingrediente, no de un lote puntual: consume el lote que
  // vence antes primero y si no alcanza sigue con el siguiente (asumimos que si
  // usaste mas de lo que quedaba en uno, abriste otro). `lots` ya viene ordenado
  // por vencimiento mas proximo primero.
  const subtract = () => {
    let need = parseQuantity(amount);
    if (need == null || need <= 0) return;
    for (const lot of lots) {
      if (need <= 0) break;
      const take = Math.min(lot.quantity, need);
      need -= take;
      const remaining = lot.quantity - take;
      if (remaining <= 0.0001) onDelete(lot.id);
      else patchInventory.mutate({ id: lot.id, patch: { quantity: remaining } });
    }
    setAmount("");
  };

  return (
    <div style={{ background: "var(--bg-elev)", border: `1px solid ${groupWarn ? "var(--warn)" : "var(--line)"}`, borderRadius: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px" }}>
        <span style={{ display: "inline-flex", cursor: "pointer", transform: open ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform .15s" }} onClick={() => setOpen((o) => !o)}>
          <IChevD size={14} />
        </span>
        <span style={{ fontSize: 14, fontWeight: 600, flex: 1, cursor: "pointer" }} onClick={() => setOpen((o) => !o)}>{name}</span>
        <span style={{ fontSize: 11.5, color: "var(--fg-muted)" }}>{count} {count === 1 ? "lote" : "lotes"}</span>
        <span style={{ fontSize: 13, color: "var(--fg-muted)", fontVariantNumeric: "tabular-nums" }}>{totalLabel}</span>
        <form onSubmit={(e) => { e.preventDefault(); subtract(); }} style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <input
            className="input"
            placeholder={ingredient ? `cant. (${baseUnit(ingredient.dimension)})` : "cant."}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={{ width: 88, fontSize: 12, padding: "3px 6px" }}
          />
          <button className="btn ghost" type="submit" style={{ padding: "3px 8px", fontSize: 12 }} disabled={!amount.trim()} title="Restar del stock total (consume primero el lote que vence antes)">
            − restar
          </button>
        </form>
      </div>
      {open && (
        <div style={{ borderTop: "1px solid var(--line)", padding: "6px 12px 10px" }}>
          {lots.map((lot) => (
            <LotRow
              key={lot.id}
              lot={lot}
              pres={lot.presentationId ? presentationById.get(lot.presentationId) : null}
              ingredient={ingredient}
              today={today}
              warnLimit={warnLimit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LotRow({
  lot,
  pres,
  ingredient,
  today,
  warnLimit,
  onDelete,
}: {
  lot: { id: string; presentationId: string | null; quantity: number; expiresOn: string | null };
  pres: IngredientPresentation | null | undefined;
  ingredient: Ingredient | undefined;
  today: string;
  warnLimit: string;
  onDelete: (id: string) => void;
}) {
  const expSoon = lot.expiresOn != null && lot.expiresOn <= today;
  const expWarn = lot.expiresOn != null && !expSoon && lot.expiresOn <= warnLimit;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
      <span style={{ flex: 1, fontSize: 13 }}>{pres?.label ?? "Suelto"}</span>
      <span style={{ fontSize: 12.5, color: "var(--fg-muted)", fontVariantNumeric: "tabular-nums" }}>
        {ingredient ? formatQuantity(lot.quantity, ingredient.dimension) : lot.quantity}
      </span>
      {lot.expiresOn && (
        <span style={{ fontSize: 11, color: expSoon ? "var(--danger)" : expWarn ? "var(--warn)" : "var(--fg-subtle)" }}>
          {expSoon ? "vencido" : `vence ${lot.expiresOn}`}
        </span>
      )}
      <IconBtn title="Quitar lote" onClick={() => onDelete(lot.id)}>
        <IX size={11} />
      </IconBtn>
    </div>
  );
}

// ---------------- Plan semanal ----------------

const MEAL_BUCKETS: MealType[] = ["breakfast_snack", "lunch_dinner"];

// Cuantas comidas de cada tipo se necesitan por semana — configuracion global
// (vive en Ajustes), no por semana especifica.
function mealTargetKey(bucket: MealType): string {
  return `compras:mealTarget:${bucket}`;
}
function getMealTarget(bucket: MealType): number {
  const v = Number(localStorage.getItem(mealTargetKey(bucket)));
  return Number.isFinite(v) && v >= 0 ? v : 0;
}
function setMealTargetLS(bucket: MealType, n: number): void {
  localStorage.setItem(mealTargetKey(bucket), String(Math.max(0, n)));
}

function PlanPanel() {
  const [weekStart, setWeekStart] = useState(mondayOfThisWeek());
  const entriesQ = useMealPlanEntries();
  const recipesQ = useRecipes();
  const riQ = useRecipeIngredients();
  const ingredientsQ = useIngredients();
  const categoriesQ = useIngredientCategories();
  const presentationsQ = useIngredientPresentations();
  const shoppingItemsQ = useShoppingItems();
  const inventoryQ = useInventory();
  const mealLogsQ = useMealLogs();
  const createEntry = useCreateMealPlanEntry();
  const patchEntry = usePatchMealPlanEntry();
  const deleteEntry = useDeleteMealPlanEntry();
  const createRecipe = useCreateRecipe();
  const deleteRecipe = useDeleteRecipe();
  const createShoppingItem = useCreateShoppingItem();
  const patchShoppingItem = usePatchShoppingItem();
  const logMeal = useLogMeal();

  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const recipes = useMemo(() => recipesQ.data ?? [], [recipesQ.data]);
  const recipeById = useMemo(() => {
    const m = new Map<string, Recipe>();
    for (const r of recipes) m.set(r.id, r);
    return m;
  }, [recipes]);
  const editingRecipe = recipes.find((r) => r.id === editingRecipeId) ?? null;

  const riByRecipe = useMemo(() => {
    const m = new Map<string, RecipeIngredient[]>();
    for (const ri of riQ.data ?? []) {
      const arr = m.get(ri.recipeId) ?? [];
      arr.push(ri);
      m.set(ri.recipeId, arr);
    }
    return m;
  }, [riQ.data]);

  const entries = useMemo(
    () => (entriesQ.data ?? []).filter((e) => e.weekStart === weekStart),
    [entriesQ.data, weekStart],
  );

  const plannedByBucket = useMemo(() => {
    const m: Record<MealType, number> = { breakfast_snack: 0, lunch_dinner: 0 };
    for (const e of entries) {
      const r = recipeById.get(e.recipeId);
      if (r) m[r.mealType] += e.targetServings * r.servings;
    }
    return m;
  }, [entries, recipeById]);

  const targets: Record<MealType, number> = {
    breakfast_snack: getMealTarget("breakfast_snack"),
    lunch_dinner: getMealTarget("lunch_dinner"),
  };

  const eatenByRecipe = useMemo(() => {
    const weekEnd = shiftWeek(weekStart, 1);
    const m = new Map<string, number>();
    for (const log of mealLogsQ.data ?? []) {
      if (log.eatenOn >= weekStart && log.eatenOn < weekEnd) {
        m.set(log.recipeId, (m.get(log.recipeId) ?? 0) + log.servings);
      }
    }
    return m;
  }, [mealLogsQ.data, weekStart]);

  const addRecipe = async () => {
    const r = await createRecipe.mutateAsync({ name: "Nueva receta", servings: 2, mealType: "lunch_dinner", steps: [] });
    setEditingRecipeId(r.id);
  };

  const addToPlan = (recipeId: string) => {
    const existing = entries.find((e) => e.recipeId === recipeId);
    if (existing) patchEntry.mutate({ id: existing.id, patch: { targetServings: existing.targetServings + 1 } });
    else createEntry.mutate({ weekStart, recipeId, targetServings: 1 });
  };

  const setTimesAbs = (entry: MealPlanEntry, n: number) => {
    const next = Math.max(1, n);
    if (next !== entry.targetServings) patchEntry.mutate({ id: entry.id, patch: { targetServings: next } });
  };

  const generatePlan = () => {
    if (recipes.length === 0) {
      window.alert("Todavia no cargaste recetas.");
      return;
    }
    if (targets.breakfast_snack <= 0 && targets.lunch_dinner <= 0) {
      window.alert('Configura cuantas comidas necesitas por semana en Ajustes > "Plan semanal" primero.');
      return;
    }
    if (!window.confirm(`Esto reemplaza el plan de "${weekLabel(weekStart)}" por uno generado automaticamente. ¿Continuar?`)) return;
    for (const e of entries) deleteEntry.mutate(e.id);
    const times = planWeeklyMeals(recipes, targets);
    for (const [recipeId, n] of times) {
      createEntry.mutate({ weekStart, recipeId, targetServings: n });
    }
  };

  const comi = (r: Recipe) => {
    const cookedTxt = window.prompt(`¿Cuántas porciones hiciste de "${r.name}"? (descuenta ingredientes del inventario)`, String(r.servings));
    if (cookedTxt == null) return;
    const cooked = Math.max(0, Number(cookedTxt.replace(",", ".")) || 0);
    const eatenTxt = window.prompt("¿Cuántas comiste?", String(cooked));
    if (eatenTxt == null) return;
    const eaten = Math.max(0, Number(eatenTxt.replace(",", ".")) || 0);
    if (cooked <= 0 && eaten <= 0) return;
    void logMeal(r, cooked, eaten, defaultSlot(r.mealType), todayYmd());
    window.alert("Registrado.");
  };

  const generateList = () => {
    const planEntries = entries.map((e) => {
      const r = recipeById.get(e.recipeId);
      return {
        recipeIngredients: riByRecipe.get(e.recipeId) ?? [],
        servings: r?.servings ?? 1,
        portions: e.targetServings * (r?.servings ?? 1),
      };
    });
    const need = aggregateNeed(planEntries);
    const needByCategory = aggregateCategoryNeed(planEntries);
    // subtract what's already at home (inventory)
    for (const row of inventoryQ.data ?? []) {
      if (need.has(row.ingredientId)) {
        need.set(row.ingredientId, Math.max(0, (need.get(row.ingredientId) ?? 0) - row.quantity));
      }
    }
    const ingredientById = new Map<string, Ingredient>();
    for (const i of ingredientsQ.data ?? []) ingredientById.set(i.id, i);
    const categoryById = new Map<string, IngredientCategory>();
    for (const c of categoriesQ.data ?? []) categoryById.set(c.id, c);
    const presentationsByIngredient = new Map<string, IngredientPresentation[]>();
    for (const p of presentationsQ.data ?? []) {
      const arr = presentationsByIngredient.get(p.ingredientId) ?? [];
      arr.push(p);
      presentationsByIngredient.set(p.ingredientId, arr);
    }
    const items = [
      ...neededToShoppingItems(need, ingredientById, presentationsByIngredient, weekStart),
      ...categoryNeedToShoppingItems(needByCategory, categoryById, weekStart),
    ];
    const current = shoppingItemsQ.data ?? [];
    for (const it of items) {
      const target = findMergeTarget(current, it);
      if (target) patchShoppingItem.mutate({ id: target.id, patch: { quantity: target.quantity + it.quantity } });
      else createShoppingItem.mutate(it);
    }
    window.alert(items.length > 0 ? `Generé ${items.length} ítem(s) en la lista (pestaña Listas).` : "El plan no tiene ingredientes para comprar.");
  };

  const onPlanDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const raw = e.dataTransfer.getData("text/plain");
    if (!raw) return;
    try {
      const { recipeId } = JSON.parse(raw);
      if (recipeId) addToPlan(recipeId);
    } catch {
      // ignora payloads que no vengan de una card de receta
    }
  };

  return (
    <>
      {editingRecipe && (
        <RecipeModal
          recipe={editingRecipe}
          onClose={() => setEditingRecipeId(null)}
          onDelete={() => { deleteRecipe.mutate(editingRecipe.id); setEditingRecipeId(null); }}
        />
      )}

      {/* Header estilo Listas: titulo grande a la izquierda, semana + acciones a la derecha */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          paddingBottom: 8,
          marginBottom: 12,
          borderBottom: "1px solid var(--line)",
        }}
      >
        <div>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--fg-subtle)", fontWeight: 600 }}>
            Plan semanal
          </div>
          <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>
            {weekLabel(weekStart)}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <button className="icon-btn" title="Semana anterior" onClick={() => setWeekStart(shiftWeek(weekStart, -1))}>
          <IChevL size={15} />
        </button>
        <button className="icon-btn" title="Semana siguiente" onClick={() => setWeekStart(shiftWeek(weekStart, 1))}>
          <IChevR size={15} />
        </button>
        {weekStart !== mondayOfThisWeek() && (
          <button className="btn ghost" style={{ fontSize: 11, padding: "3px 8px" }} onClick={() => setWeekStart(mondayOfThisWeek())}>
            Hoy
          </button>
        )}
        <button className="btn ghost" onClick={() => void addRecipe()}>
          <IPlus size={12} /> Agregar receta
        </button>
        <button className="btn" onClick={generatePlan} title="Arma el plan de la semana con las recetas que hay, cubriendo las metas de Ajustes con la menor cantidad de porciones de sobra">
          Generar plan semanal
        </button>
      </header>

      {/* needs by meal type: planned vs target (el target se configura en Ajustes) */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        {MEAL_BUCKETS.map((bucket) => {
          const planned = plannedByBucket[bucket];
          const target = targets[bucket];
          const enough = target > 0 && planned >= target;
          return (
            <div
              key={bucket}
              style={{
                flex: 1,
                minWidth: 200,
                padding: "8px 12px",
                background: "var(--bg-elev)",
                border: `1px solid ${enough ? "var(--ok)" : "var(--line)"}`,
                borderRadius: 10,
              }}
            >
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>{MEAL_TYPE_LABELS[bucket]}</div>
              <div style={{ fontSize: 11.5, color: "var(--fg-muted)", fontVariantNumeric: "tabular-nums" }}>
                Planeado <strong style={{ color: "var(--fg)" }}>{planned}</strong>
                {target > 0 && ` de ${target} porciones`}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, flex: 1, minHeight: 0, overflowY: "auto" }}>
        {/* IZQUIERDA — el plan de esta semana */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
          <SectionTitle
            right={
              <button className="btn ghost" style={{ fontSize: 11, padding: "3px 8px" }} onClick={generateList} disabled={entries.length === 0}>
                <IPlus size={11} /> Generar lista de compra
              </button>
            }
          >
            Plan semanal · {entries.length}
          </SectionTitle>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onPlanDrop}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              flex: 1,
              minHeight: 120,
              padding: 6,
              boxSizing: "border-box",
              borderRadius: 10,
              border: dragOver ? "2px dashed var(--accent)" : "2px dashed transparent",
              transition: "border-color .1s",
            }}
          >
            {entries.length === 0 && (
              <div style={{ fontSize: 12.5, color: "var(--fg-subtle)", padding: "8px 2px" }}>
                Todavía no elegiste recetas para esta semana. Arrastra una receta desde Recetas.
              </div>
            )}
            {entries.map((e) => (
              <PlanEntryCard
                key={e.id}
                entry={e}
                recipe={recipeById.get(e.recipeId)}
                eaten={eatenByRecipe.get(e.recipeId) ?? 0}
                onSetTimes={(n) => setTimesAbs(e, n)}
                onComi={() => { const r = recipeById.get(e.recipeId); if (r) comi(r); }}
                onDelete={() => deleteEntry.mutate(e.id)}
              />
            ))}
          </div>

          <div style={{ fontSize: 11, color: "var(--fg-subtle)" }}>
            Al generar la lista se restan los ingredientes que ya tenés en el Inventario y se eligen las presentaciones de menor desperdicio.
          </div>
        </div>

        {/* DERECHA — catalogo de recetas (arrastrar una receta a la izquierda para agregarla al plan) */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
          <SectionTitle>Recetas · {recipes.length}</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, minHeight: 120, padding: 6, boxSizing: "border-box", overflowY: "auto" }}>
            {recipes.length === 0 && (
              <div style={{ fontSize: 12.5, color: "var(--fg-subtle)", padding: "8px 2px" }}>
                Todavía no cargaste recetas. Usa "Agregar receta" arriba.
              </div>
            )}
            {recipes.map((r) => (
              <RecipeCard
                key={r.id}
                recipe={r}
                ingredientCount={(riByRecipe.get(r.id) ?? []).length}
                onOpen={() => setEditingRecipeId(r.id)}
                onDelete={() => { if (window.confirm(`Borrar receta "${r.name}"?`)) deleteRecipe.mutate(r.id); }}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function RecipeCard({
  recipe,
  ingredientCount,
  onOpen,
  onDelete,
}: {
  recipe: Recipe;
  ingredientCount: number;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "copy";
        e.dataTransfer.setData("text/plain", JSON.stringify({ recipeId: recipe.id }));
      }}
      onClick={onOpen}
      title="Arrastrar al plan para agregarla. Click para editar."
      style={{
        background: "var(--bg-elev)",
        border: "1px solid var(--line)",
        borderRadius: 10,
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        cursor: "grab",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 600, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {recipe.name}
        </span>
        <Pill tone={MEAL_TYPE_TONE[recipe.mealType]}>{MEAL_TYPE_LABELS[recipe.mealType]}</Pill>
        <span onClick={(e) => e.stopPropagation()}>
          <IconBtn danger title={`Borrar ${recipe.name}`} onClick={onDelete}>
            <ITrash size={13} />
          </IconBtn>
        </span>
      </div>
      <div style={{ fontSize: 11.5, color: "var(--fg-muted)" }}>
        {recipe.servings} porc. · {ingredientCount} ingrediente{ingredientCount === 1 ? "" : "s"}
      </div>
    </div>
  );
}

function PlanEntryCard({
  entry,
  recipe,
  eaten,
  onSetTimes,
  onComi,
  onDelete,
}: {
  entry: MealPlanEntry;
  recipe: Recipe | undefined;
  eaten: number;
  onSetTimes: (n: number) => void;
  onComi: () => void;
  onDelete: () => void;
}) {
  const totalServings = entry.targetServings * (recipe?.servings ?? 1);
  const remaining = Math.max(0, totalServings - eaten);
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0,1fr) auto",
        gap: 10,
        alignItems: "center",
        padding: "10px 12px",
        background: "var(--bg-elev)",
        border: "1px solid var(--line)",
        borderRadius: 10,
      }}
    >
      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {recipe?.name ?? "—"}
          </span>
          {recipe && <Pill tone={MEAL_TYPE_TONE[recipe.mealType]}>{MEAL_TYPE_LABELS[recipe.mealType]}</Pill>}
        </div>
        <div style={{ fontSize: 11.5, color: "var(--fg-muted)", fontVariantNumeric: "tabular-nums" }}>
          × {entry.targetServings} {entry.targetServings === 1 ? "vez" : "veces"} · {totalServings} porc. total
          {eaten > 0 && (
            <>
              {" "}· comiste {eaten} · quedan <strong style={{ color: remaining === 0 ? "var(--ok)" : "var(--fg)" }}>{remaining}</strong>
            </>
          )}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          <button className="btn ghost" style={{ padding: "2px 7px", fontSize: 13 }} onClick={() => onSetTimes(entry.targetServings - 1)} title="Menos">−</button>
          <span style={{ width: 22, textAlign: "center", fontVariantNumeric: "tabular-nums", fontWeight: 600, fontSize: 13 }}>{entry.targetServings}</span>
          <button className="btn ghost" style={{ padding: "2px 7px", fontSize: 13 }} onClick={() => onSetTimes(entry.targetServings + 1)} title="Más">+</button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button className="btn ghost" style={{ fontSize: 10.5, padding: "3px 7px" }} onClick={onComi} title="Registrar que la comiste (descuenta del inventario)">
            Comí
          </button>
          <IconBtn title="Quitar del plan" onClick={onDelete}>
            <IX size={11} />
          </IconBtn>
        </div>
      </div>
    </div>
  );
}

function RecipeModal({
  recipe,
  onClose,
  onDelete,
}: {
  recipe: Recipe;
  onClose: () => void;
  onDelete: () => void;
}) {
  const patchRecipe = usePatchRecipe();
  const ingredientsQ = useIngredients();
  const riQ = useRecipeIngredients();
  const createRI = useCreateRecipeIngredient();
  const deleteRI = useDeleteRecipeIngredient();
  const categoriesQ = useIngredientCategories();

  const ingredients = useMemo(() => ingredientsQ.data ?? [], [ingredientsQ.data]);
  const categories = useMemo(() => categoriesQ.data ?? [], [categoriesQ.data]);
  const ingredientById = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients]);
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const recipeIngredients = useMemo(
    () => (riQ.data ?? []).filter((ri) => ri.recipeId === recipe.id),
    [riQ.data, recipe.id],
  );

  const [name, setName] = useState(recipe.name);
  const [stepDraft, setStepDraft] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const commitName = () => {
    const t = name.trim() || "Sin nombre";
    if (t !== recipe.name) patchRecipe.mutate({ id: recipe.id, patch: { name: t } });
  };

  const close = () => { commitName(); onClose(); };

  const updateSteps = (steps: string[]) => patchRecipe.mutate({ id: recipe.id, patch: { steps } });
  const moveStep = (idx: number, dir: -1 | 1) => {
    const next = [...recipe.steps];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    updateSteps(next);
  };

  const onBackdropMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) close();
  };

  return (
    <div className="modal-backdrop" onMouseDown={onBackdropMouseDown}>
      <div className="modal" style={{ width: 640, maxWidth: "90vw", maxHeight: "85vh", display: "flex", flexDirection: "column" }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span style={{ flex: 1, fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" }}>Receta</span>
          <button className="icon-btn" onClick={close} title="Cerrar">
            <IX size={14} />
          </button>
        </div>
        <div className="modal-body" style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              className="input"
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              style={{ flex: 1, minWidth: 180, fontSize: 15, fontWeight: 600 }}
            />
            <select
              className="input"
              value={recipe.mealType}
              onChange={(e) => patchRecipe.mutate({ id: recipe.id, patch: { mealType: e.target.value as MealType } })}
            >
              <option value="lunch_dinner">{MEAL_TYPE_LABELS.lunch_dinner}</option>
              <option value="breakfast_snack">{MEAL_TYPE_LABELS.breakfast_snack}</option>
            </select>
            <label style={{ fontSize: 12, color: "var(--fg-muted)", display: "inline-flex", alignItems: "center", gap: 6 }}>
              Porciones
              <input
                className="input"
                type="number"
                min={1}
                value={recipe.servings}
                onChange={(e) => patchRecipe.mutate({ id: recipe.id, patch: { servings: Math.max(1, Number(e.target.value) || 1) } })}
                style={{ width: 64 }}
              />
            </label>
          </div>

          {/* ingredients */}
          <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <SectionTitle>Ingredientes (para {recipe.servings} porc.)</SectionTitle>
            {recipeIngredients.length === 0 && (
              <div style={{ fontSize: 12, color: "var(--fg-subtle)" }}>Sin ingredientes.</div>
            )}
            {recipeIngredients.map((ri) => {
              const ing = ri.ingredientId ? ingredientById.get(ri.ingredientId) : undefined;
              const cat = ri.categoryId ? categoryById.get(ri.categoryId) : undefined;
              return (
                <div key={ri.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                  {ing && <Pill tone={DIMENSION_TONE[ing.dimension]}>{DIMENSION_LABELS[ing.dimension]}</Pill>}
                  {cat && <Pill tone="neutral">generico</Pill>}
                  <span style={{ flex: 1 }}>{ing?.name ?? (cat ? `[${cat.name}]` : "—")}</span>
                  <span style={{ color: "var(--fg-muted)", fontVariantNumeric: "tabular-nums" }}>
                    {ing ? formatQuantity(ri.quantity, ing.dimension) : ri.quantity}
                  </span>
                  <IconBtn title="Quitar ingrediente" onClick={() => deleteRI.mutate(ri.id)}>
                    <IX size={11} />
                  </IconBtn>
                </div>
              );
            })}
            <RecipeIngredientAdder
              ingredients={ingredients}
              categories={categories}
              onAdd={(sel) => createRI.mutate({ recipeId: recipe.id, ...sel })}
            />
          </section>

          {/* steps */}
          <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <SectionTitle>Pasos</SectionTitle>
            {recipe.steps.map((s, idx) => (
              <div key={`${idx}|${s}`} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <span style={{ width: 22, height: 22, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", background: "var(--accent-soft)", color: "var(--accent)", fontSize: 11, fontWeight: 700, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>{idx + 1}</span>
                <textarea
                  className="input"
                  defaultValue={s}
                  rows={2}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v === s) return;
                    const next = [...recipe.steps];
                    if (v) next[idx] = v;
                    else next.splice(idx, 1);
                    updateSteps(next);
                  }}
                  style={{ flex: 1, resize: "vertical" }}
                />
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <button className="btn ghost" style={{ padding: "1px 6px", fontSize: 11 }} onClick={() => moveStep(idx, -1)} disabled={idx === 0}>↑</button>
                  <button className="btn ghost" style={{ padding: "1px 6px", fontSize: 11 }} onClick={() => moveStep(idx, 1)} disabled={idx === recipe.steps.length - 1}>↓</button>
                </div>
              </div>
            ))}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const v = stepDraft.trim();
                if (!v) return;
                updateSteps([...recipe.steps, v]);
                setStepDraft("");
              }}
              style={{ display: "flex", gap: 6 }}
            >
              <input
                className="input"
                placeholder="Agregar paso…"
                value={stepDraft}
                onChange={(e) => setStepDraft(e.target.value)}
                style={{ flex: 1 }}
              />
              <button className="btn" type="submit" disabled={!stepDraft.trim()}>
                <IPlus size={11} /> Paso
              </button>
            </form>
          </section>
        </div>
        <div className="modal-foot">
          <button
            className="btn ghost"
            style={{ color: "var(--danger)" }}
            onClick={() => { if (window.confirm(`Borrar receta "${recipe.name}"?`)) onDelete(); }}
          >
            Eliminar receta
          </button>
          <div className="actions">
            <button className="btn primary" onClick={close}>Listo</button>
          </div>
        </div>
      </div>
    </div>
  );
}
function AddIngredientModal({ categories, onClose }: { categories: IngredientCategory[]; onClose: () => void }) {
  const createIngredient = useCreateIngredient();
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [dimension, setDimension] = useState<IngredientDimension>("count");
  const [shelf, setShelf] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const days = shelf.trim() ? Number(shelf) : null;
    createIngredient.mutate({
      name: trimmed,
      categoryId: categoryId || null,
      dimension,
      shelfLifeDays: days != null && Number.isFinite(days) ? days : null,
    });
    onClose();
  };

  const onBackdropMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className="modal-backdrop" onMouseDown={onBackdropMouseDown}>
      <div className="modal" style={{ width: 420 }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span style={{ flex: 1, fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" }}>Nuevo ingrediente</span>
          <button className="icon-btn" onClick={onClose} title="Cerrar">
            <IX size={14} />
          </button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label>Nombre</label>
            <input
              type="text"
              className="input"
              placeholder="ej. Arroz, Leche…"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") save(); }}
            />
          </div>
          <div className="field">
            <label>Categoría</label>
            <div className="control">
              <select className="input" style={{ width: "auto" }} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">Sin categoría</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label>Tipo de medida</label>
            <div className="control">
              <select className="input" style={{ width: "auto" }} value={dimension} onChange={(e) => setDimension(e.target.value as IngredientDimension)}>
                <option value="count">{DIMENSION_LABELS.count}</option>
                <option value="weight">{DIMENSION_LABELS.weight}</option>
                <option value="volume">{DIMENSION_LABELS.volume}</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label>Dura (días)</label>
            <input
              type="number"
              min={0}
              className="input"
              placeholder="Opcional"
              value={shelf}
              onChange={(e) => setShelf(e.target.value)}
              style={{ width: 120 }}
            />
          </div>
        </div>
        <div className="modal-foot">
          <span />
          <div className="actions">
            <button className="btn ghost" onClick={onClose}>Cancelar</button>
            <button
              className="btn primary"
              onClick={save}
              disabled={name.trim().length === 0}
              style={name.trim().length === 0 ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
            >
              <ICheck size={12} stroke={2.4} /> Crear
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function rawNumber(n: number): string {
  const rounded = Math.round(n * 1000) / 1000;
  return rounded.toString().replace(".", ",");
}

function EditIngredientModal({
  ingredient,
  presentations,
  categories,
  onClose,
  onDelete,
}: {
  ingredient: Ingredient;
  presentations: IngredientPresentation[];
  categories: IngredientCategory[];
  onClose: () => void;
  onDelete: () => void;
}) {
  const patchIngredient = usePatchIngredient();
  const createPresentation = useCreateIngredientPresentation();
  const deletePresentation = useDeleteIngredientPresentation();

  const [name, setName] = useState(ingredient.name);
  const [shelf, setShelf] = useState(ingredient.shelfLifeDays != null ? String(ingredient.shelfLifeDays) : "");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const commitName = () => {
    const t = name.trim();
    if (t && t !== ingredient.name) patchIngredient.mutate({ id: ingredient.id, patch: { name: t } });
    else setName(ingredient.name);
  };
  const commitShelf = () => {
    const days = shelf.trim() ? Number(shelf) : null;
    const next = days != null && Number.isFinite(days) ? days : null;
    if (next !== ingredient.shelfLifeDays) patchIngredient.mutate({ id: ingredient.id, patch: { shelfLifeDays: next } });
  };

  const close = () => { commitName(); commitShelf(); onClose(); };

  const onBackdropMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) close();
  };

  const [newLabel, setNewLabel] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newPrice, setNewPrice] = useState("");

  const addVariant = () => {
    const size = parseQuantity(newAmount);
    if (size == null || size <= 0) return;
    const price = newPrice.trim() ? parseQuantity(newPrice) : null;
    const label = newLabel.trim() || `${newAmount} ${baseUnit(ingredient.dimension)}`;
    createPresentation.mutate({
      ingredientId: ingredient.id,
      label,
      size,
      price: price != null && Number.isFinite(price) ? price : null,
    });
    setNewLabel("");
    setNewAmount("");
    setNewPrice("");
  };

  return (
    <div className="modal-backdrop" onMouseDown={onBackdropMouseDown}>
      <div className="modal" style={{ width: 480, maxHeight: "85vh", display: "flex", flexDirection: "column" }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span style={{ flex: 1, fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" }}>Editar ingrediente</span>
          <button className="icon-btn" onClick={close} title="Cerrar">
            <IX size={14} />
          </button>
        </div>
        <div className="modal-body" style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="field">
            <label>Nombre</label>
            <input
              className="input"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            />
          </div>
          <div className="field">
            <label>Categoría</label>
            <div className="control">
              <select
                className="input"
                style={{ width: "auto" }}
                value={ingredient.categoryId ?? ""}
                onChange={(e) => patchIngredient.mutate({ id: ingredient.id, patch: { categoryId: e.target.value || null } })}
              >
                <option value="">Sin categoría</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label>Tipo de medida</label>
            <div className="control">
              <select
                className="input"
                style={{ width: "auto" }}
                value={ingredient.dimension}
                disabled={presentations.length > 0}
                title={presentations.length > 0 ? "No se puede cambiar con variantes cargadas" : undefined}
                onChange={(e) => patchIngredient.mutate({ id: ingredient.id, patch: { dimension: e.target.value as IngredientDimension } })}
              >
                <option value="count">{DIMENSION_LABELS.count}</option>
                <option value="weight">{DIMENSION_LABELS.weight}</option>
                <option value="volume">{DIMENSION_LABELS.volume}</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label>Dura (días)</label>
            <input
              className="input"
              type="number"
              min={0}
              placeholder="Opcional"
              value={shelf}
              onChange={(e) => setShelf(e.target.value)}
              onBlur={commitShelf}
              style={{ width: 120 }}
            />
          </div>

          <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <SectionTitle>Variantes</SectionTitle>
            {presentations.length === 0 && (
              <div style={{ fontSize: 12, color: "var(--fg-subtle)" }}>Sin variantes todavía.</div>
            )}
            {presentations.map((p) => (
              <VariantRow
                key={p.id}
                presentation={p}
                dimension={ingredient.dimension}
                onDelete={() => deletePresentation.mutate(p.id)}
              />
            ))}
            <form
              onSubmit={(e) => { e.preventDefault(); addVariant(); }}
              style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}
            >
              <input className="input" placeholder="Etiqueta (ej. 1L)" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} style={{ flex: 1, minWidth: 100, fontSize: 12.5 }} />
              <input className="input" placeholder={`Cant. (${baseUnit(ingredient.dimension)})`} value={newAmount} onChange={(e) => setNewAmount(e.target.value)} style={{ width: 90, fontSize: 12.5 }} />
              <input className="input" placeholder="Precio" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} style={{ width: 80, fontSize: 12.5 }} />
              <button className="btn" type="submit" disabled={!newAmount.trim()} style={{ fontSize: 11.5 }}>
                <IPlus size={10} /> Variante
              </button>
            </form>
          </section>
        </div>
        <div className="modal-foot">
          <button
            className="btn ghost"
            style={{ color: "var(--danger)" }}
            onClick={() => { if (window.confirm(`Borrar "${ingredient.name}"?`)) onDelete(); }}
          >
            Eliminar ingrediente
          </button>
          <div className="actions">
            <button className="btn primary" onClick={close}>Listo</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function VariantRow({
  presentation,
  dimension,
  onDelete,
}: {
  presentation: IngredientPresentation;
  dimension: IngredientDimension;
  onDelete: () => void;
}) {
  const patchPresentation = usePatchIngredientPresentation();
  const [label, setLabel] = useState(presentation.label);
  const [amount, setAmount] = useState(rawNumber(presentation.size));
  const [price, setPrice] = useState(presentation.price != null ? rawNumber(presentation.price) : "");

  const commitLabel = () => {
    const t = label.trim();
    if (t && t !== presentation.label) patchPresentation.mutate({ id: presentation.id, patch: { label: t } });
    else setLabel(presentation.label);
  };
  const commitAmount = () => {
    const n = parseQuantity(amount);
    if (n != null && n > 0 && n !== presentation.size) patchPresentation.mutate({ id: presentation.id, patch: { size: n } });
    else setAmount(rawNumber(presentation.size));
  };
  const commitPrice = () => {
    const trimmed = price.trim();
    const n = trimmed ? parseQuantity(trimmed) : null;
    const next = n != null && Number.isFinite(n) ? n : null;
    if (next !== presentation.price) patchPresentation.mutate({ id: presentation.id, patch: { price: next } });
  };

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} onBlur={commitLabel} style={{ flex: 1, minWidth: 90, fontSize: 12.5 }} />
      <input className="input" value={amount} onChange={(e) => setAmount(e.target.value)} onBlur={commitAmount} style={{ width: 75, fontSize: 12.5 }} />
      <span style={{ fontSize: 11, color: "var(--fg-muted)", width: 22 }}>{baseUnit(dimension)}</span>
      <input className="input" placeholder="Precio" value={price} onChange={(e) => setPrice(e.target.value)} onBlur={commitPrice} style={{ width: 70, fontSize: 12.5 }} />
      <IconBtn danger title="Quitar variante" onClick={onDelete}>
        <IX size={11} />
      </IconBtn>
    </div>
  );
}

function IngredientCard({
  ingredient,
  presentations,
  category,
  onEdit,
  onDelete,
}: {
  ingredient: Ingredient;
  presentations: IngredientPresentation[];
  category?: IngredientCategory;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const createPresentation = useCreateIngredientPresentation();
  const deletePresentation = useDeleteIngredientPresentation();
  const [showAddPresentation, setShowAddPresentation] = useState(false);

  const units = unitOptions(ingredient.dimension);
  const [pLabel, setPLabel] = useState("");
  const [pAmount, setPAmount] = useState("");
  const [pUnit, setPUnit] = useState(units[0].unit);
  const [pPrice, setPPrice] = useState("");

  const addPresentation = () => {
    const amount = parseQuantity(pAmount);
    if (amount == null || amount <= 0) return;
    const size = toBase(amount, pUnit);
    const price = pPrice.trim() ? parseQuantity(pPrice) : null;
    const label = pLabel.trim() || `${pAmount} ${units.find((u) => u.unit === pUnit)?.label ?? ""}`.trim();
    createPresentation.mutate({
      ingredientId: ingredient.id,
      label,
      size,
      price: price != null && Number.isFinite(price) ? price : null,
    });
    setPLabel("");
    setPAmount("");
    setPPrice("");
    setShowAddPresentation(false);
  };

  return (
    <div style={{ background: "var(--bg-elev)", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 12px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 600, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {ingredient.name}
        </span>
        {category && <Pill tone={colorsForHue(category.hue).bg} title="Categoría">{category.name}</Pill>}
        <Pill tone={DIMENSION_TONE[ingredient.dimension]} title="Tipo de medida">
          {DIMENSION_LABELS[ingredient.dimension]}
        </Pill>
        <IconBtn title={`Editar ${ingredient.name}`} onClick={onEdit}>
          <IEdit size={13} />
        </IconBtn>
        <IconBtn danger title={`Borrar ${ingredient.name}`} onClick={onDelete}>
          <ITrash size={13} />
        </IconBtn>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 2 }}>
        {presentations.map((p) => (
          <span
            key={p.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "copy";
              e.dataTransfer.setData("text/plain", JSON.stringify({ ingredientId: ingredient.id, presentationId: p.id }));
            }}
            title="Arrastrar a la lista para agregarlo"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11.5,
              padding: "4px 9px",
              background: "var(--bg-sunken)",
              border: "1px solid var(--line)",
              borderRadius: 999,
              cursor: "grab",
            }}
          >
            {p.label}
            <span style={{ color: "var(--fg-muted)", fontVariantNumeric: "tabular-nums" }}>· {formatQuantity(p.size, ingredient.dimension)}</span>
            <button
              onClick={(e) => { e.stopPropagation(); deletePresentation.mutate(p.id); }}
              title="Quitar presentación"
              style={{ background: "none", border: 0, padding: 0, marginLeft: 2, cursor: "pointer", color: "var(--fg-subtle)", display: "flex" }}
            >
              <IX size={10} />
            </button>
          </span>
        ))}
        <button
          className="btn ghost"
          style={{ fontSize: 10.5, padding: "3px 8px", borderRadius: 999 }}
          onClick={() => setShowAddPresentation((v) => !v)}
        >
          <IPlus size={10} /> Variante
        </button>
      </div>

      {showAddPresentation && (
        <form
          onSubmit={(e) => { e.preventDefault(); addPresentation(); }}
          style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 2 }}
        >
          <input className="input" placeholder="Etiqueta" value={pLabel} onChange={(e) => setPLabel(e.target.value)} style={{ flex: 1, minWidth: 100, fontSize: 12 }} />
          <input className="input" placeholder="Cantidad" value={pAmount} onChange={(e) => setPAmount(e.target.value)} style={{ width: 75, fontSize: 12 }} />
          {units.length > 1 ? (
            <select className="input" value={pUnit} onChange={(e) => setPUnit(e.target.value)} style={{ fontSize: 12 }}>
              {units.map((u) => (
                <option key={u.unit} value={u.unit}>{u.label}</option>
              ))}
            </select>
          ) : (
            <span style={{ fontSize: 11, color: "var(--fg-muted)" }}>{units[0].label}</span>
          )}
          <input className="input" placeholder="Precio" value={pPrice} onChange={(e) => setPPrice(e.target.value)} style={{ width: 75, fontSize: 12 }} />
          <button className="btn" type="submit" disabled={!pAmount.trim()} style={{ fontSize: 11 }}>
            <ICheck size={10} /> Guardar
          </button>
        </form>
      )}
    </div>
  );
}

function ListCard({
  item,
  ingredient,
  presentation,
  price,
  onToggle,
  onSetQty,
  onDelete,
}: {
  item: ShoppingItem;
  ingredient: Ingredient | null;
  presentation: IngredientPresentation | null;
  price: number | null;
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

  const title = ingredient && presentation ? `${ingredient.name} - ${presentation.label}` : ingredient?.name ?? item.name;
  const detailParts: string[] = [];
  if (ingredient && presentation) detailParts.push(formatQuantity(presentation.size, ingredient.dimension));
  if (price != null) detailParts.push(fmtMoney(price));

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "auto minmax(0,1fr) auto",
        gap: 10,
        alignItems: "center",
        padding: "10px 12px",
        boxSizing: "border-box",
        background: item.bought ? "rgba(34,197,94,0.10)" : "var(--bg-elev)",
        border: item.bought ? "1px solid var(--ok)" : "1px solid var(--line)",
        borderRadius: 10,
      }}
    >
      <button
        onClick={onToggle}
        title={item.bought ? "Marcar como no comprado" : "Marcar como comprado"}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 26,
          height: 26,
          borderRadius: "50%",
          border: item.bought ? "1px solid var(--ok)" : "1px solid var(--line-strong)",
          background: item.bought ? "var(--ok)" : "none",
          color: item.bought ? "#fff" : "var(--fg-subtle)",
          cursor: "pointer",
        }}
      >
        <ICheck size={13} stroke={2.6} />
      </button>

      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: item.bought ? "var(--fg-muted)" : "var(--fg)" }}>
          {title}
        </div>

        {detailParts.length > 0 && (
          <div style={{ fontSize: 11.5, color: "var(--fg-muted)", fontVariantNumeric: "tabular-nums" }}>
            {detailParts.join(" · ")}
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          <button className="btn ghost" style={{ padding: "2px 7px", fontSize: 13 }} onClick={() => onSetQty(item.quantity - 1)} title="Menos">−</button>
          <input
            className="input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            inputMode="numeric"
            style={{ width: 40, textAlign: "center", padding: "3px 4px", fontVariantNumeric: "tabular-nums" }}
          />
          <button className="btn ghost" style={{ padding: "2px 7px", fontSize: 13 }} onClick={() => onSetQty(item.quantity + 1)} title="Más">+</button>
        </div>
        <IconBtn title="Eliminar" onClick={onDelete}>
          <ITrash size={12} />
        </IconBtn>
      </div>
    </div>
  );
}
