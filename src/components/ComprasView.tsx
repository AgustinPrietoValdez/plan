import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  useCreateIngredient,
  useCreateIngredientPresentation,
  useCreateRecipe,
  useCreateRecipeIngredient,
  useCreateInventory,
  useCreateMealPlanEntry,
  useCreateSavedList,
  useCreateShoppingItem,
  useComprasSettings,
  useUpsertComprasSettings,
  useDeleteIngredient,
  useDeleteIngredientPresentation,
  useDeleteMealPlanEntry,
  useDeleteRecipe,
  useDeleteRecipeIngredient,
  useDeleteInventory,
  useDeleteSavedList,
  useDeleteShoppingItem,
  useIngredientPresentations,
  useIngredientCategories,
  useIngredients,
  useInventory,
  useMealLogs,
  useMealPlanEntries,
  usePatchMealPlanEntry,
  usePatchRecipe,
  usePatchShoppingItem,
  useRecipeIngredients,
  useRecipes,
  useSavedLists,
  useShoppingItems,
} from "../lib/queries";
import {
  aggregateNeed,
  findMergeTarget,
  neededToShoppingItems,
} from "../lib/compras";
import type { ShoppingItemCreate } from "../lib/repo";
import { fmtMoney, fmtUsdFromDkk } from "../lib/money";
import { useUsdRate } from "../lib/useUsdRate";
import { defaultSlot, useLogMeal } from "../lib/useLogMeal";
import { useToggleBought } from "../lib/useToggleBought";
import { fromYmd, todayYmd, ymd } from "../lib/date";
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
  MealSlot,
  MealType,
  Recipe,
  RecipeIngredient,
  ShoppingItem,
} from "../types";
import { colorsForHue } from "../lib/categoryColor";
import { IngredientCategoryManager } from "./IngredientCategoryManager";
import { IChevD, IChevL, IChevR, IPlus, ITrash, IX } from "./icons";

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
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600, color: "var(--fg-muted)", flex: 1 }}>
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

type Tab = "ingredientes" | "recetas" | "listas" | "plan" | "inventario" | "ajustes";

const TABS: { id: Tab; label: string; ready: boolean }[] = [
  { id: "ingredientes", label: "Ingredientes", ready: true },
  { id: "recetas", label: "Recetas", ready: true },
  { id: "listas", label: "Listas", ready: true },
  { id: "plan", label: "Plan semanal", ready: true },
  { id: "inventario", label: "Inventario", ready: true },
  { id: "ajustes", label: "Ajustes", ready: true },
];

export function ComprasView() {
  const [tab, setTab] = useState<Tab>("listas");

  return (
    <div className="day-view-main" style={{ flex: 1, minHeight: 0 }}>
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
            {TABS.find((t) => t.id === tab)?.label}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <div
          role="tablist"
          style={{
            display: "inline-flex",
            padding: 3,
            gap: 2,
            background: "var(--bg-sunken)",
            border: "1px solid var(--line)",
            borderRadius: 10,
          }}
        >
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                title={t.ready ? undefined : "Próximamente"}
                style={{
                  appearance: "none",
                  border: "none",
                  background: active ? "var(--bg-elev)" : "transparent",
                  color: active ? "var(--fg)" : "var(--fg-muted)",
                  fontSize: 12.5,
                  fontWeight: active ? 600 : 500,
                  padding: "6px 12px",
                  borderRadius: 7,
                  cursor: "pointer",
                  boxShadow: active ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                  opacity: t.ready ? 1 : 0.55,
                  transition: "background .15s, color .15s",
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </header>

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
        {tab === "ingredientes" ? (
          <IngredientesPanel />
        ) : tab === "recetas" ? (
          <RecetasPanel />
        ) : tab === "listas" ? (
          <ListasPanel />
        ) : tab === "plan" ? (
          <PlanPanel />
        ) : tab === "inventario" ? (
          <InventarioPanel />
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

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button className="btn" style={{ background: "var(--accent)", color: "#fff", borderColor: "var(--accent)" }} onClick={save}>
          Guardar ajustes
        </button>
        <span style={{ fontSize: 11, color: "var(--fg-subtle)" }}>Se sincronizan al celular, que es donde suenan las notificaciones.</span>
      </div>
    </div>
  );
}

function IngredientesPanel() {
  const ingredientsQ = useIngredients();
  const presentationsQ = useIngredientPresentations();
  const categoriesQ = useIngredientCategories();
  const ingredients = useMemo(() => ingredientsQ.data ?? [], [ingredientsQ.data]);
  const presentations = useMemo(() => presentationsQ.data ?? [], [presentationsQ.data]);
  const categories = useMemo(() => (categoriesQ.data ?? []).filter((c) => !c.archived), [categoriesQ.data]);
  const [showCategoryManager, setShowCategoryManager] = useState(false);

  const byIngredient = useMemo(() => {
    const m = new Map<string, IngredientPresentation[]>();
    for (const p of presentations) {
      const arr = m.get(p.ingredientId) ?? [];
      arr.push(p);
      m.set(p.ingredientId, arr);
    }
    return m;
  }, [presentations]);

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  return (
    <>
      {showCategoryManager && <IngredientCategoryManager onClose={() => setShowCategoryManager(false)} />}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 720 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1 }} />
          <button className="btn ghost" style={{ fontSize: 12 }} onClick={() => setShowCategoryManager(true)}>
            Categorías
          </button>
        </div>
        <NewIngredientForm categories={categories} />
        {ingredients.length === 0 ? (
          <div style={{ fontSize: 12.5, color: "var(--fg-subtle)", padding: "8px 2px" }}>
            Todavía no cargaste ingredientes.
          </div>
        ) : (
          ingredients.map((ing) => (
            <IngredientRow
              key={ing.id}
              ingredient={ing}
              presentations={byIngredient.get(ing.id) ?? []}
              category={ing.categoryId ? categoryById.get(ing.categoryId) : undefined}
            />
          ))
        )}
      </div>
    </>
  );
}

function NewIngredientForm({ categories }: { categories: IngredientCategory[] }) {
  const createIngredient = useCreateIngredient();
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [dimension, setDimension] = useState<IngredientDimension>("count");
  const [shelf, setShelf] = useState("");

  const add = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const days = shelf.trim() ? Number(shelf) : null;
    createIngredient.mutate({
      name: trimmed,
      categoryId: categoryId || null,
      dimension,
      shelfLifeDays: days != null && Number.isFinite(days) ? days : null,
    });
    setName("");
    setCategoryId("");
    setShelf("");
    setDimension("count");
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        add();
      }}
      style={{
        display: "flex",
        gap: 8,
        alignItems: "center",
        padding: 12,
        background: "var(--bg-elev)",
        border: "1px solid var(--line)",
        borderRadius: 10,
        flexWrap: "wrap",
      }}
    >
      <input
        className="input"
        placeholder="Nuevo ingrediente…"
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{ flex: 1, minWidth: 160 }}
      />
      <select
        className="input"
        value={categoryId}
        onChange={(e) => setCategoryId(e.target.value)}
        title="Categoría del ingrediente"
        style={{ width: 160 }}
      >
        <option value="">Sin categoría</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <select
        className="input"
        value={dimension}
        onChange={(e) => setDimension(e.target.value as IngredientDimension)}
        title="Tipo de medida"
      >
        <option value="count">{DIMENSION_LABELS.count}</option>
        <option value="weight">{DIMENSION_LABELS.weight}</option>
        <option value="volume">{DIMENSION_LABELS.volume}</option>
      </select>
      <input
        className="input"
        type="number"
        min={0}
        placeholder="Dura (días)"
        value={shelf}
        onChange={(e) => setShelf(e.target.value)}
        style={{ width: 110 }}
        title="Vida útil en días (opcional)"
      />
      <button className="btn" type="submit" disabled={!name.trim()}>
        <IPlus size={12} /> Agregar
      </button>
    </form>
  );
}

function IngredientRow({
  ingredient,
  presentations,
  category,
}: {
  ingredient: Ingredient;
  presentations: IngredientPresentation[];
  category?: IngredientCategory;
}) {
  const deleteIngredient = useDeleteIngredient();
  const createPresentation = useCreateIngredientPresentation();
  const deletePresentation = useDeleteIngredientPresentation();
  const [open, setOpen] = useState(false);

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
  };

  return (
    <div style={{ background: "var(--bg-elev)", border: "1px solid var(--line)", borderRadius: 10 }}>
      <div
        style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", cursor: "pointer" }}
        onClick={() => setOpen((o) => !o)}
      >
        <span style={{ display: "inline-flex", color: "var(--fg-subtle)", transition: "transform .15s", transform: open ? "rotate(0)" : "rotate(-90deg)" }}>
          <IChevD size={14} />
        </span>
        <span style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>{ingredient.name}</span>
        {category && (
          <Pill tone={colorsForHue(category.hue).bg} title="Categoría">{category.name}</Pill>
        )}
        <Pill tone={DIMENSION_TONE[ingredient.dimension]} title="Tipo de medida">
          {DIMENSION_LABELS[ingredient.dimension]}
        </Pill>
        {ingredient.shelfLifeDays != null && (
          <span style={{ fontSize: 11.5, color: "var(--fg-muted)", fontVariantNumeric: "tabular-nums" }}>
            dura {ingredient.shelfLifeDays}d
          </span>
        )}
        <span style={{ fontSize: 11.5, color: "var(--fg-muted)" }}>
          {presentations.length} {presentations.length === 1 ? "presentación" : "presentaciones"}
        </span>
        <span onClick={(e) => e.stopPropagation()}>
          <IconBtn
            danger
            title={`Borrar ${ingredient.name}`}
            onClick={() => { if (window.confirm(`Borrar "${ingredient.name}"?`)) deleteIngredient.mutate(ingredient.id); }}
          >
            <ITrash size={13} />
          </IconBtn>
        </span>
      </div>

      {open && (
        <div style={{ borderTop: "1px solid var(--line)", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
          {presentations.length === 0 && (
            <div style={{ fontSize: 12, color: "var(--fg-subtle)" }}>Sin presentaciones.</div>
          )}
          {presentations.map((p) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12.5 }}>
              <span style={{ flex: 1 }}>{p.label}</span>
              <span style={{ color: "var(--fg-muted)", fontVariantNumeric: "tabular-nums" }}>
                {formatQuantity(p.size, ingredient.dimension)}
                {p.price != null && ` · ${fmtMoney(p.price)}`}
              </span>
              <IconBtn title="Quitar presentación" onClick={() => deletePresentation.mutate(p.id)}>
                <IX size={11} />
              </IconBtn>
            </div>
          ))}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              addPresentation();
            }}
            style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}
          >
            <input
              className="input"
              placeholder="Etiqueta (ej: Botella 1 L)"
              value={pLabel}
              onChange={(e) => setPLabel(e.target.value)}
              style={{ flex: 1, minWidth: 140 }}
            />
            <input
              className="input"
              placeholder="Cantidad"
              value={pAmount}
              onChange={(e) => setPAmount(e.target.value)}
              style={{ width: 90 }}
              title={`Tamaño en que viene (unidad base: ${baseUnit(ingredient.dimension)})`}
            />
            {units.length > 1 ? (
              <select className="input" value={pUnit} onChange={(e) => setPUnit(e.target.value)}>
                {units.map((u) => (
                  <option key={u.unit} value={u.unit}>
                    {u.label}
                  </option>
                ))}
              </select>
            ) : (
              <span style={{ fontSize: 12, color: "var(--fg-muted)", width: 24 }}>{units[0].label}</span>
            )}
            <input
              className="input"
              placeholder="Precio"
              value={pPrice}
              onChange={(e) => setPPrice(e.target.value)}
              style={{ width: 90 }}
              title="Precio (opcional, manual)"
            />
            <button className="btn" type="submit" disabled={!pAmount.trim()}>
              <IPlus size={11} /> Presentación
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

// ---------------- Recetas ----------------

/** Shared: add a recipe's ingredients to the shopping list (least waste +
 *  merge into existing items). Returns how many list items were touched. */
function useAddRecipeToList() {
  const ingredientsQ = useIngredients();
  const presentationsQ = useIngredientPresentations();
  const riQ = useRecipeIngredients();
  const shoppingItemsQ = useShoppingItems();
  const createShoppingItem = useCreateShoppingItem();
  const patchShoppingItem = usePatchShoppingItem();

  return (recipe: Recipe): number => {
    const ris = (riQ.data ?? []).filter((ri) => ri.recipeId === recipe.id);
    if (ris.length === 0) return 0;
    const ingredientById = new Map<string, Ingredient>();
    for (const i of ingredientsQ.data ?? []) ingredientById.set(i.id, i);
    const presentationsByIngredient = new Map<string, IngredientPresentation[]>();
    for (const p of presentationsQ.data ?? []) {
      const arr = presentationsByIngredient.get(p.ingredientId) ?? [];
      arr.push(p);
      presentationsByIngredient.set(p.ingredientId, arr);
    }
    const need = new Map<string, number>();
    for (const ri of ris) need.set(ri.ingredientId, (need.get(ri.ingredientId) ?? 0) + ri.quantity);
    const items = neededToShoppingItems(need, ingredientById, presentationsByIngredient);
    const current = shoppingItemsQ.data ?? [];
    for (const it of items) {
      const target = findMergeTarget(current, it);
      if (target) patchShoppingItem.mutate({ id: target.id, patch: { quantity: target.quantity + it.quantity } });
      else createShoppingItem.mutate(it);
    }
    return items.length;
  };
}

function RecetasPanel() {
  const recipesQ = useRecipes();
  const createRecipe = useCreateRecipe();
  const deleteRecipe = useDeleteRecipe();
  const addRecipeToList = useAddRecipeToList();
  const logMeal = useLogMeal();
  const recipes = useMemo(() => recipesQ.data ?? [], [recipesQ.data]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  const selected = recipes.find((r) => r.id === selectedId) ?? null;

  const newRecipe = async () => {
    const r = await createRecipe.mutateAsync({
      name: "Nueva receta",
      servings: 1,
      mealType: "lunch_dinner",
      steps: [],
    });
    setSelectedId(r.id);
  };

  if (selected) {
    return <RecipeEditor recipe={selected} onBack={() => setSelectedId(null)} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 720 }}>
      <div>
        <button className="btn" onClick={() => void newRecipe()}>
          <IPlus size={12} /> Nueva receta
        </button>
      </div>
      {recipes.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "var(--fg-subtle)", padding: "8px 2px" }}>
          Todavía no cargaste recetas.
        </div>
      ) : (
        recipes.map((r) => (
          <div
            key={r.id}
            onClick={() => setSelectedId(r.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 12px",
              background: "var(--bg-elev)",
              border: "1px solid var(--line)",
              borderRadius: 10,
              cursor: "pointer",
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>{r.name}</span>
            <Pill tone={MEAL_TYPE_TONE[r.mealType]}>{MEAL_TYPE_LABELS[r.mealType]}</Pill>
            <span style={{ fontSize: 11.5, color: "var(--fg-muted)", fontVariantNumeric: "tabular-nums" }}>
              {r.servings} porc.
            </span>
            <button
              className="btn"
              style={{ padding: "3px 8px", fontSize: 11 }}
              title="Agregar ingredientes a la lista"
              onClick={(e) => {
                e.stopPropagation();
                const n = addRecipeToList(r);
                window.alert(n > 0 ? `Agregué ${n} ítem(s) a la lista.` : "Esta receta no tiene ingredientes.");
              }}
            >
              <IPlus size={11} /> A la lista
            </button>
            <button
              className="btn ghost"
              style={{ padding: "3px 8px", fontSize: 11 }}
              title="Registrar que la comiste (descuenta del inventario)"
              onClick={(e) => {
                e.stopPropagation();
                comi(r);
              }}
            >
              Comí
            </button>
            <span onClick={(e) => e.stopPropagation()}>
              <IconBtn
                danger
                title={`Borrar receta ${r.name}`}
                onClick={() => { if (window.confirm(`Borrar receta "${r.name}"?`)) deleteRecipe.mutate(r.id); }}
              >
                <ITrash size={13} />
              </IconBtn>
            </span>
          </div>
        ))
      )}
    </div>
  );
}

function RecipeEditor({ recipe, onBack }: { recipe: Recipe; onBack: () => void }) {
  const patchRecipe = usePatchRecipe();
  const ingredientsQ = useIngredients();
  const riQ = useRecipeIngredients();
  const createRI = useCreateRecipeIngredient();
  const deleteRI = useDeleteRecipeIngredient();
  const addRecipeToList = useAddRecipeToList();

  const ingredients = useMemo(() => ingredientsQ.data ?? [], [ingredientsQ.data]);
  const ingredientById = useMemo(() => {
    const m = new Map<string, Ingredient>();
    for (const i of ingredients) m.set(i.id, i);
    return m;
  }, [ingredients]);
  const recipeIngredients = useMemo(
    () => (riQ.data ?? []).filter((ri) => ri.recipeId === recipe.id),
    [riQ.data, recipe.id],
  );

  const [name, setName] = useState(recipe.name);
  const [stepDraft, setStepDraft] = useState("");

  const addToList = () => {
    const n = addRecipeToList(recipe);
    window.alert(n > 0 ? `Agregué ${n} ítem(s) a la lista (pestaña Listas).` : "Esta receta no tiene ingredientes.");
  };

  const saveAndExit = () => {
    const t = name.trim() || "Sin nombre";
    if (t !== recipe.name) patchRecipe.mutate({ id: recipe.id, patch: { name: t } });
    onBack();
  };

  const updateSteps = (steps: string[]) => patchRecipe.mutate({ id: recipe.id, patch: { steps } });
  const moveStep = (idx: number, dir: -1 | 1) => {
    const next = [...recipe.steps];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    updateSteps(next);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 720 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button className="btn ghost" onClick={saveAndExit}>← Volver</button>
        <span style={{ flex: 1 }} />
        <button className="btn ghost" onClick={addToList} disabled={recipeIngredients.length === 0} title="Agregar ingredientes a la lista de compra">
          <IPlus size={12} /> Agregar a la lista
        </button>
        <button className="btn" onClick={saveAndExit} style={{ background: "var(--accent)", color: "#fff", borderColor: "var(--accent)" }}>
          Guardar
        </button>
      </div>

      {/* meta */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            const t = name.trim() || "Sin nombre";
            if (t !== recipe.name) patchRecipe.mutate({ id: recipe.id, patch: { name: t } });
          }}
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
          const ing = ingredientById.get(ri.ingredientId);
          return (
            <div key={ri.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
              {ing && <Pill tone={DIMENSION_TONE[ing.dimension]}>{DIMENSION_LABELS[ing.dimension]}</Pill>}
              <span style={{ flex: 1 }}>{ing?.name ?? "—"}</span>
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
          onAdd={(ingredientId, quantity) => createRI.mutate({ recipeId: recipe.id, ingredientId, quantity })}
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
  );
}

function RecipeIngredientAdder({
  ingredients,
  onAdd,
}: {
  ingredients: Ingredient[];
  onAdd: (ingredientId: string, quantityBase: number) => void;
}) {
  const [ingredientId, setIngredientId] = useState("");
  const [amount, setAmount] = useState("");
  const selected = ingredients.find((i) => i.id === ingredientId) ?? null;
  const units = selected ? unitOptions(selected.dimension) : [];
  const [unit, setUnit] = useState("");

  const effectiveUnit = unit || units[0]?.unit || "u";

  const add = () => {
    if (!selected) return;
    const amt = parseQuantity(amount);
    if (amt == null || amt <= 0) return;
    onAdd(selected.id, toBase(amt, effectiveUnit));
    setAmount("");
  };

  if (ingredients.length === 0) {
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
      <input
        className="input"
        placeholder="Cant. (admite 1/2)"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        style={{ width: 120 }}
      />
      {selected && units.length > 1 ? (
        <select className="input" value={effectiveUnit} onChange={(e) => setUnit(e.target.value)}>
          {units.map((u) => (
            <option key={u.unit} value={u.unit}>
              {u.label}
            </option>
          ))}
        </select>
      ) : selected ? (
        <span style={{ fontSize: 12, color: "var(--fg-muted)", width: 24 }}>{units[0]?.label}</span>
      ) : null}
      <button className="btn" type="submit" disabled={!selected || !amount.trim()}>
        <IPlus size={11} /> Agregar
      </button>
    </form>
  );
}

// ---------------- Listas ----------------

function ListasPanel() {
  const itemsQ = useShoppingItems();
  const presentationsQ = useIngredientPresentations();
  const createItem = useCreateShoppingItem();
  const patchItem = usePatchShoppingItem();
  const deleteItem = useDeleteShoppingItem();
  const savedQ = useSavedLists();
  const createSaved = useCreateSavedList();
  const deleteSaved = useDeleteSavedList();
  const toggleBought = useToggleBought();

  const usdRate = useUsdRate();
  const items = useMemo(() => itemsQ.data ?? [], [itemsQ.data]);
  const saved = useMemo(() => savedQ.data ?? [], [savedQ.data]);
  const priceById = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const p of presentationsQ.data ?? []) m.set(p.id, p.price);
    return m;
  }, [presentationsQ.data]);
  const pending = items.filter((i) => !i.bought);
  const bought = items.filter((i) => i.bought);

  const itemPrice = (it: ShoppingItem): number | null => {
    if (!it.presentationId) return null;
    const unit = priceById.get(it.presentationId);
    return unit == null ? null : unit * it.quantity;
  };
  const total = items.reduce((s, it) => s + (itemPrice(it) ?? 0), 0);

  const addProduct = (it: ShoppingItemCreate) => {
    const target = findMergeTarget(items, it);
    if (target) patchItem.mutate({ id: target.id, patch: { quantity: target.quantity + it.quantity } });
    else createItem.mutate(it);
  };

  const setQtyAbs = (it: ShoppingItem, n: number) => {
    const next = Math.max(1, n);
    if (next !== it.quantity) patchItem.mutate({ id: it.id, patch: { quantity: next } });
  };

  const clearBought = () => {
    if (bought.length === 0) return;
    if (!window.confirm(`Vaciar ${bought.length} comprado(s)?`)) return;
    for (const it of bought) deleteItem.mutate(it.id);
  };

  const saveCurrent = () => {
    if (items.length === 0) return;
    const listName = window.prompt("Nombre de la lista guardada:");
    if (!listName?.trim()) return;
    createSaved.mutate({
      name: listName.trim(),
      items: items.map((i) => ({
        name: i.name,
        quantity: i.quantity,
        ingredientId: i.ingredientId,
        presentationId: i.presentationId,
        unit: i.unit,
      })),
    });
  };

  const loadSaved = (listId: string) => {
    const list = saved.find((l) => l.id === listId);
    if (!list) return;
    for (const it of list.items) {
      const add = {
        name: it.name,
        quantity: it.quantity,
        ingredientId: it.ingredientId ?? null,
        presentationId: it.presentationId ?? null,
        unit: it.unit ?? null,
      };
      const target = findMergeTarget(items, add);
      if (target) patchItem.mutate({ id: target.id, patch: { quantity: target.quantity + add.quantity } });
      else createItem.mutate(add);
    }
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 24, maxWidth: 900 }}>
      {/* active list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <SectionTitle
          right={
            <>
              <button className="btn ghost" style={{ fontSize: 11, padding: "3px 8px" }} onClick={saveCurrent} disabled={items.length === 0}>
                Guardar como lista
              </button>
              <button className="btn ghost" style={{ fontSize: 11, padding: "3px 8px" }} onClick={clearBought} disabled={bought.length === 0}>
                Vaciar comprados
              </button>
            </>
          }
        >
          Lista de la semana · {items.length}
          {total > 0 && (
            <span style={{ marginLeft: 8, color: "var(--fg)", fontWeight: 700, textTransform: "none" }}>
              {fmtMoney(total)} <span style={{ color: "var(--fg-muted)", fontWeight: 500 }}>≈ {fmtUsdFromDkk(total, usdRate)}</span>
            </span>
          )}
        </SectionTitle>

        <ListProductAdder onAdd={addProduct} />

        {items.length === 0 && (
          <div style={{ fontSize: 12.5, color: "var(--fg-subtle)", padding: "8px 2px" }}>La lista está vacía.</div>
        )}
        {pending.map((it) => (
          <ListItemRow
            key={it.id}
            item={it}
            price={itemPrice(it)}
            usdRate={usdRate}
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
          <ListItemRow
            key={it.id}
            item={it}
            price={itemPrice(it)}
            usdRate={usdRate}
            onToggle={() => toggleBought(it, false)}
            onSetQty={(n) => setQtyAbs(it, n)}
            onDelete={() => deleteItem.mutate(it.id)}
          />
        ))}
      </div>

      {/* saved lists */}
      <aside style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <SectionTitle>Listas guardadas</SectionTitle>
        {saved.length === 0 && (
          <div style={{ fontSize: 12, color: "var(--fg-subtle)" }}>Ninguna todavía.</div>
        )}
        {saved.map((l) => (
          <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "var(--bg-elev)", border: "1px solid var(--line)", borderRadius: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.name}</div>
              <div style={{ fontSize: 11, color: "var(--fg-subtle)" }}>{l.items.length} ítems</div>
            </div>
            <button className="btn ghost" style={{ fontSize: 11, padding: "3px 7px" }} onClick={() => loadSaved(l.id)} title="Agregar sus ítems a la lista actual">Cargar</button>
            <IconBtn danger title={`Borrar lista ${l.name}`} onClick={() => { if (window.confirm(`Borrar lista "${l.name}"?`)) deleteSaved.mutate(l.id); }}>
              <ITrash size={12} />
            </IconBtn>
          </div>
        ))}
      </aside>
    </div>
  );
}

// ---------------- Inventario ----------------

function InventarioPanel() {
  const inventoryQ = useInventory();
  const ingredientsQ = useIngredients();
  const presentationsQ = useIngredientPresentations();
  const createInventory = useCreateInventory();
  const deleteInventory = useDeleteInventory();

  const inventory = useMemo(() => inventoryQ.data ?? [], [inventoryQ.data]);
  const ingredients = useMemo(() => ingredientsQ.data ?? [], [ingredientsQ.data]);
  const ingredientById = useMemo(() => {
    const m = new Map<string, Ingredient>();
    for (const i of ingredients) m.set(i.id, i);
    return m;
  }, [ingredients]);
  const presentationById = useMemo(() => {
    const m = new Map<string, IngredientPresentation>();
    for (const p of presentationsQ.data ?? []) m.set(p.id, p);
    return m;
  }, [presentationsQ.data]);
  const presByIngredient = useMemo(() => {
    const m = new Map<string, IngredientPresentation[]>();
    for (const p of presentationsQ.data ?? []) {
      const arr = m.get(p.ingredientId) ?? [];
      arr.push(p);
      m.set(p.ingredientId, arr);
    }
    return m;
  }, [presentationsQ.data]);

  // group lots by ingredient
  const groups = useMemo(() => {
    const m = new Map<string, typeof inventory>();
    for (const lot of inventory) {
      const arr = m.get(lot.ingredientId) ?? [];
      arr.push(lot);
      m.set(lot.ingredientId, arr);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => (a.expiresOn ?? "9999").localeCompare(b.expiresOn ?? "9999"));
    }
    return m;
  }, [inventory]);

  const today = todayYmd();
  const warnLimit = ymd((() => { const d = fromYmd(today); d.setDate(d.getDate() + 3); return d; })());

  // add form
  const [ingredientId, setIngredientId] = useState("");
  const [presentationId, setPresentationId] = useState("");
  const [count, setCount] = useState(1);
  const [expires, setExpires] = useState("");

  const selectedIng = ingredients.find((i) => i.id === ingredientId) ?? null;
  const presForSelected = selectedIng ? presByIngredient.get(selectedIng.id) ?? [] : [];

  const add = () => {
    if (!selectedIng) return;
    const pres = presForSelected.find((p) => p.id === presentationId);
    if (!pres) return;
    const n = Math.max(1, Math.round(count));
    for (let k = 0; k < n; k++) {
      createInventory.mutate({
        ingredientId: selectedIng.id,
        presentationId: pres.id,
        quantity: pres.size,
        expiresOn: expires || null,
      });
    }
    setIngredientId("");
    setPresentationId("");
    setCount(1);
    setExpires("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 720 }}>
      <div style={{ fontSize: 11, color: "var(--fg-subtle)" }}>
        Lo que tenés en casa, por presentación (cada botella/caja es un lote con su vencimiento). Se descuenta cuando registrás que comiste una receta ("Comí") o cuando lo cargás desde la lista.
      </div>

      {ingredients.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "var(--fg-subtle)" }}>
          Cargá ingredientes (con presentaciones) en la pestaña Ingredientes para poder cargar stock.
        </div>
      ) : (
        <form
          onSubmit={(e) => { e.preventDefault(); add(); }}
          style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: 12, background: "var(--bg-elev)", border: "1px solid var(--line)", borderRadius: 10 }}
        >
          <select className="input" value={ingredientId} onChange={(e) => { setIngredientId(e.target.value); setPresentationId(""); }} style={{ flex: 1, minWidth: 150 }}>
            <option value="">Ingrediente…</option>
            {ingredients.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
          <select className="input" value={presentationId} onChange={(e) => setPresentationId(e.target.value)} disabled={!selectedIng} style={{ minWidth: 130 }}>
            <option value="">Presentación…</option>
            {presForSelected.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <label style={{ fontSize: 11, color: "var(--fg-muted)", display: "inline-flex", alignItems: "center", gap: 4 }}>
            Cantidad
            <input className="input" type="number" min={1} value={count} onChange={(e) => setCount(Number(e.target.value) || 1)} style={{ width: 56 }} />
          </label>
          <label style={{ fontSize: 11, color: "var(--fg-muted)", display: "inline-flex", alignItems: "center", gap: 4 }}>
            Vence
            <input className="input" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} style={{ padding: "3px 6px" }} />
          </label>
          <button className="btn" type="submit" disabled={!presentationId}><IPlus size={11} /> Cargar</button>
        </form>
      )}

      {inventory.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "var(--fg-subtle)", padding: "8px 2px" }}>Sin stock cargado.</div>
      ) : (
        [...groups.entries()].map(([ingId, lots]) => {
          const ing = ingredientById.get(ingId);
          const total = lots.reduce((s, l) => s + l.quantity, 0);
          return (
            <InventoryGroup
              key={ingId}
              name={ing?.name ?? "—"}
              totalLabel={ing ? formatQuantity(total, ing.dimension) : String(total)}
              count={lots.length}
              lots={lots}
              presentationById={presentationById}
              ingredient={ing}
              today={today}
              warnLimit={warnLimit}
              onDelete={(id) => deleteInventory.mutate(id)}
            />
          );
        })
      )}
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
  const soonest = lots.find((l) => l.expiresOn)?.expiresOn ?? null;
  const groupWarn = soonest != null && soonest <= warnLimit;

  return (
    <div style={{ background: "var(--bg-elev)", border: `1px solid ${groupWarn ? "var(--warn)" : "var(--line)"}`, borderRadius: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", cursor: "pointer" }} onClick={() => setOpen((o) => !o)}>
        <span style={{ display: "inline-flex", transform: open ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform .15s" }}>
          <IChevD size={14} />
        </span>
        <span style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>{name}</span>
        <span style={{ fontSize: 11.5, color: "var(--fg-muted)" }}>{count} {count === 1 ? "lote" : "lotes"}</span>
        <span style={{ fontSize: 13, color: "var(--fg-muted)", fontVariantNumeric: "tabular-nums" }}>{totalLabel}</span>
      </div>
      {open && (
        <div style={{ borderTop: "1px solid var(--line)", padding: "6px 12px 10px" }}>
          {lots.map((lot) => {
            const pres = lot.presentationId ? presentationById.get(lot.presentationId) : null;
            const expSoon = lot.expiresOn != null && lot.expiresOn <= today;
            const expWarn = lot.expiresOn != null && !expSoon && lot.expiresOn <= warnLimit;
            return (
              <div key={lot.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
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
          })}
        </div>
      )}
    </div>
  );
}

// ---------------- Plan semanal ----------------

function mondayOfThisWeek(): string {
  const d = fromYmd(todayYmd());
  const dow = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - dow);
  return ymd(d);
}

function shiftWeek(weekStart: string, deltaWeeks: number): string {
  const d = fromYmd(weekStart);
  d.setDate(d.getDate() + deltaWeeks * 7);
  return ymd(d);
}

function weekLabel(weekStart: string): string {
  const [, m, d] = weekStart.split("-");
  const end = shiftWeek(weekStart, 1);
  const [, em, ed] = end.split("-");
  const endD = String(Number(ed) - 1).padStart(2, "0"); // Sunday
  return `${d}/${m} – ${endD}/${em}`;
}

const MEAL_BUCKETS: MealType[] = ["breakfast_snack", "lunch_dinner"];

function mealTargetKey(weekStart: string, bucket: MealType): string {
  return `compras:mealTarget:${weekStart}:${bucket}`;
}
function getMealTarget(weekStart: string, bucket: MealType): number {
  const v = Number(localStorage.getItem(mealTargetKey(weekStart, bucket)));
  return Number.isFinite(v) && v >= 0 ? v : 0;
}
function setMealTargetLS(weekStart: string, bucket: MealType, n: number): void {
  localStorage.setItem(mealTargetKey(weekStart, bucket), String(Math.max(0, n)));
}

function PlanPanel() {
  const [weekStart, setWeekStart] = useState(mondayOfThisWeek());
  const entriesQ = useMealPlanEntries();
  const recipesQ = useRecipes();
  const riQ = useRecipeIngredients();
  const ingredientsQ = useIngredients();
  const presentationsQ = useIngredientPresentations();
  const shoppingItemsQ = useShoppingItems();
  const inventoryQ = useInventory();
  const mealLogsQ = useMealLogs();
  const createEntry = useCreateMealPlanEntry();
  const patchEntry = usePatchMealPlanEntry();
  const deleteEntry = useDeleteMealPlanEntry();
  const createShoppingItem = useCreateShoppingItem();
  const patchShoppingItem = usePatchShoppingItem();

  const recipes = useMemo(() => recipesQ.data ?? [], [recipesQ.data]);
  const recipeById = useMemo(() => {
    const m = new Map<string, Recipe>();
    for (const r of recipes) m.set(r.id, r);
    return m;
  }, [recipes]);
  const entries = useMemo(
    () => (entriesQ.data ?? []).filter((e) => e.weekStart === weekStart),
    [entriesQ.data, weekStart],
  );

  const plannedByBucket = useMemo(() => {
    const m: Record<MealType, number> = { breakfast_snack: 0, lunch_dinner: 0 };
    for (const e of entries) {
      const r = recipeById.get(e.recipeId);
      if (r) m[r.mealType] += e.targetServings;
    }
    return m;
  }, [entries, recipeById]);

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

  const [targets, setTargets] = useState<Record<MealType, number>>({
    breakfast_snack: getMealTarget(weekStart, "breakfast_snack"),
    lunch_dinner: getMealTarget(weekStart, "lunch_dinner"),
  });
  useEffect(() => {
    setTargets({
      breakfast_snack: getMealTarget(weekStart, "breakfast_snack"),
      lunch_dinner: getMealTarget(weekStart, "lunch_dinner"),
    });
  }, [weekStart]);
  const updateTarget = (bucket: MealType, n: number) => {
    const v = Math.max(0, n);
    setMealTargetLS(weekStart, bucket, v);
    setTargets((t) => ({ ...t, [bucket]: v }));
  };

  const [recipeId, setRecipeId] = useState("");
  const [servings, setServings] = useState(2);

  const addEntry = () => {
    if (!recipeId) return;
    const add = Math.max(1, servings);
    const existing = entries.find((e) => e.recipeId === recipeId);
    if (existing) patchEntry.mutate({ id: existing.id, patch: { targetServings: existing.targetServings + add } });
    else createEntry.mutate({ weekStart, recipeId, targetServings: add });
    setRecipeId("");
    setServings(2);
  };

  const generateList = () => {
    const ris = riQ.data ?? [];
    const byRecipe = new Map<string, RecipeIngredient[]>();
    for (const ri of ris) {
      const arr = byRecipe.get(ri.recipeId) ?? [];
      arr.push(ri);
      byRecipe.set(ri.recipeId, arr);
    }
    const need = aggregateNeed(
      entries.map((e) => {
        const r = recipeById.get(e.recipeId);
        return {
          recipeIngredients: byRecipe.get(e.recipeId) ?? [],
          servings: r?.servings ?? 1,
          portions: e.targetServings,
        };
      }),
    );
    // subtract what's already at home (inventory)
    for (const row of inventoryQ.data ?? []) {
      if (need.has(row.ingredientId)) {
        need.set(row.ingredientId, Math.max(0, (need.get(row.ingredientId) ?? 0) - row.quantity));
      }
    }
    const ingredientById = new Map<string, Ingredient>();
    for (const i of ingredientsQ.data ?? []) ingredientById.set(i.id, i);
    const presentationsByIngredient = new Map<string, IngredientPresentation[]>();
    for (const p of presentationsQ.data ?? []) {
      const arr = presentationsByIngredient.get(p.ingredientId) ?? [];
      arr.push(p);
      presentationsByIngredient.set(p.ingredientId, arr);
    }
    const items = neededToShoppingItems(need, ingredientById, presentationsByIngredient);
    const current = shoppingItemsQ.data ?? [];
    for (const it of items) {
      const target = findMergeTarget(current, it);
      if (target) patchShoppingItem.mutate({ id: target.id, patch: { quantity: target.quantity + it.quantity } });
      else createShoppingItem.mutate(it);
    }
    window.alert(items.length > 0 ? `Generé ${items.length} ítem(s) en la lista (pestaña Listas).` : "El plan no tiene ingredientes para comprar.");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 720 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button className="icon-btn" title="Semana anterior" onClick={() => setWeekStart(shiftWeek(weekStart, -1))}>
          <IChevL size={15} />
        </button>
        <div style={{ fontWeight: 600, fontSize: 15, fontVariantNumeric: "tabular-nums" }}>
          Semana {weekLabel(weekStart)}
        </div>
        <button className="icon-btn" title="Semana siguiente" onClick={() => setWeekStart(shiftWeek(weekStart, 1))}>
          <IChevR size={15} />
        </button>
        {weekStart !== mondayOfThisWeek() && (
          <button className="btn ghost" style={{ fontSize: 11, padding: "3px 8px" }} onClick={() => setWeekStart(mondayOfThisWeek())}>
            Hoy
          </button>
        )}
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={generateList} disabled={entries.length === 0}>
          <IPlus size={12} /> Generar lista de compra
        </button>
      </div>

      {/* needs by meal type: planned vs target */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {MEAL_BUCKETS.map((bucket) => {
          const planned = plannedByBucket[bucket];
          const target = targets[bucket];
          const enough = target > 0 && planned >= target;
          return (
            <div
              key={bucket}
              style={{
                flex: 1,
                minWidth: 240,
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                background: "var(--bg-elev)",
                border: `1px solid ${enough ? "var(--ok)" : "var(--line)"}`,
                borderRadius: 10,
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>{MEAL_TYPE_LABELS[bucket]}</div>
                <div style={{ fontSize: 11.5, color: "var(--fg-muted)", fontVariantNumeric: "tabular-nums" }}>
                  Planeado <strong style={{ color: "var(--fg)" }}>{planned}</strong>
                  {target > 0 && ` de ${target} porciones`}
                </div>
              </div>
              <label style={{ fontSize: 11, color: "var(--fg-muted)", display: "inline-flex", alignItems: "center", gap: 6 }}>
                Necesito
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={target}
                  onChange={(e) => updateTarget(bucket, Number(e.target.value) || 0)}
                  style={{ width: 56 }}
                />
              </label>
            </div>
          );
        })}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); addEntry(); }}
        style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: 12, background: "var(--bg-elev)", border: "1px solid var(--line)", borderRadius: 10 }}
      >
        <select className="input" value={recipeId} onChange={(e) => setRecipeId(e.target.value)} style={{ flex: 1, minWidth: 180 }}>
          <option value="">Elegí una receta…</option>
          {recipes.map((r) => (
            <option key={r.id} value={r.id}>{r.name} ({MEAL_TYPE_LABELS[r.mealType]})</option>
          ))}
        </select>
        <label style={{ fontSize: 12, color: "var(--fg-muted)", display: "inline-flex", alignItems: "center", gap: 6 }}>
          Porciones
          <input className="input" type="number" min={1} value={servings} onChange={(e) => setServings(Number(e.target.value) || 1)} style={{ width: 64 }} />
        </label>
        <button className="btn" type="submit" disabled={!recipeId}><IPlus size={11} /> Agregar al plan</button>
      </form>

      {entries.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "var(--fg-subtle)", padding: "8px 2px" }}>
          Todavía no elegiste recetas para esta semana.
        </div>
      ) : (
        entries.map((e) => {
          const r = recipeById.get(e.recipeId);
          const eaten = eatenByRecipe.get(e.recipeId) ?? 0;
          const remaining = Math.max(0, e.targetServings - eaten);
          return (
            <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "var(--bg-elev)", border: "1px solid var(--line)", borderRadius: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{r?.name ?? "—"}</div>
                <div style={{ fontSize: 11.5, color: "var(--fg-muted)", fontVariantNumeric: "tabular-nums" }}>
                  Comí <strong style={{ color: "var(--fg)" }}>{eaten}</strong> · quedan{" "}
                  <strong style={{ color: remaining === 0 ? "var(--ok)" : "var(--fg)" }}>{remaining}</strong> porc.
                </div>
              </div>
              {r && <Pill tone={MEAL_TYPE_TONE[r.mealType]}>{MEAL_TYPE_LABELS[r.mealType]}</Pill>}
              <label style={{ fontSize: 12, color: "var(--fg-muted)", display: "inline-flex", alignItems: "center", gap: 6 }}>
                Plan
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={e.targetServings}
                  onChange={(ev) => patchEntry.mutate({ id: e.id, patch: { targetServings: Math.max(1, Number(ev.target.value) || 1) } })}
                  style={{ width: 60 }}
                />
              </label>
              <IconBtn title="Quitar del plan" onClick={() => deleteEntry.mutate(e.id)}>
                <IX size={11} />
              </IconBtn>
            </div>
          );
        })
      )}

      <div style={{ fontSize: 11, color: "var(--fg-subtle)" }}>
        Al generar la lista se restan los ingredientes que ya tenés en el Inventario y se eligen las presentaciones de menor desperdicio.
      </div>
    </div>
  );
}

function ListProductAdder({ onAdd }: { onAdd: (it: ShoppingItemCreate) => void }) {
  const ingredientsQ = useIngredients();
  const presentationsQ = useIngredientPresentations();
  const createIngredient = useCreateIngredient();
  const createPresentation = useCreateIngredientPresentation();

  const ingredients = useMemo(() => ingredientsQ.data ?? [], [ingredientsQ.data]);
  const presByIngredient = useMemo(() => {
    const m = new Map<string, IngredientPresentation[]>();
    for (const p of presentationsQ.data ?? []) {
      const arr = m.get(p.ingredientId) ?? [];
      arr.push(p);
      m.set(p.ingredientId, arr);
    }
    return m;
  }, [presentationsQ.data]);

  const [mode, setMode] = useState<"pick" | "new">("pick");
  const [ingredientId, setIngredientId] = useState("");
  const [presentationId, setPresentationId] = useState("");
  const [qty, setQty] = useState(1);

  const selectedIng = ingredients.find((i) => i.id === ingredientId) ?? null;
  const pres = selectedIng ? presByIngredient.get(selectedIng.id) ?? [] : [];

  const addPicked = () => {
    if (!selectedIng) return;
    const p = pres.find((x) => x.id === presentationId);
    if (!p) return;
    onAdd({
      name: `${selectedIng.name} (${p.label})`,
      quantity: Math.max(1, qty),
      ingredientId: selectedIng.id,
      presentationId: p.id,
    });
    setPresentationId("");
    setQty(1);
  };

  // new ingredient form
  const [nName, setNName] = useState("");
  const [nDim, setNDim] = useState<IngredientDimension>("count");
  const [nShelf, setNShelf] = useState("");
  const [nLabel, setNLabel] = useState("");
  const [nAmount, setNAmount] = useState("");
  const [nUnit, setNUnit] = useState("u");
  const [nPrice, setNPrice] = useState("");
  const nUnits = unitOptions(nDim);

  const createAndAdd = async () => {
    const name = nName.trim();
    const amt = parseQuantity(nAmount);
    if (!name || amt == null || amt <= 0) return;
    const ing = await createIngredient.mutateAsync({
      name,
      categoryId: null,
      dimension: nDim,
      shelfLifeDays: nShelf.trim() ? Number(nShelf) || null : null,
    });
    const unitForDim = nUnits.find((u) => u.unit === nUnit) ? nUnit : nUnits[0].unit;
    const label = nLabel.trim() || `${nAmount} ${nUnits.find((u) => u.unit === unitForDim)?.label ?? ""}`.trim();
    const p = await createPresentation.mutateAsync({
      ingredientId: ing.id,
      label,
      size: toBase(amt, unitForDim),
      price: nPrice.trim() ? parseQuantity(nPrice) : null,
    });
    onAdd({ name: `${ing.name} (${p.label})`, quantity: Math.max(1, qty), ingredientId: ing.id, presentationId: p.id });
    setNName(""); setNShelf(""); setNLabel(""); setNAmount(""); setNPrice(""); setNDim("count"); setNUnit("u");
    setMode("pick");
  };

  if (mode === "new") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, background: "var(--bg-sunken)", border: "1px solid var(--line)", borderRadius: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <strong style={{ fontSize: 12.5, flex: 1 }}>Nuevo ingrediente</strong>
          <button className="btn ghost" style={{ fontSize: 11, padding: "3px 8px" }} onClick={() => setMode("pick")}>Cancelar</button>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <input className="input" placeholder="Nombre" value={nName} onChange={(e) => setNName(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
          <select className="input" value={nDim} onChange={(e) => { setNDim(e.target.value as IngredientDimension); setNUnit(unitOptions(e.target.value as IngredientDimension)[0].unit); }}>
            <option value="count">{DIMENSION_LABELS.count}</option>
            <option value="weight">{DIMENSION_LABELS.weight}</option>
            <option value="volume">{DIMENSION_LABELS.volume}</option>
          </select>
          <input className="input" type="number" min={0} placeholder="Dura (días)" value={nShelf} onChange={(e) => setNShelf(e.target.value)} style={{ width: 100 }} />
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <input className="input" placeholder="Presentación (ej: Botella 1 L)" value={nLabel} onChange={(e) => setNLabel(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
          <input className="input" placeholder="Tamaño" value={nAmount} onChange={(e) => setNAmount(e.target.value)} style={{ width: 80 }} />
          {nUnits.length > 1 ? (
            <select className="input" value={nUnit} onChange={(e) => setNUnit(e.target.value)}>
              {nUnits.map((u) => <option key={u.unit} value={u.unit}>{u.label}</option>)}
            </select>
          ) : <span style={{ fontSize: 12, color: "var(--fg-muted)", width: 20 }}>{nUnits[0].label}</span>}
          <input className="input" placeholder="Precio (kr)" value={nPrice} onChange={(e) => setNPrice(e.target.value)} style={{ width: 90 }} />
          <button className="btn" onClick={() => void createAndAdd()} disabled={!nName.trim() || !nAmount.trim()}>
            <IPlus size={11} /> Crear y agregar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <select className="input" value={ingredientId} onChange={(e) => { setIngredientId(e.target.value); setPresentationId(""); }} style={{ flex: 1, minWidth: 150 }}>
        <option value="">Ingrediente…</option>
        {ingredients.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
      </select>
      <select className="input" value={presentationId} onChange={(e) => setPresentationId(e.target.value)} disabled={!selectedIng} style={{ minWidth: 120 }}>
        <option value="">Presentación…</option>
        {pres.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select>
      <input className="input" type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value) || 1)} style={{ width: 60 }} title="Cantidad" />
      <button className="btn" onClick={addPicked} disabled={!presentationId}><IPlus size={11} /> Agregar</button>
      <button className="btn ghost" onClick={() => setMode("new")} title="Crear un ingrediente nuevo">Nuevo</button>
    </div>
  );
}

function ListItemRow({
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
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 2px", borderBottom: "1px solid var(--line)" }}>
      <input type="checkbox" checked={item.bought} onChange={onToggle} style={{ width: 16, height: 16 }} />
      <span style={{ flex: 1, fontSize: 13, textDecoration: item.bought ? "line-through" : "none", color: item.bought ? "var(--fg-subtle)" : "var(--fg)" }}>
        {item.name}
      </span>
      {price != null && (
        <span style={{ fontSize: 12, color: "var(--fg-muted)", fontVariantNumeric: "tabular-nums", textAlign: "right" }}>
          {fmtMoney(price)}<br />
          <span style={{ fontSize: 10.5 }}>≈ {fmtUsdFromDkk(price, usdRate)}</span>
        </span>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        <button className="btn ghost" style={{ padding: "2px 7px", fontSize: 13 }} onClick={() => onSetQty(item.quantity - 1)} title="Menos">−</button>
        <input
          className="input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          inputMode="numeric"
          style={{ width: 44, textAlign: "center", padding: "3px 4px", fontVariantNumeric: "tabular-nums" }}
        />
        <button className="btn ghost" style={{ padding: "2px 7px", fontSize: 13 }} onClick={() => onSetQty(item.quantity + 1)} title="Más">+</button>
      </div>
      <IconBtn title="Eliminar" onClick={onDelete}>
        <IX size={11} />
      </IconBtn>
    </div>
  );
}
