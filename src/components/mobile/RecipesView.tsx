import { useMemo, useState } from "react";
import {
  useIngredientCategories,
  useIngredients,
  useInventory,
  useRecipeIngredients,
  useRecipes,
} from "../../lib/queries";
import { suggestRecipesForExpiringLots } from "../../lib/compras";
import { useLogMeal, defaultSlot } from "../../lib/useLogMeal";
import { todayYmd } from "../../lib/date";
import { formatQuantity } from "../../lib/units";
import type { Ingredient, IngredientCategory, MealSlot, Recipe } from "../../types";

const MEAL_TYPE_LABELS: Record<string, string> = {
  breakfast_snack: "Desayuno / Merienda",
  lunch_dinner: "Almuerzo / Cena",
};
const SLOTS: { id: MealSlot; label: string }[] = [
  { id: "desayuno", label: "Desayuno" },
  { id: "almuerzo", label: "Almuerzo" },
  { id: "merienda", label: "Merienda" },
  { id: "cena", label: "Cena" },
];

export function RecipesView() {
  const recipesQ = useRecipes();
  const riQ = useRecipeIngredients();
  const inventoryQ = useInventory();
  const ingredientsQ = useIngredients();
  const recipes = useMemo(() => recipesQ.data ?? [], [recipesQ.data]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = recipes.find((r) => r.id === selectedId) ?? null;

  const ingredientById = useMemo(() => {
    const m = new Map<string, Ingredient>();
    for (const i of ingredientsQ.data ?? []) m.set(i.id, i);
    return m;
  }, [ingredientsQ.data]);

  const suggestions = useMemo(
    () => suggestRecipesForExpiringLots(
      inventoryQ.data ?? [],
      recipesQ.data ?? [],
      riQ.data ?? [],
      5,
    ).slice(0, 3),
    [inventoryQ.data, recipesQ.data, riQ.data],
  );

  if (selected) {
    return <RecipeFollow recipe={selected} onBack={() => setSelectedId(null)} />;
  }

  return (
    <div className="m-recipes">
      {suggestions.length > 0 && (
        <div className="m-suggested">
          <div className="m-suggested-head">Te conviene cocinar</div>
          <div className="m-suggested-sub">Usá lo que vence pronto</div>
          <ul className="m-list">
            {suggestions.map((s) => {
              const names = s.matchedIngredientIds
                .map((id) => ingredientById.get(id)?.name)
                .filter((n): n is string => !!n);
              return (
                <li
                  key={s.recipe.id}
                  className="m-recipe-row is-suggested"
                  onClick={() => setSelectedId(s.recipe.id)}
                >
                  <span className="m-recipe-name">{s.recipe.name}</span>
                  <span className="m-recipe-meta">
                    Usa {names.join(", ")}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {recipes.length === 0 ? (
        <p className="m-empty">No hay recetas. Cargalas desde la versión de escritorio.</p>
      ) : (
        <ul className="m-list">
          {recipes.map((r) => (
            <li key={r.id} className={`m-recipe-row${r.mealType === "breakfast_snack" ? " is-breakfast" : ""}`} onClick={() => setSelectedId(r.id)}>
              <span className="m-recipe-name">{r.name}</span>
              <span className="m-recipe-meta">{MEAL_TYPE_LABELS[r.mealType]} · {r.servings} porc.</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RecipeFollow({ recipe, onBack }: { recipe: Recipe; onBack: () => void }) {
  const riQ = useRecipeIngredients();
  const ingredientsQ = useIngredients();
  const categoriesQ = useIngredientCategories();
  const logMeal = useLogMeal();

  const ingredientById = useMemo(() => {
    const m = new Map<string, Ingredient>();
    for (const i of ingredientsQ.data ?? []) m.set(i.id, i);
    return m;
  }, [ingredientsQ.data]);
  const categoryById = useMemo(() => {
    const m = new Map<string, IngredientCategory>();
    for (const c of categoriesQ.data ?? []) m.set(c.id, c);
    return m;
  }, [categoriesQ.data]);
  const recipeIngredients = useMemo(
    () => (riQ.data ?? []).filter((ri) => ri.recipeId === recipe.id),
    [riQ.data, recipe.id],
  );

  const [step, setStep] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const steps = recipe.steps;

  return (
    <div className="m-recipe-follow">
      <div className="m-recipe-head">
        <button className="m-back" type="button" onClick={onBack}>←</button>
        <span className="m-recipe-title">{recipe.name}</span>
      </div>

      <div className="m-recipe-ingredients">
        <div className="m-sheet-section">Ingredientes ({recipe.servings} porc.)</div>
        {recipeIngredients.length === 0 ? (
          <p className="m-empty" style={{ padding: "8px 0" }}>Sin ingredientes.</p>
        ) : (
          recipeIngredients.map((ri) => {
            const ing = ri.ingredientId ? ingredientById.get(ri.ingredientId) : undefined;
            const cat = ri.categoryId ? categoryById.get(ri.categoryId) : undefined;
            return (
              <div key={ri.id} className="m-recipe-ing">
                <span>{ing?.name ?? (cat ? `[${cat.name}]` : "—")}</span>
                <span className="m-recipe-ing-qty">{ing ? formatQuantity(ri.quantity, ing.dimension) : ri.quantity}</span>
              </div>
            );
          })
        )}
      </div>

      <div className="m-steps">
        <div className="m-sheet-section">Pasos</div>
        {steps.length === 0 ? (
          <p className="m-empty" style={{ padding: "8px 0" }}>Esta receta no tiene pasos.</p>
        ) : (
          <>
            <div className="m-step-card">
              <div className="m-step-num" data-num={step + 1}>Paso {step + 1} de {steps.length}</div>
              <div className="m-step-text">{steps[step]}</div>
            </div>
            <div className="m-step-nav">
              <button type="button" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>Anterior</button>
              <button type="button" onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))} disabled={step >= steps.length - 1}>Siguiente</button>
            </div>
          </>
        )}
      </div>

      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        style={{
          position: "fixed",
          left: 16,
          right: 16,
          bottom: "calc(env(safe-area-inset-bottom) + 72px)",
          height: 52,
          borderRadius: 12,
          border: "none",
          background: "var(--accent)",
          color: "#fff",
          fontSize: 17,
          fontWeight: 600,
          boxShadow: "var(--shadow-lg)",
          zIndex: 20,
        }}
      >
        Comí esto
      </button>

      {sheetOpen && (
        <ComiSheet recipe={recipe} onClose={() => setSheetOpen(false)} onConfirm={(cooked, eaten, slot) => {
          void logMeal(recipe, cooked, eaten, slot, todayYmd());
          setSheetOpen(false);
        }} />
      )}
    </div>
  );
}

function ComiSheet({
  recipe,
  onClose,
  onConfirm,
}: {
  recipe: Recipe;
  onClose: () => void;
  onConfirm: (cooked: number, eaten: number, slot: MealSlot) => void;
}) {
  const [cooked, setCooked] = useState(recipe.servings);
  const [eaten, setEaten] = useState(recipe.servings);
  const [slot, setSlot] = useState<MealSlot>(defaultSlot(recipe.mealType));

  return (
    <div className="m-sheet-backdrop" onClick={onClose}>
      <div className="m-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="m-sheet-head">
          <span>Registrar comida</span>
          <button className="m-sheet-close" type="button" onClick={onClose}>✕</button>
        </div>

        <label className="m-rate-row">
          Porciones que hiciste
          <input
            type="number"
            min={0}
            step="0.5"
            inputMode="decimal"
            value={cooked}
            onChange={(e) => setCooked(Math.max(0, Number(e.target.value) || 0))}
          />
        </label>
        <div style={{ fontSize: 11, color: "var(--fg-subtle)", marginTop: -4 }}>Descuenta ingredientes del inventario.</div>

        <label className="m-rate-row">
          Porciones que comiste
          <input
            type="number"
            min={0}
            step="0.5"
            inputMode="decimal"
            value={eaten}
            onChange={(e) => setEaten(Math.max(0, Number(e.target.value) || 0))}
          />
        </label>

        <div className="m-sheet-section">Comida</div>
        <div className="m-quick-chips">
          {SLOTS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`m-quick-chip${slot === s.id ? " is-active" : ""}`}
              onClick={() => setSlot(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          style={{
            width: "100%",
            height: 48,
            borderRadius: 10,
            marginTop: 4,
            border: "none",
            background: "var(--accent)",
            color: "#fff",
            fontSize: 16,
            fontWeight: 600,
          }}
          disabled={cooked <= 0 && eaten <= 0}
          onClick={() => onConfirm(cooked, eaten, slot)}
        >
          Registrar
        </button>
      </div>
    </div>
  );
}
