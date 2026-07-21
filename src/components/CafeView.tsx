import { useState } from "react";
import {
  useCoffeeBeans,
  useCoffeeRecipes,
  useCoffeeWishlistItems,
  useConsumeCoffeeBean,
  useCreateCoffeeBean,
  useCreateCoffeeRecipe,
  useCreateCoffeeWishlistItem,
  useCreateTask,
  useDeleteCoffeeBean,
  useDeleteCoffeeRecipe,
  useDeleteCoffeeWishlistItem,
  usePatchCoffeeBean,
  usePatchCoffeeRecipe,
  usePatchCoffeeWishlistItem,
  useBrewSessions,
  useDeleteBrewSession,
} from "../lib/queries";
import { addDays, fromYmd, todayYmd, ymd } from "../lib/date";
import type { CoffeeBean, CoffeeRecipe, CoffeeRecipeStep, CoffeeStepType, WaterMode, BrewSession, BrewDatapoint, CoffeeWishlistItem } from "../types";
import type { CoffeeBeanCreate, CoffeeRecipeCreate, CoffeeWishlistItemCreate } from "../lib/repo";
import { IPlus, ITrash, IChevD, IChevU, IChevR, IX } from "./icons";
import { analyzeCoffee, askAboutBrew } from "../lib/coffeeAnalysis";
import { useApp, CAFE_TABS } from "../lib/store";
import { daysOld, freshnessStatus, FRESHNESS_COLOR, FRESHNESS_LABEL } from "../lib/coffeeFreshness";
import { useFrameScale } from "../lib/uiScale";
import { fmtMoney } from "../lib/money";

// El boton "Analizar" lanza una terminal con Claude: desktop-only (en mobile no hay terminal).
const isMobile =
  /android/i.test(navigator.userAgent) ||
  new URLSearchParams(window.location.search).has("mobile");

// Fallback solo para granos creados antes de initialWeightGrams (issue: no todas
// las bolsas pesan lo mismo, no había que asumir una referencia global fija).
const REFERENCE_BAG_G = 250;
const LOW_STOCK_G = 50;

// El mockup de café (como el de Home) fue diseñado en un frame fijo de 1280×720
// pensado para 2560×1440 (2×). `fluid(n)` = "n px a esa escala": se resuelve a
// `calc(var(--s) * n px)`, donde `--s` lo pone useFrameScale() en la raíz de
// CafeView y cascadea a todo lo de abajo — igual que HomeView.tsx.
function fluid(base: number): string {
  return `calc(var(--s, 2) * ${base}px)`;
}

function fmtDmY(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

// ---------- step time helpers ----------

function fmtTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function parseMmSs(val: string): number {
  const parts = val.split(":");
  if (parts.length === 2) {
    const m = parseInt(parts[0], 10) || 0;
    const s = parseInt(parts[1], 10) || 0;
    return m * 60 + s;
  }
  return parseInt(val, 10) || 0;
}

// ---------- bean form ----------

interface BeanFormState {
  name: string;
  roaster: string;
  varietal: string;
  country: string;
  process: string;
  producer: string;
  roastedOn: string;
  weightGrams: string;
  notes: string;
  cataInicial: string;
  notaFinal: string;
}

const defaultBeanForm = (): BeanFormState => ({
  name: "", roaster: "", varietal: "", country: "",
  process: "", producer: "", roastedOn: "",
  weightGrams: "0", notes: "",
  cataInicial: "", notaFinal: "",
});

function beanFormFromBean(b: CoffeeBean): BeanFormState {
  return {
    name: b.name, roaster: b.roaster, varietal: b.varietal, country: b.country,
    process: b.process, producer: b.producer, roastedOn: b.roastedOn ?? "",
    weightGrams: String(b.weightGrams),
    notes: b.notes,
    cataInicial: b.cataInicial,
    notaFinal: b.notaFinal,
  };
}

// ---------- recipe form ----------

interface RecipeFormState {
  name: string;
  coffeeType: string;
  ratio: string;
  tempCelsius: string;
  grindSize: string;
  notes: string;
  steps: CoffeeRecipeStep[];
}

const defaultRecipeForm = (): RecipeFormState => ({
  name: "", coffeeType: "", ratio: "15", tempCelsius: "93",
  grindSize: "", notes: "", steps: [],
});

function recipeFormFromRecipe(r: CoffeeRecipe): RecipeFormState {
  return {
    name: r.name, coffeeType: r.coffeeType, ratio: String(r.ratio),
    tempCelsius: String(r.tempCelsius), grindSize: r.grindSize, notes: r.notes,
    steps: r.steps.map((s) => ({ ...s })),
  };
}

const COFFEE_TYPES = ["espresso", "v60", "chemex", "aeropress", "french press", "moka pot", "cold brew"];

function stepPct(s: CoffeeRecipeStep, ratio: number): number {
  if (s.type !== "pour" || s.waterRatio == null) return 0;
  if ((s.waterMode ?? "x_cafe") === "pct_agua") return s.waterRatio;
  return ratio > 0 ? s.waterRatio / ratio * 100 : 0;
}

function autoCompleteRatio(stepIdx: number, steps: CoffeeRecipeStep[], ratio: number): number {
  const used = steps
    .filter((s, i) => i !== stepIdx && s.type === "pour" && !s.autoComplete)
    .reduce((acc, s) => acc + stepPct(s, ratio), 0);
  return Math.max(0, 100 - used);
}

// ---------- main view ----------

type BeanEditor = { open: false } | { open: true; bean: CoffeeBean | null };
type RecipeEditor = { open: false } | { open: true; recipe: CoffeeRecipe | null };
type WishlistEditor = { open: false } | { open: true; item: CoffeeWishlistItem | null };

interface WishlistFormState {
  name: string;
  roaster: string;
  process: string;
  priceKr: string;
  notes: string;
}

const defaultWishlistForm = (): WishlistFormState => ({ name: "", roaster: "", process: "", priceKr: "", notes: "" });

function wishlistFormFromItem(w: CoffeeWishlistItem): WishlistFormState {
  return {
    name: w.name, roaster: w.roaster, process: w.process,
    priceKr: w.priceKr != null ? String(w.priceKr) : "",
    notes: w.notes,
  };
}

export function CafeView() {
  const { cafeTab: tab, setCafeTab } = useApp();
  const [beanEditor, setBeanEditor] = useState<BeanEditor>({ open: false });
  const [beanForm, setBeanForm] = useState<BeanFormState>(defaultBeanForm());
  const [recipeEditor, setRecipeEditor] = useState<RecipeEditor>({ open: false });
  const [recipeForm, setRecipeForm] = useState<RecipeFormState>(defaultRecipeForm());
  const [deleteBean, setDeleteBean] = useState<string | null>(null);
  const [deleteRecipe, setDeleteRecipe] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  // True from the moment a save starts until the REAL mutation settles — unlike
  // react-query's isPending, this isn't cleared by .reset() on a client-side
  // timeout, so the Save button stays disabled and can't fire a duplicate
  // create while the original request is still in flight in the background.
  const [beanSavePending, setBeanSavePending] = useState(false);
  const [recipeSavePending, setRecipeSavePending] = useState(false);
  const [askBrewBean, setAskBrewBean] = useState<CoffeeBean | null>(null);
  const [askBrewText, setAskBrewText] = useState("");
  const [finishingBean, setFinishingBean] = useState<CoffeeBean | null>(null);
  const [detailBeanId, setDetailBeanId] = useState<string | null>(null);
  const [wishlistEditor, setWishlistEditor] = useState<WishlistEditor>({ open: false });
  const [wishlistForm, setWishlistForm] = useState<WishlistFormState>(defaultWishlistForm());
  const [deleteWishlistItem, setDeleteWishlistItem] = useState<string | null>(null);
  const [wishlistSavePending, setWishlistSavePending] = useState(false);

  const beansQ = useCoffeeBeans();
  const recipesQ = useCoffeeRecipes();
  const sessionsQ = useBrewSessions();
  const wishlistQ = useCoffeeWishlistItems();
  const createBean = useCreateCoffeeBean();
  const patchBean = usePatchCoffeeBean();
  const consumeBean = useConsumeCoffeeBean();
  const deleteB = useDeleteCoffeeBean();
  const createRecipe = useCreateCoffeeRecipe();
  const patchRecipe = usePatchCoffeeRecipe();
  const deleteR = useDeleteCoffeeRecipe();
  const createTask = useCreateTask();
  const createWishlistItem = useCreateCoffeeWishlistItem();
  const patchWishlistItem = usePatchCoffeeWishlistItem();
  const deleteWishlistItemM = useDeleteCoffeeWishlistItem();

  const beans = beansQ.data ?? [];
  const recipes = recipesQ.data ?? [];
  const sessions = sessionsQ.data ?? [];
  const wishlistItems = wishlistQ.data ?? [];
  const detailBean = detailBeanId ? beans.find((b) => b.id === detailBeanId) ?? null : null;

  // ---- bean actions ----
  function openCreateBean() { setBeanForm(defaultBeanForm()); setBeanEditor({ open: true, bean: null }); }
  function openEditBean(b: CoffeeBean) { setBeanForm(beanFormFromBean(b)); setBeanEditor({ open: true, bean: b }); }

  async function saveBean() {
    setSaveError(null);
    const payload: CoffeeBeanCreate = {
      name: beanForm.name.trim(),
      roaster: beanForm.roaster.trim(),
      varietal: beanForm.varietal.trim(),
      country: beanForm.country.trim(),
      process: beanForm.process.trim(),
      producer: beanForm.producer.trim(),
      roastedOn: beanForm.roastedOn || null,
      weightGrams: parseFloat(beanForm.weightGrams) || 0,
      notes: beanForm.notes.trim(),
      cataInicial: beanForm.cataInicial.trim(),
      notaFinal: beanForm.notaFinal.trim(),
    };
    if (!payload.name) return;
    if (beanSavePending) return; // a real save is still in flight — never fire a second one
    const timeout = new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error("Sigue guardando en segundo plano — esperá antes de reintentar")), 10_000)
    );
    const isEdit = beanEditor.open && beanEditor.bean !== null;
    setBeanSavePending(true);
    const real = isEdit && beanEditor.open && beanEditor.bean
      ? patchBean.mutateAsync({ id: beanEditor.bean.id, patch: payload })
      : createBean.mutateAsync(payload);
    void real
      .then(() => {
        // Succeeded — even if this resolves after the timeout branch already
        // reported an error below, make sure the UI reflects the real outcome.
        setBeanEditor({ open: false });
        setSaveError(null);
      })
      .catch(() => {
        // Real failure. If the timeout already surfaced an error this is a
        // no-op; if the timeout hasn't fired yet, the catch below handles it.
      })
      .finally(() => setBeanSavePending(false));
    try {
      await Promise.race([real, timeout]);
      setBeanEditor({ open: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("saveBean failed:", err);
      setSaveError(msg);
    }
  }

  async function createOrderTask(b: CoffeeBean) {
    const tomorrow = ymd(addDays(fromYmd(todayYmd()), 1));
    await createTask.mutateAsync({
      title: `Pedir café: ${b.name}${b.roaster ? ` (${b.roaster})` : ""}`,
      projectId: null, categoryId: null, priority: "med", duration: 5,
      day: tomorrow, due: null, recurring: false, recurrence: null,
      recurrenceParentId: null, notes: "", subtasks: [],
    });
  }

  // ---- recipe actions ----
  function openCreateRecipe() { setRecipeForm(defaultRecipeForm()); setRecipeEditor({ open: true, recipe: null }); }
  function openEditRecipe(r: CoffeeRecipe) { setRecipeForm(recipeFormFromRecipe(r)); setRecipeEditor({ open: true, recipe: r }); }

  async function saveRecipe() {
    setSaveError(null);
    const payload: CoffeeRecipeCreate = {
      name: recipeForm.name.trim(),
      coffeeType: recipeForm.coffeeType.trim(),
      ratio: parseFloat(recipeForm.ratio) || 15,
      tempCelsius: parseFloat(recipeForm.tempCelsius) || 93,
      grindSize: recipeForm.grindSize.trim(),
      steps: recipeForm.steps.map((s, i) => {
        if (!s.autoComplete || s.type !== "pour") return s;
        return { ...s, waterRatio: Math.round(autoCompleteRatio(i, recipeForm.steps, parseFloat(recipeForm.ratio) || 15)) };
      }),
      notes: recipeForm.notes.trim(),
    };
    if (!payload.name) return;
    if (recipeSavePending) return; // a real save is still in flight — never fire a second one
    const timeout = new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error("Sigue guardando en segundo plano — esperá antes de reintentar")), 10_000)
    );
    const isEdit = recipeEditor.open && recipeEditor.recipe !== null;
    setRecipeSavePending(true);
    const real = isEdit && recipeEditor.open && recipeEditor.recipe
      ? patchRecipe.mutateAsync({ id: recipeEditor.recipe.id, patch: payload })
      : createRecipe.mutateAsync(payload);
    void real
      .then(() => {
        setRecipeEditor({ open: false });
        setSaveError(null);
      })
      .catch(() => {})
      .finally(() => setRecipeSavePending(false));
    try {
      await Promise.race([real, timeout]);
      setRecipeEditor({ open: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("saveRecipe failed:", err);
      setSaveError(msg);
    }
  }

  // ---- wishlist actions ----
  function openCreateWishlistItem() { setWishlistForm(defaultWishlistForm()); setWishlistEditor({ open: true, item: null }); }
  function openEditWishlistItem(w: CoffeeWishlistItem) { setWishlistForm(wishlistFormFromItem(w)); setWishlistEditor({ open: true, item: w }); }

  async function saveWishlistItem() {
    setSaveError(null);
    const priceKr = wishlistForm.priceKr.trim() ? parseFloat(wishlistForm.priceKr.replace(",", ".")) : null;
    const payload: CoffeeWishlistItemCreate = {
      name: wishlistForm.name.trim(),
      roaster: wishlistForm.roaster.trim(),
      process: wishlistForm.process.trim(),
      priceKr: priceKr != null && Number.isFinite(priceKr) ? priceKr : null,
      notes: wishlistForm.notes.trim(),
    };
    if (!payload.name) return;
    if (wishlistSavePending) return; // a real save is still in flight — never fire a second one
    const timeout = new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error("Sigue guardando en segundo plano — esperá antes de reintentar")), 10_000)
    );
    const isEdit = wishlistEditor.open && wishlistEditor.item !== null;
    setWishlistSavePending(true);
    const real = isEdit && wishlistEditor.open && wishlistEditor.item
      ? patchWishlistItem.mutateAsync({ id: wishlistEditor.item.id, patch: payload })
      : createWishlistItem.mutateAsync(payload);
    void real
      .then(() => {
        setWishlistEditor({ open: false });
        setSaveError(null);
      })
      .catch(() => {})
      .finally(() => setWishlistSavePending(false));
    try {
      await Promise.race([real, timeout]);
      setWishlistEditor({ open: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("saveWishlistItem failed:", err);
      setSaveError(msg);
    }
  }

  async function comprarWishlistItem(w: CoffeeWishlistItem) {
    const inp = window.prompt(`Registrar "${w.name}" en el inventario. Gramos de la bolsa:`, "250");
    if (inp == null) return;
    const g = parseFloat(inp.replace(",", "."));
    if (!Number.isFinite(g) || g <= 0) return;
    await createBean.mutateAsync({
      name: w.name, roaster: w.roaster, process: w.process, weightGrams: g,
    });
    await deleteWishlistItemM.mutateAsync(w.id);
  }

  const s = useFrameScale();

  return (
    <div
      style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden", ["--s" as string]: s } as React.CSSProperties}
    >
      {/* Header + tabs */}
      <div style={{ padding: `${fluid(20)} ${fluid(20)} 0`, borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: fluid(12), marginBottom: fluid(10) }}>
          <span style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: fluid(38), height: fluid(38), borderRadius: fluid(9), fontSize: fluid(19),
            color: "var(--c-peach-fg)", background: "var(--c-peach)", flexShrink: 0,
          }}>☕</span>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: fluid(22), fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.15 }}>Café</h2>
            <div style={{ fontSize: fluid(13), color: "var(--fg-muted)", marginTop: 2 }}>
              Tu bodega de granos, deseados y consumo
            </div>
          </div>
          {tab !== "historial" && (
            <button
              className="btn primary"
              style={{ display: "flex", alignItems: "center", gap: 4, fontSize: fluid(12.5), padding: `${fluid(7)} ${fluid(12)}` }}
              onClick={tab === "inventario" ? openCreateBean : openCreateRecipe}
            >
              <IPlus size={13} /> {tab === "inventario" ? "Agregar grano" : "Nueva receta"}
            </button>
          )}
        </div>

        {/* Inventario / Historial / Recetas — folder tabs, como en el mockup */}
        <div style={{ display: "flex", gap: fluid(2), alignItems: "flex-end" }}>
          {CAFE_TABS.map((t) => {
            const active = tab === t.id;
            return (
              <div
                key={t.id}
                role="button"
                onClick={() => setCafeTab(t.id)}
                style={{
                  padding: `${fluid(9)} ${fluid(16)}`, borderRadius: `${fluid(9)} ${fluid(9)} 0 0`,
                  fontSize: fluid(13), fontWeight: 600, cursor: "pointer",
                  display: "inline-flex", alignItems: "center", gap: fluid(7),
                  marginBottom: -1, border: "1px solid transparent", borderBottom: "none",
                  background: active ? "var(--bg-sunken)" : "transparent",
                  color: active ? "var(--fg)" : "var(--fg-muted)",
                  borderColor: active ? "var(--line)" : "transparent",
                }}
              >
                <span
                  aria-hidden
                  style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    width: fluid(16), height: fluid(16), fontSize: fluid(14), lineHeight: 1,
                  }}
                >
                  {t.icon}
                </span>
                {t.label}
              </div>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: `${fluid(16)} ${fluid(20)} ${fluid(24)}` }}>
        {tab === "inventario" && (
          <InventarioTab
            beans={beans}
            sessions={sessions}
            wishlistItems={wishlistItems}
            onOpenDetail={(b) => setDetailBeanId(b.id)}
            onMarkFinished={(b) => setFinishingBean(b)}
            onCreateWishlistItem={openCreateWishlistItem}
            onEditWishlistItem={openEditWishlistItem}
            onDeleteWishlistItem={setDeleteWishlistItem}
            onComprarWishlistItem={(w) => void comprarWishlistItem(w)}
          />
        )}
        {tab === "recetas" && (
          <RecetasTab
            recipes={recipes.filter((r) => !r.baseRecipeId)}
            sessions={sessions}
            onEdit={openEditRecipe}
            onDeleteRequest={setDeleteRecipe}
          />
        )}
        {tab === "historial" && (
          <HistorialTab beans={beans} sessions={sessions} onOpenDetail={(b) => setDetailBeanId(b.id)} />
        )}
      </div>

      {/* Bean detail drawer */}
      {detailBean && (
        <BeanDetailDrawer
          bean={detailBean}
          sessions={sessions.filter((s) => s.beanId === detailBean.id)}
          onClose={() => setDetailBeanId(null)}
          onEdit={openEditBean}
          onDeleteRequest={setDeleteBean}
          onCreateTask={(b) => void createOrderTask(b)}
          onMarkFinished={(b) => setFinishingBean(b)}
          onConsume={(b) => {
            const inp = window.prompt(`Cuantos gramos usaste de "${b.name}"? (quedan ${b.weightGrams}g)`, "");
            if (inp == null) return;
            const g = parseFloat(inp.replace(",", "."));
            if (!Number.isFinite(g) || g <= 0) return;
            consumeBean.mutate({ id: b.id, grams: g });
          }}
          onReactivate={(b) => {
            const inp = window.prompt(`Reactivar "${b.name}". Gramos de stock nuevo:`, "250");
            if (inp == null) return;
            const g = parseFloat(inp.replace(",", "."));
            const newWeight = Number.isFinite(g) && g > 0 ? g : b.weightGrams;
            // Reactivar reinicia el descanso: cuenta desde hoy, no desde el tueste original.
            // También resetea initialWeightGrams — es una bolsa nueva, no la misma.
            patchBean.mutate({ id: b.id, patch: { finishedAt: null, roastedOn: todayYmd(), weightGrams: newWeight, initialWeightGrams: newWeight } });
          }}
          onAnalizar={(b) => {
            analyzeCoffee(b).catch((err) => {
              console.error("[CafeView] analyzeCoffee failed:", err);
              window.alert(`No se pudo lanzar el analisis: ${err instanceof Error ? err.message : String(err)}`);
            });
          }}
          onAskAboutBrew={(b) => { setAskBrewText(""); setAskBrewBean(b); }}
        />
      )}

      {/* Bean editor */}
      {beanEditor.open && (
        <BeanModal
          form={beanForm}
          isEdit={beanEditor.bean !== null}
          saving={beanSavePending}
          error={saveError}
          onChange={(k, v) => setBeanForm((p) => ({ ...p, [k]: v }))}
          onSave={() => void saveBean()}
          onClose={() => { setBeanEditor({ open: false }); setSaveError(null); }}
        />
      )}

      {/* Recipe editor */}
      {recipeEditor.open && (
        <RecipeModal
          form={recipeForm}
          isEdit={recipeEditor.recipe !== null}
          saving={recipeSavePending}
          error={saveError}
          onChange={(k, v) => setRecipeForm((p) => ({ ...p, [k]: v }))}
          onStepsChange={(steps) => setRecipeForm((p) => ({ ...p, steps }))}
          onSave={() => void saveRecipe()}
          onClose={() => { setRecipeEditor({ open: false }); setSaveError(null); }}
        />
      )}

      {/* Wishlist editor */}
      {wishlistEditor.open && (
        <WishlistModal
          form={wishlistForm}
          isEdit={wishlistEditor.item !== null}
          saving={wishlistSavePending}
          error={saveError}
          onChange={(k, v) => setWishlistForm((p) => ({ ...p, [k]: v }))}
          onSave={() => void saveWishlistItem()}
          onClose={() => { setWishlistEditor({ open: false }); setSaveError(null); }}
        />
      )}

      {/* Fase 7c: preguntarle a Claude sobre un brew que no salio bien */}
      {askBrewBean && (
        <Modal title={`Preguntar sobre "${askBrewBean.name}"`} onClose={() => setAskBrewBean(null)}>
          <Field label="¿Qué salió mal? (amargo, plano, muy ácido...)">
            <textarea
              className="input"
              rows={4}
              autoFocus
              value={askBrewText}
              onChange={(e) => setAskBrewText(e.target.value)}
              placeholder="Ej: salió muy amargo y con poco cuerpo"
            />
          </Field>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button className="btn" onClick={() => setAskBrewBean(null)}>Cancelar</button>
            <button
              className="btn primary"
              disabled={!askBrewText.trim()}
              onClick={() => {
                const bean = askBrewBean;
                const bs = sessions.filter((s) => s.beanId === bean.id);
                const lastBrew = bs.length === 0 ? null : bs.reduce((a, s) => (s.createdAt > a.createdAt ? s : a));
                askAboutBrew(bean, lastBrew, askBrewText.trim()).catch((err) => {
                  console.error("[CafeView] askAboutBrew failed:", err);
                  window.alert(`No se pudo lanzar la consulta: ${err instanceof Error ? err.message : String(err)}`);
                });
                setAskBrewBean(null);
              }}
            >
              Preguntarle a Claude
            </button>
          </div>
        </Modal>
      )}

      {/* Marcar terminado: pedir puntaje + tags de sabor antes de archivar (issue #10) */}
      {finishingBean && (
        <FinishBeanModal
          bean={finishingBean}
          onClose={() => setFinishingBean(null)}
          onConfirm={async (rating, flavorTags) => {
            await patchBean.mutateAsync({
              id: finishingBean.id,
              patch: { finishedAt: new Date().toISOString(), rating, flavorTags },
            });
          }}
        />
      )}

      {/* Delete confirms */}
      {deleteBean && (
        <ConfirmModal
          text="¿Eliminar este grano?"
          onConfirm={() => { void deleteB.mutateAsync(deleteBean); setDeleteBean(null); setDetailBeanId(null); }}
          onCancel={() => setDeleteBean(null)}
        />
      )}
      {deleteRecipe && (
        <ConfirmModal
          text="¿Eliminar esta receta?"
          onConfirm={() => { void deleteR.mutateAsync(deleteRecipe); setDeleteRecipe(null); }}
          onCancel={() => setDeleteRecipe(null)}
        />
      )}
      {deleteWishlistItem && (
        <ConfirmModal
          text="¿Eliminar este grano de la lista de deseados?"
          onConfirm={() => { void deleteWishlistItemM.mutateAsync(deleteWishlistItem); setDeleteWishlistItem(null); }}
          onCancel={() => setDeleteWishlistItem(null)}
        />
      )}
    </div>
  );
}

// ---------- Brew Historial ----------

const SESSION_COLORS = [
  "#4caf50", "#2196f3", "#ff9800", "#e91e63",
  "#9c27b0", "#00bcd4", "#ff5722", "#607d8b",
];

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function BrewOverlayChart({
  sessions,
  dataBySession,
  maxWeight,
  maxFlow,
  maxTimeSec,
}: {
  sessions: BrewSession[];
  dataBySession: Record<string, BrewDatapoint[]>;
  maxWeight: number;
  maxFlow: number;
  maxTimeSec: number;
}) {
  const W = 480, H = 200, PAD = { t: 10, r: 34, b: 30, l: 40 };
  const cw = W - PAD.l - PAD.r;
  const ch = H - PAD.t - PAD.b;

  const xScale = (ms: number) => PAD.l + (ms / 1000 / Math.max(maxTimeSec, 1)) * cw;
  const yScale = (g: number) => PAD.t + ch - (g / Math.max(maxWeight, 1)) * ch;
  const yScaleFlow = (f: number) => PAD.t + ch - (f / Math.max(maxFlow, 1)) * ch;

  // Y axis ticks (peso, izquierda)
  const yTicks = [0, 25, 50, 75, 100].map(pct => maxWeight * pct / 100).filter(v => v > 0);
  // Y axis ticks (flow, derecha)
  const yTicksFlow = [0, 50, 100].map(pct => maxFlow * pct / 100).filter(v => v > 0);
  // X axis ticks (every 30s)
  const xTicks: number[] = [];
  for (let t = 0; t <= maxTimeSec; t += 30) xTicks.push(t);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
      {/* grid lines */}
      {yTicks.map((v) => (
        <line key={v} x1={PAD.l} y1={yScale(v)} x2={W - PAD.r} y2={yScale(v)}
          stroke="var(--line)" strokeWidth={0.5} strokeDasharray="3,3" />
      ))}
      {xTicks.map((t) => (
        <line key={t} x1={xScale(t * 1000)} y1={PAD.t} x2={xScale(t * 1000)} y2={H - PAD.b}
          stroke="var(--line)" strokeWidth={0.5} strokeDasharray="3,3" />
      ))}

      {/* flow lines (punteadas, eje derecho) */}
      {sessions.map((s, i) => {
        const pts = dataBySession[s.id];
        if (!pts || pts.length === 0) return null;
        const d = pts
          .map((p, j) => `${j === 0 ? "M" : "L"}${xScale(p.timerMs).toFixed(1)},${yScaleFlow(p.flowGs ?? 0).toFixed(1)}`)
          .join(" ");
        return (
          <path key={`flow-${s.id}`} d={d} fill="none"
            stroke={SESSION_COLORS[i % SESSION_COLORS.length]}
            strokeWidth={1} strokeOpacity={0.55} strokeDasharray="2,2"
            strokeLinejoin="round" strokeLinecap="round" />
        );
      })}

      {/* weight lines (solidas, eje izquierdo) */}
      {sessions.map((s, i) => {
        const pts = dataBySession[s.id];
        if (!pts || pts.length === 0) return null;
        const d = pts
          .map((p, j) => `${j === 0 ? "M" : "L"}${xScale(p.timerMs).toFixed(1)},${yScale(p.weightG ?? 0).toFixed(1)}`)
          .join(" ");
        return (
          <path key={s.id} d={d} fill="none"
            stroke={SESSION_COLORS[i % SESSION_COLORS.length]}
            strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
        );
      })}

      {/* Y axis (peso, izq) */}
      <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={H - PAD.b} stroke="var(--fg-subtle)" strokeWidth={1} />
      {yTicks.map((v) => (
        <text key={v} x={PAD.l - 4} y={yScale(v)} textAnchor="end" dominantBaseline="middle"
          fontSize={8} fill="var(--fg-muted)">{v.toFixed(0)}</text>
      ))}
      <text x={PAD.l - 4} y={PAD.t} textAnchor="end" fontSize={7} fill="var(--fg-subtle)">g</text>

      {/* Y axis (flow, der) */}
      <line x1={W - PAD.r} y1={PAD.t} x2={W - PAD.r} y2={H - PAD.b} stroke="var(--fg-subtle)" strokeWidth={1} strokeOpacity={0.5} />
      {yTicksFlow.map((v) => (
        <text key={v} x={W - PAD.r + 4} y={yScaleFlow(v)} textAnchor="start" dominantBaseline="middle"
          fontSize={8} fill="var(--fg-muted)">{v.toFixed(1)}</text>
      ))}
      <text x={W - PAD.r + 4} y={PAD.t} textAnchor="start" fontSize={7} fill="var(--fg-subtle)">g/s</text>

      {/* X axis */}
      <line x1={PAD.l} y1={H - PAD.b} x2={W - PAD.r} y2={H - PAD.b} stroke="var(--fg-subtle)" strokeWidth={1} />
      {xTicks.map((t) => (
        <text key={t} x={xScale(t * 1000)} y={H - PAD.b + 10} textAnchor="middle"
          fontSize={8} fill="var(--fg-muted)">{`${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`}</text>
      ))}

      {/* leyenda */}
      <line x1={PAD.l} y1={H - 4} x2={PAD.l + 14} y2={H - 4} stroke="var(--fg-muted)" strokeWidth={1.5} />
      <text x={PAD.l + 18} y={H - 4} dominantBaseline="middle" fontSize={7} fill="var(--fg-muted)">peso</text>
      <line x1={PAD.l + 50} y1={H - 4} x2={PAD.l + 64} y2={H - 4} stroke="var(--fg-muted)" strokeWidth={1} strokeDasharray="2,2" />
      <text x={PAD.l + 68} y={H - 4} dominantBaseline="middle" fontSize={7} fill="var(--fg-muted)">flow</text>
    </svg>
  );
}

/** Historial tab: stat tiles, timeline de granos (Registro) y — abajo, colapsado —
 *  la comparación de pours agrupados por receta que ya existía. */
function HistorialTab({
  beans, sessions, onOpenDetail,
}: {
  beans: CoffeeBean[];
  sessions: BrewSession[];
  onOpenDetail: (b: CoffeeBean) => void;
}) {
  const [showCompare, setShowCompare] = useState(false);

  const brewCountByBean = new Map<string, number>();
  sessions.forEach((s) => { if (s.beanId) brewCountByBean.set(s.beanId, (brewCountByBean.get(s.beanId) ?? 0) + 1); });

  const nameCounts = new Map<string, number>();
  sessions.forEach((s) => {
    const n = s.beanName.trim();
    if (n) nameCounts.set(n, (nameCounts.get(n) ?? 0) + 1);
  });
  let topBean: { name: string; count: number } | null = null;
  for (const [name, count] of nameCounts) {
    if (!topBean || count > topBean.count) topBean = { name, count };
  }

  const entries = beans
    .map((b) => ({
      bean: b,
      finished: !!b.finishedAt,
      date: b.finishedAt ?? b.createdAt,
      brews: brewCountByBean.get(b.id) ?? 0,
    }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: fluid(18) }}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${fluid(200)}, 1fr))`, gap: fluid(14) }}>
        <PlaceholderStatTile label="Consumido este año" />
        <PlaceholderStatTile label="Gastado en café" />
        <div style={{ background: "var(--bg-elev)", border: "1px solid var(--line)", borderRadius: fluid(13), padding: fluid(16), boxShadow: "var(--shadow-sm)" }}>
          <div style={{ fontSize: fluid(16), fontWeight: 600, letterSpacing: "-0.01em" }}>{topBean ? topBean.name : "—"}</div>
          <div style={{ fontSize: fluid(11.5), color: "var(--fg-subtle)", marginTop: fluid(2) }}>
            {topBean ? `Tu grano más repetido (×${topBean.count})` : "Sin brews registrados aún"}
          </div>
        </div>
      </div>

      <div style={{ fontSize: fluid(11), textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700, color: "var(--fg-muted)" }}>
        Registro
      </div>

      {entries.length === 0 ? (
        <div style={{ fontSize: fluid(13), color: "var(--fg-muted)" }}>Sin granos registrados todavía.</div>
      ) : (
        <div style={{ background: "var(--bg-elev)", border: "1px solid var(--line)", borderRadius: fluid(13), boxShadow: "var(--shadow-sm)", overflow: "hidden" }}>
          {entries.map(({ bean: b, finished, date, brews }, i) => (
            <div
              key={b.id}
              role="button"
              onClick={() => onOpenDetail(b)}
              style={{
                display: "flex", alignItems: "center", gap: fluid(12), padding: `${fluid(13)} ${fluid(16)}`, cursor: "pointer",
                borderBottom: i < entries.length - 1 ? "1px solid var(--line)" : "none",
              }}
            >
              <div style={{
                width: fluid(30), height: fluid(30), borderRadius: fluid(8), flexShrink: 0, fontSize: fluid(15),
                display: "grid", placeItems: "center",
                background: finished ? "color-mix(in oklch, var(--danger) 10%, var(--bg))" : "color-mix(in oklch, var(--c-peach-fg) 12%, var(--bg))",
              }}>
                {finished ? "☕" : "🛒"}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: fluid(13), fontWeight: 600 }}>{b.name}</div>
                <div style={{ fontSize: fluid(11.5), color: "var(--fg-subtle)" }}>
                  {finished
                    ? `Terminado · duró ${weeksBetween(b.createdAt, b.finishedAt!)} semanas · ${brews} brew${brews !== 1 ? "s" : ""}`
                    : `Activo · ${b.roaster || "sin tostador"} · ${brews} brew${brews !== 1 ? "s" : ""}`}
                </div>
              </div>
              <span style={{ fontSize: fluid(11.5), color: "var(--fg-subtle)", fontVariantNumeric: "tabular-nums" }}>{fmtDmY(date.slice(0, 10))}</span>
              <IChevR size={15} />
            </div>
          ))}
        </div>
      )}

      <button
        className="btn ghost"
        style={{ alignSelf: "flex-start", fontSize: fluid(12), padding: `${fluid(4)} ${fluid(8)}` }}
        onClick={() => setShowCompare((v) => !v)}
      >
        {showCompare ? "▾" : "▸"} Comparar pours por receta
      </button>
      {showCompare && <BrewCompareByRecipe sessions={sessions} />}
    </div>
  );
}

function weeksBetween(startIso: string, endIso: string): number {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  return Math.max(0, Math.round(ms / (7 * 86_400_000)));
}

function PlaceholderStatTile({ label }: { label: string }) {
  return (
    <div style={{ background: "var(--bg-elev)", border: "1px dashed var(--line-strong)", borderRadius: fluid(13), padding: fluid(16), opacity: 0.65 }}>
      <div style={{ fontSize: fluid(26), fontWeight: 600, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums", color: "var(--fg-subtle)" }}>—</div>
      <div style={{ fontSize: fluid(11.5), color: "var(--fg-subtle)", marginTop: fluid(2) }}>{label} · próximamente</div>
    </div>
  );
}

/** La vista anterior de Historial: sesiones agrupadas por nombre de receta,
 *  con comparación de curvas peso/flujo superpuestas. Se conserva completa,
 *  ahora colapsada debajo del Registro por grano. */
function BrewCompareByRecipe({ sessions }: { sessions: BrewSession[] }) {
  const deleteSession = useDeleteBrewSession();
  const [viewingSessions, setViewingSessions] = useState<BrewSession[] | null>(null);
  const [chartSessionIds, setChartSessionIds] = useState<string[]>([]);

  // load datapoints for chart sessions
  const [chartData, setChartData] = useState<Record<string, BrewDatapoint[]>>({});

  async function openChart(ids: string[]) {
    setChartSessionIds(ids);
    const { repo } = await import("../lib/repo");
    const entries = await Promise.all(ids.map(async (id) => [id, await repo.getBrewDatapoints(id)] as const));
    setChartData(Object.fromEntries(entries));
  }

  // group sessions by recipe NAME. Las recetas especificas por grano comparten el nombre de la
  // receta base (ej. dos "Tetsu 4:6" para distintos granos = dos recipe_id distintos). Agrupar por
  // NOMBRE garantiza que la misma receta no aparezca repetida en el historial, sin depender de
  // resolver la receta base via otra query.
  const byRecipe = sessions.reduce<Record<string, BrewSession[]>>((acc, s) => {
    const key = (s.recipeName || "").trim() || "__none__";
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {});

  const recipeGroups = Object.entries(byRecipe).map(([rid, ss]) => ({
    recipeId: rid === "__none__" ? null : rid,
    recipeName: ss[0]?.recipeName || "Sin receta",
    sessions: ss,
  }));

  const chartSessions = viewingSessions?.filter(s => chartSessionIds.includes(s.id)) ?? [];
  const allPoints = Object.values(chartData).flat();
  const maxWeight = Math.max(...allPoints.map(p => p.weightG ?? 0), 10);
  const maxFlow = Math.max(...allPoints.map(p => p.flowGs ?? 0), 1);
  const maxTimeSec = Math.max(...allPoints.map(p => p.timerMs / 1000), 60);

  if (chartSessionIds.length > 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button className="btn ghost" style={{ fontSize: 12 }}
            onClick={() => { setChartSessionIds([]); setChartData({}); }}>← Volver</button>
          <span style={{ fontSize: 14, fontWeight: 600 }}>
            Comparación — {viewingSessions?.[0]?.recipeName}
          </span>
        </div>

        <BrewOverlayChart
          sessions={chartSessions}
          dataBySession={chartData}
          maxWeight={maxWeight}
          maxFlow={maxFlow}
          maxTimeSec={maxTimeSec}
        />

        {/* legend */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {chartSessions.map((s, i) => (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}>
              <span style={{ width: 12, height: 3, background: SESSION_COLORS[i % SESSION_COLORS.length], display: "inline-block", borderRadius: 2 }} />
              <span style={{ color: "var(--fg-muted)" }}>{fmtDate(s.createdAt)}</span>
              <span>· {s.doseGrams.toFixed(1)}g · {fmtDuration(s.durationMs)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (viewingSessions) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button className="btn ghost" style={{ fontSize: 12 }}
            onClick={() => setViewingSessions(null)}>← Todas</button>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{viewingSessions[0]?.recipeName}</span>
        </div>

        {viewingSessions.length >= 2 && (
          <button className="btn primary" style={{ fontSize: 12, padding: "8px 14px", alignSelf: "flex-start" }}
            onClick={() => void openChart(viewingSessions.map(s => s.id))}>
            Comparar pours ({viewingSessions.length} sesiones)
          </button>
        )}

        {viewingSessions.map((s, i) => (
          <div key={s.id} style={{
            background: "var(--bg-sunken)", borderRadius: 10, padding: "12px 14px",
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: SESSION_COLORS[i % SESSION_COLORS.length], display: "inline-block" }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{fmtDate(s.createdAt)}</div>
                <div style={{ fontSize: 11, color: "var(--fg-muted)" }}>
                  Dosis: {s.doseGrams.toFixed(1)} g · Agua: {s.totalWaterGrams.toFixed(0)} g · {fmtDuration(s.durationMs)}
                  {s.beanName && ` · ${s.beanName}`}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn ghost" style={{ fontSize: 11, padding: "4px 8px" }}
                onClick={() => void openChart([s.id])}>Ver</button>
              <button className="btn ghost" style={{ fontSize: 11, padding: "4px 8px", color: "var(--danger)" }}
                onClick={() => deleteSession.mutate(s.id)}>
                <ITrash size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {sessions.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 0", color: "var(--fg-subtle)", fontSize: 14, lineHeight: 1.7 }}>
          No hay brews registrados todavía.<br />
          Usá el tab Café en la app mobile para iniciar un brew.
        </div>
      )}

      {recipeGroups.map(({ recipeId, recipeName, sessions: ss }) => (
        <button key={recipeId ?? "__none__"} className="btn"
          style={{ textAlign: "left", padding: "12px 14px", fontSize: 14 }}
          onClick={() => { setViewingSessions(ss); }}>
          <div style={{ fontWeight: 600 }}>{recipeName}</div>
          <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 2 }}>
            {ss.length} brew{ss.length !== 1 ? "s" : ""} · Último: {fmtDate(ss[0]?.createdAt ?? "")}
          </div>
        </button>
      ))}
    </div>
  );
}

// ---------- Inventario tab ----------

function InventarioTab({
  beans, sessions, wishlistItems, onOpenDetail, onMarkFinished,
  onCreateWishlistItem, onEditWishlistItem, onDeleteWishlistItem, onComprarWishlistItem,
}: {
  beans: CoffeeBean[];
  sessions: BrewSession[];
  wishlistItems: CoffeeWishlistItem[];
  onOpenDetail: (b: CoffeeBean) => void;
  onMarkFinished: (b: CoffeeBean) => void;
  onCreateWishlistItem: () => void;
  onEditWishlistItem: (w: CoffeeWishlistItem) => void;
  onDeleteWishlistItem: (id: string) => void;
  onComprarWishlistItem: (w: CoffeeWishlistItem) => void;
}) {
  const active = beans.filter((b) => !b.finishedAt);
  const finished = beans.filter((b) => b.finishedAt);
  const [showFinished, setShowFinished] = useState(false);
  const lowStock = active.filter((b) => b.weightGrams > 0 && b.weightGrams <= LOW_STOCK_G);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: fluid(18) }}>
      {beans.length === 0 ? (
        <div style={{ textAlign: "center", padding: `${fluid(40)} ${fluid(20)}`, color: "var(--fg-muted)" }}>
          <div style={{ fontSize: fluid(32), marginBottom: fluid(12), opacity: 0.4 }}>☕</div>
          <p style={{ margin: `0 0 ${fluid(6)}`, fontSize: fluid(14), fontWeight: 500, color: "var(--fg)" }}>Sin granos registrados</p>
          <p style={{ margin: 0, fontSize: fluid(13) }}>Registrá tus bolsas de café para trackear frescura y cantidad.</p>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: fluid(10) }}>
            <div style={{ fontSize: fluid(11), textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700, color: "var(--fg-muted)", flex: 1 }}>
              En casa · {active.length} grano{active.length !== 1 ? "s" : ""}
            </div>
            {lowStock.length > 0 && (
              <span style={{
                fontSize: fluid(11), fontWeight: 600, color: "var(--warn)",
                background: "color-mix(in oklch, var(--warn) 13%, var(--bg))", padding: `${fluid(2)} ${fluid(9)}`, borderRadius: 999,
              }}>
                {lowStock.length} con poco stock
              </span>
            )}
          </div>

          {active.length === 0 ? (
            <div style={{ fontSize: fluid(13), color: "var(--fg-muted)" }}>No tenés cafés activos.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${fluid(230)}, 1fr))`, gap: fluid(14) }}>
              {active.map((b) => (
                <BeanTile
                  key={b.id}
                  bean={b}
                  lastBrew={lastSessionFor(sessions, b.id)}
                  onOpen={() => onOpenDetail(b)}
                  onMarkFinished={() => onMarkFinished(b)}
                />
              ))}
            </div>
          )}

          {finished.length > 0 && (
            <>
              <button className="btn ghost" style={{ alignSelf: "flex-start", fontSize: fluid(12), padding: `${fluid(4)} ${fluid(8)}`, marginTop: fluid(8) }}
                onClick={() => setShowFinished((v) => !v)}>
                {showFinished ? "▾" : "▸"} No tengo más ({finished.length})
              </button>
              {showFinished && (
                <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${fluid(230)}, 1fr))`, gap: fluid(14) }}>
                  {finished.map((b) => (
                    <BeanTile
                      key={b.id}
                      bean={b}
                      lastBrew={lastSessionFor(sessions, b.id)}
                      onOpen={() => onOpenDetail(b)}
                      onMarkFinished={() => onMarkFinished(b)}
                      finished
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      <WishlistSection
        items={wishlistItems}
        onCreate={onCreateWishlistItem}
        onEdit={onEditWishlistItem}
        onDelete={onDeleteWishlistItem}
        onComprar={onComprarWishlistItem}
      />
    </div>
  );
}

function lastSessionFor(sessions: BrewSession[], beanId: string): BrewSession | null {
  const bs = sessions.filter((s) => s.beanId === beanId);
  if (bs.length === 0) return null;
  return bs.reduce((a, s) => (s.createdAt > a.createdAt ? s : a));
}

function BeanTile({
  bean: b, lastBrew, onOpen, onMarkFinished, finished,
}: {
  bean: CoffeeBean;
  lastBrew: BrewSession | null;
  onOpen: () => void;
  onMarkFinished: () => void;
  finished?: boolean;
}) {
  const asOf = finished && b.finishedAt ? b.finishedAt.slice(0, 10) : todayYmd();
  const status = freshnessStatus(b.roastedOn, asOf);
  const color = FRESHNESS_COLOR[status];
  const days = daysOld(b.roastedOn, asOf);
  const bagSize = b.initialWeightGrams && b.initialWeightGrams > 0 ? b.initialWeightGrams : REFERENCE_BAG_G;
  const pct = Math.max(0, Math.min(100, Math.round((b.weightGrams / bagSize) * 100)));
  const lowStock = !finished && b.weightGrams > 0 && b.weightGrams <= LOW_STOCK_G;

  return (
    <div
      role="button"
      onClick={onOpen}
      style={{
        background: "var(--bg-elev)", border: "1px solid var(--line)", borderRadius: fluid(13), padding: fluid(16),
        display: "flex", flexDirection: "column", gap: fluid(12), boxShadow: "var(--shadow-sm)", cursor: "pointer",
        opacity: finished ? 0.6 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: fluid(10) }}>
        <div style={{
          width: fluid(38), height: fluid(38), borderRadius: fluid(10), flexShrink: 0, fontSize: fluid(19),
          display: "grid", placeItems: "center",
          background: "color-mix(in oklch, var(--c-peach-fg) 14%, var(--bg))",
        }}>☕</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: fluid(14), fontWeight: 600, letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {b.name}
          </div>
          <div style={{ fontSize: fluid(11.5), color: "var(--fg-subtle)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {[b.roaster, b.process].filter(Boolean).join(" · ") || "—"}
          </div>
        </div>
      </div>

      {/* País y varietal en dos líneas fijas (una siempre reservada aun si falta el dato)
          para que la barra de stock quede a la misma altura en toda la grilla. */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: fluid(4) }}>
        {([b.country, b.varietal] as const).map((t, i) => (
          <span key={i} style={{
            fontSize: fluid(10.5), fontWeight: 600, color: "oklch(0.42 0.06 60)", background: "var(--bg-sunken)",
            border: "1px solid var(--line)", padding: `${fluid(2)} ${fluid(8)}`, borderRadius: 999,
            visibility: t ? "visible" : "hidden",
          }}>{t || "—"}</span>
        ))}
      </div>

      {!finished && (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: fluid(11.5), marginBottom: fluid(5) }}>
            <span style={{ color: "var(--fg-muted)" }}>Quedan</span>
            <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{b.weightGrams}g</span>
          </div>
          <div style={{ height: fluid(6), borderRadius: 99, background: "var(--bg-sunken)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: lowStock ? "var(--warn)" : "var(--ok)", borderRadius: 99 }} />
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: fluid(6), fontSize: fluid(11.5), color, fontWeight: 600 }}>
        <span style={{ width: fluid(7), height: fluid(7), borderRadius: "50%", background: color }} />
        {finished
          ? `Terminado${b.finishedAt ? ` · ${fmtDmY(b.finishedAt.slice(0, 10))}` : ""}`
          : `${FRESHNESS_LABEL[status]}${days != null ? ` (${days}d)` : ""}`}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: fluid(8), marginTop: "auto", paddingTop: fluid(8), borderTop: "1px solid var(--line)" }}>
        <span style={{ fontSize: fluid(11.5), color: "var(--fg-subtle)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {lastBrew ? (lastBrew.recipeName || "Brew sin receta") : "Sin brews aún"}
        </span>
        {!finished && (
          <span
            role="button"
            onClick={(e) => { e.stopPropagation(); onMarkFinished(); }}
            style={{ fontSize: fluid(11.5), color: "var(--fg-muted)", fontWeight: 600, cursor: "pointer", flexShrink: 0 }}
          >
            Marcar terminado
          </span>
        )}
      </div>
    </div>
  );
}

function WishlistSection({
  items, onCreate, onEdit, onDelete, onComprar,
}: {
  items: CoffeeWishlistItem[];
  onCreate: () => void;
  onEdit: (w: CoffeeWishlistItem) => void;
  onDelete: (id: string) => void;
  onComprar: (w: CoffeeWishlistItem) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: fluid(12), marginTop: fluid(4) }}>
      <div style={{ display: "flex", alignItems: "center", gap: fluid(10) }}>
        <div style={{ fontSize: fluid(11), textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700, color: "var(--fg-muted)", flex: 1 }}>
          Lista de deseados · {items.length}
        </div>
        <button className="btn" style={{ fontSize: fluid(12), display: "flex", alignItems: "center", gap: fluid(6) }} onClick={onCreate}>
          <IPlus size={12} /> Agregar grano a la lista
        </button>
      </div>
      {items.length === 0 ? (
        <div style={{ fontSize: fluid(13), color: "var(--fg-muted)" }}>Sin granos en la lista de deseados.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${fluid(220)}, 1fr))`, gap: fluid(14) }}>
          {items.map((w) => (
            <div key={w.id} style={{
              background: "var(--bg-elev)", border: "1px solid var(--line)", borderRadius: fluid(13), padding: `${fluid(14)} ${fluid(16)}`,
              display: "flex", flexDirection: "column", gap: fluid(10), boxShadow: "var(--shadow-sm)",
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: fluid(10) }}>
                <div style={{ width: fluid(34), height: fluid(34), borderRadius: fluid(9), background: "color-mix(in oklch, var(--c-peach-fg) 14%, var(--bg))", display: "grid", placeItems: "center", fontSize: fluid(16), flexShrink: 0 }}>☕</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: fluid(13.5), fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.name}</div>
                  <div style={{ fontSize: fluid(11.5), color: "var(--fg-subtle)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {[w.roaster, w.process].filter(Boolean).join(" · ") || "—"}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                  <button className="icon-btn" title="Editar" onClick={() => onEdit(w)}><EditIcon /></button>
                  <button className="icon-btn" title="Eliminar" style={{ color: "var(--danger)" }} onClick={() => onDelete(w.id)}><ITrash size={13} /></button>
                </div>
              </div>
              {w.notes && (
                <div style={{ fontSize: fluid(11.5), color: "var(--fg-muted)", lineHeight: 1.4 }}>{w.notes}</div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: fluid(8) }}>
                <span style={{ fontSize: fluid(15), fontWeight: 600, letterSpacing: "-0.01em" }}>
                  {w.priceKr != null ? fmtMoney(w.priceKr) : "kr —"}
                </span>
                <span style={{ flex: 1 }} />
                <button className="btn primary" style={{ fontSize: fluid(11.5), padding: `${fluid(6)} ${fluid(11)}` }} onClick={() => onComprar(w)}>
                  + Comprar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Bean detail drawer ----------

function BeanDetailDrawer({
  bean: b, sessions, onClose, onEdit, onDeleteRequest, onCreateTask, onMarkFinished, onConsume, onReactivate, onAnalizar, onAskAboutBrew,
}: {
  bean: CoffeeBean;
  sessions: BrewSession[];
  onClose: () => void;
  onEdit: (b: CoffeeBean) => void;
  onDeleteRequest: (id: string) => void;
  onCreateTask: (b: CoffeeBean) => void;
  onMarkFinished: (b: CoffeeBean) => void;
  onConsume: (b: CoffeeBean) => void;
  onReactivate: (b: CoffeeBean) => void;
  onAnalizar: (b: CoffeeBean) => void;
  onAskAboutBrew: (b: CoffeeBean) => void;
}) {
  const isFinished = !!b.finishedAt;
  const asOf = isFinished && b.finishedAt ? b.finishedAt.slice(0, 10) : todayYmd();
  const status = freshnessStatus(b.roastedOn, asOf);
  const days = daysOld(b.roastedOn, asOf);
  const color = FRESHNESS_COLOR[status];
  const brews = [...sessions].sort((a, s) => (a.createdAt < s.createdAt ? 1 : -1));

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 150, background: "rgba(20,20,20,0.28)", display: "flex", justifyContent: "flex-end" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: fluid(420), maxWidth: "92vw", height: "100%", background: "var(--bg-elev)", borderLeft: "1px solid var(--line)",
          boxShadow: "-16px 0 48px -12px rgba(20,20,20,0.22)", display: "flex", flexDirection: "column",
        }}
      >
        <div style={{ flexShrink: 0, padding: `${fluid(18)} ${fluid(20)}`, borderBottom: "1px solid var(--line)", display: "flex", alignItems: "flex-start", gap: fluid(12) }}>
          <div style={{
            width: fluid(42), height: fluid(42), borderRadius: fluid(11), flexShrink: 0, fontSize: fluid(21),
            display: "grid", placeItems: "center",
            background: "color-mix(in oklch, var(--c-peach-fg) 14%, var(--bg))",
          }}>☕</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: fluid(17), fontWeight: 600, letterSpacing: "-0.01em" }}>{b.name}</div>
            <div style={{ fontSize: fluid(12), color: "var(--fg-subtle)" }}>
              {[b.roaster, b.process, isFinished ? "terminado" : "en casa"].filter(Boolean).join(" · ")}
            </div>
          </div>
          <button className="icon-btn" onClick={onClose}><IX size={17} /></button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: `${fluid(18)} ${fluid(20)}`, display: "flex", flexDirection: "column", gap: fluid(16) }}>
          <div style={{ display: "flex", alignItems: "center", gap: fluid(8), flexWrap: "wrap" }}>
            <span style={{ display: "flex", alignItems: "center", gap: fluid(6), fontSize: fluid(12.5), color, fontWeight: 600 }}>
              <span style={{ width: fluid(7), height: fluid(7), borderRadius: "50%", background: color }} />
              {FRESHNESS_LABEL[status]}{days != null ? ` (${days}d)` : ""}
            </span>
            {!isFinished && <span style={{ fontSize: fluid(12.5), color: "var(--fg-muted)" }}>· {b.weightGrams}g restantes</span>}
            {b.roastedOn && <span style={{ fontSize: fluid(11.5), color: "var(--fg-subtle)" }}>· tostado {fmtDmY(b.roastedOn)}</span>}
          </div>

          {isFinished && b.rating != null && (
            <div style={{ fontSize: fluid(12.5), color: "var(--accent)", fontWeight: 600 }}>⭐ {b.rating}/10</div>
          )}
          {isFinished && b.flavorTags.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: fluid(5) }}>
              {b.flavorTags.map((t) => (
                <span key={t} style={{ fontSize: fluid(10.5), padding: `1px ${fluid(7)}`, borderRadius: 999, background: "var(--bg-sunken)", color: "var(--fg-muted)" }}>{t}</span>
              ))}
            </div>
          )}

          {b.cataInicial && (
            <div style={{ fontSize: fluid(12.5), color: "var(--fg-muted)" }}>
              <span style={{ color: "var(--fg-subtle)", fontWeight: 500 }}>Cata inicial: </span>{b.cataInicial}
            </div>
          )}
          {b.notaFinal && (
            <div style={{ fontSize: fluid(12.5), color: "var(--fg-muted)" }}>
              <span style={{ color: "var(--fg-subtle)", fontWeight: 500 }}>Nota final: </span>{b.notaFinal}
            </div>
          )}
          {b.lastTweak && (b.lastTweak.notes || b.lastTweak.grindSize || b.lastTweak.doseGrams) && (
            <div style={{ fontSize: fluid(11.5), color: "var(--fg-subtle)" }}>
              Último ajuste:
              {b.lastTweak.grindSize ? ` molienda ${b.lastTweak.grindSize}` : ""}
              {b.lastTweak.doseGrams ? ` · ${b.lastTweak.doseGrams}g` : ""}
              {b.lastTweak.tempCelsius ? ` · ${b.lastTweak.tempCelsius}C` : ""}
              {b.lastTweak.notes ? ` · ${b.lastTweak.notes}` : ""}
            </div>
          )}

          <div style={{ display: "flex", flexWrap: "wrap", gap: fluid(6) }}>
            {!isFinished && b.weightGrams <= LOW_STOCK_G && (
              <button className="btn ghost" style={{ fontSize: fluid(11.5), color: "var(--accent)" }} onClick={() => onCreateTask(b)}>
                Crear tarea pedir
              </button>
            )}
            {!isFinished && (
              <button className="btn ghost" style={{ fontSize: fluid(11.5) }} onClick={() => onConsume(b)}>
                Descontar consumo
              </button>
            )}
            {!isFinished && (
              <button className="btn ghost" style={{ fontSize: fluid(11.5) }} onClick={() => onMarkFinished(b)}>
                Marcar terminado
              </button>
            )}
            {isFinished && (
              <button className="btn ghost" style={{ fontSize: fluid(11.5), color: "var(--accent)" }} onClick={() => onReactivate(b)}>
                Reactivar
              </button>
            )}
            {!isFinished && !isMobile && (
              <button className="btn ghost" title="Abrir Claude en una terminal para analizar este cafe"
                style={{ fontSize: fluid(11.5), color: "var(--accent)", fontWeight: 600 }} onClick={() => onAnalizar(b)}>
                ☕ Analizar
              </button>
            )}
            {!isFinished && !isMobile && (
              <button className="btn ghost" title="Preguntarle a Claude sobre un brew que no salio bien"
                style={{ fontSize: fluid(11.5), color: "var(--accent)", fontWeight: 600 }} onClick={() => onAskAboutBrew(b)}>
                💬 Preguntar
              </button>
            )}
            <button className="btn ghost" style={{ fontSize: fluid(11.5) }} onClick={() => onEdit(b)}>Editar</button>
            <button className="btn ghost" style={{ fontSize: fluid(11.5), color: "var(--danger)" }} onClick={() => onDeleteRequest(b.id)}>Eliminar</button>
          </div>

          <div style={{ fontSize: fluid(11), textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700, color: "var(--fg-muted)" }}>
            Brews · {brews.length}
          </div>
          {brews.length === 0 ? (
            <div style={{ fontSize: fluid(12.5), color: "var(--fg-subtle)" }}>Sin brews registrados para este grano.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: fluid(12) }}>
              {brews.map((s) => <BrewCard key={s.id} session={s} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BrewCard({ session: s }: { session: BrewSession }) {
  const [open, setOpen] = useState(false);
  const [points, setPoints] = useState<BrewDatapoint[] | null>(null);
  const ratio = s.doseGrams > 0 ? (s.totalWaterGrams / s.doseGrams).toFixed(1) : "—";

  async function toggleGraph() {
    if (!open && points == null) {
      const { repo } = await import("../lib/repo");
      setPoints(await repo.getBrewDatapoints(s.id));
    }
    setOpen((v) => !v);
  }

  const maxWeight = Math.max(...(points ?? []).map((p) => p.weightG ?? 0), 10);
  const maxFlow = Math.max(...(points ?? []).map((p) => p.flowGs ?? 0), 1);
  const maxTimeSec = Math.max(...(points ?? []).map((p) => p.timerMs / 1000), 60);

  return (
    <div style={{ background: "var(--bg-sunken)", border: "1px solid var(--line)", borderRadius: fluid(11), padding: `${fluid(13)} ${fluid(14)}`, display: "flex", flexDirection: "column", gap: fluid(9) }}>
      <div style={{ display: "flex", alignItems: "center", gap: fluid(8) }}>
        <span style={{ fontSize: fluid(13), fontWeight: 600, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {s.recipeName || "Sin receta"}
        </span>
        <span style={{ fontSize: fluid(11.5), color: "var(--fg-subtle)", fontVariantNumeric: "tabular-nums" }}>{fmtDate(s.createdAt)}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: fluid(6) }}>
        <RecipeStatBox value={`1:${ratio}`} label="Ratio" />
        <RecipeStatBox value={`${s.doseGrams.toFixed(1)}g`} label="Café" />
        <RecipeStatBox value={`${s.totalWaterGrams.toFixed(0)}g`} label="Agua" />
        <RecipeStatBox value={fmtDuration(s.durationMs)} label="Tiempo" />
      </div>
      <div style={{ display: "flex", alignItems: "flex-start", gap: fluid(10) }}>
        <div style={{ fontSize: fluid(12), color: "var(--fg-muted)", lineHeight: 1.5, flex: 1 }}>{s.notes || "Sin notas"}</div>
        <button className="btn" style={{ fontSize: fluid(11), padding: `${fluid(5)} ${fluid(10)}`, flexShrink: 0 }} onClick={() => void toggleGraph()}>
          {open ? "Ocultar gráfico" : "Ver gráfico"}
        </button>
      </div>
      {open && points && points.length > 0 && (
        <BrewOverlayChart sessions={[s]} dataBySession={{ [s.id]: points }} maxWeight={maxWeight} maxFlow={maxFlow} maxTimeSec={maxTimeSec} />
      )}
      {open && points && points.length === 0 && (
        <div style={{ fontSize: fluid(11.5), color: "var(--fg-subtle)" }}>Sin datos de curva para este brew.</div>
      )}
    </div>
  );
}

// ---------- Recetas tab ----------

function RecetasTab({
  recipes, sessions, onEdit, onDeleteRequest,
}: {
  recipes: CoffeeRecipe[];
  sessions: BrewSession[];
  onEdit: (r: CoffeeRecipe) => void;
  onDeleteRequest: (id: string) => void;
}) {
  if (recipes.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: `${fluid(60)} ${fluid(20)}`, color: "var(--fg-muted)" }}>
        <div style={{ fontSize: fluid(32), marginBottom: fluid(12), opacity: 0.4 }}>📖</div>
        <p style={{ margin: `0 0 ${fluid(6)}`, fontSize: fluid(14), fontWeight: 500, color: "var(--fg)" }}>Sin recetas</p>
        <p style={{ margin: 0, fontSize: fluid(13) }}>Guardá tus recetas de café con pasos, tiempos y cantidades.</p>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: fluid(18) }}>
      <div style={{ fontSize: fluid(11), textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700, color: "var(--fg-muted)" }}>
        Tus recetas de preparación · {recipes.length}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${fluid(320)}, 1fr))`, gap: fluid(14) }}>
        {recipes.map((r) => (
          <RecipeTile
            key={r.id}
            recipe={r}
            timesUsed={sessions.filter((s) => s.recipeName === r.name).length}
            onEdit={onEdit}
            onDelete={onDeleteRequest}
          />
        ))}
      </div>
    </div>
  );
}

function RecipeTile({ recipe: r, timesUsed, onEdit, onDelete }: {
  recipe: CoffeeRecipe;
  timesUsed: number;
  onEdit: (r: CoffeeRecipe) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const totalWater = r.steps.reduce((s, step) => s + (step.waterGrams ?? 0), 0);

  return (
    <div style={{ background: "var(--bg-elev)", border: "1px solid var(--line)", borderRadius: fluid(13), padding: `${fluid(16)} ${fluid(18)}`, display: "flex", flexDirection: "column", gap: fluid(13), boxShadow: "var(--shadow-sm)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: fluid(11) }}>
        <div style={{ width: fluid(40), height: fluid(40), borderRadius: fluid(11), background: "color-mix(in oklch, var(--accent) 13%, var(--bg))", display: "grid", placeItems: "center", fontSize: fluid(20), flexShrink: 0 }}>☕</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: fluid(15), fontWeight: 600, letterSpacing: "-0.01em" }}>{r.name}</div>
          <div style={{ fontSize: fluid(11.5), color: "var(--fg-subtle)" }}>{r.coffeeType || "Sin tipo"}</div>
        </div>
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          <button className="icon-btn" title="Editar" onClick={() => onEdit(r)}><EditIcon /></button>
          <button className="icon-btn" title="Eliminar" style={{ color: "var(--danger)" }} onClick={() => onDelete(r.id)}><ITrash size={14} /></button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: fluid(8) }}>
        <RecipeStatBox value={`1:${r.ratio}`} label="Ratio" />
        <RecipeStatBox value={`${r.tempCelsius}°`} label="Temp" />
        <RecipeStatBox value={r.grindSize || "—"} label="Molienda" />
        <RecipeStatBox value={totalWater > 0 ? `${totalWater}g` : "—"} label="Agua" />
      </div>

      <div style={{ fontSize: fluid(12), color: "var(--fg-muted)", lineHeight: 1.5 }}>{r.notes || "Sin notas"}</div>

      <div style={{ display: "flex", alignItems: "center", gap: fluid(8), marginTop: "auto", paddingTop: fluid(11), borderTop: "1px solid var(--line)" }}>
        <span style={{ fontSize: fluid(11.5), color: "var(--fg-subtle)", flex: 1 }}>
          Usada {timesUsed} vez{timesUsed !== 1 ? "es" : ""}
        </span>
        {r.steps.length > 0 && (
          <button className="btn ghost" style={{ fontSize: fluid(12), padding: `${fluid(6)} ${fluid(13)}`, display: "flex", alignItems: "center", gap: 4 }}
            onClick={() => setExpanded((v) => !v)}>
            {expanded ? <IChevU size={12} /> : <IChevD size={12} />} Pasos
          </button>
        )}
      </div>

      {expanded && r.steps.length > 0 && (
        <div style={{ borderTop: "1px solid var(--line)", paddingTop: fluid(10), display: "flex", flexDirection: "column", gap: fluid(4) }}>
          {r.steps.map((step, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: fluid(10), fontSize: fluid(13) }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: fluid(12), color: "var(--accent)", width: fluid(36), flexShrink: 0 }}>
                {fmtTime(step.timeSeconds)}
              </span>
              <span style={{
                fontSize: fluid(10), fontWeight: 700, padding: `1px ${fluid(5)}`, borderRadius: 4, flexShrink: 0,
                background: step.type === "pour" ? "color-mix(in srgb, var(--accent) 15%, transparent)" : "var(--bg-sunken)",
                color: step.type === "pour" ? "var(--accent)" : "var(--fg-subtle)",
              }}>
                {step.type === "pour" ? "pour" : "acción"}
              </span>
              <span style={{ color: "var(--fg)", flex: 1 }}>{step.description}</span>
              {step.type === "pour" && step.waterRatio != null && (
                <span style={{ fontSize: fluid(12), color: "var(--fg-muted)", flexShrink: 0 }}>
                  {(step.waterMode ?? "x_cafe") === "pct_agua" ? `${step.waterRatio}%` : `×${step.waterRatio}`}
                </span>
              )}
              {step.type === "pour" && step.waterRatio == null && (step.waterGrams ?? 0) > 0 && (
                <span style={{ fontSize: fluid(12), color: "var(--fg-muted)", flexShrink: 0 }}>{step.waterGrams}g</span>
              )}
              {step.type === "pour" && step.flowTarget != null && (
                <span style={{ fontSize: fluid(11), color: "var(--fg-subtle)", flexShrink: 0 }}>{step.flowTarget} g/s</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RecipeStatBox({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ background: "var(--bg-sunken)", borderRadius: fluid(9), padding: `${fluid(9)} ${fluid(6)}`, textAlign: "center" }}>
      <div style={{ fontSize: fluid(14), fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ fontSize: fluid(9.5), textTransform: "uppercase", letterSpacing: ".05em", color: "var(--fg-subtle)", marginTop: fluid(2) }}>{label}</div>
    </div>
  );
}

// ---------- Bean modal ----------

function BeanModal({ form, isEdit, saving, error, onChange, onSave, onClose }: {
  form: BeanFormState;
  isEdit: boolean;
  saving: boolean;
  error: string | null;
  onChange: (k: keyof BeanFormState, v: string) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  return (
    <Modal title={isEdit ? "Editar grano" : "Nuevo grano"} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {error && <div style={{ color: "var(--danger)", fontSize: 13, padding: "6px 10px", background: "color-mix(in srgb, var(--danger) 12%, transparent)", borderRadius: 6 }}>{error}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Nombre *">
            <input className="input" value={form.name} autoFocus onChange={(e) => onChange("name", e.target.value)} placeholder="ej. Yirgacheffe Natural" />
          </Field>
          <Field label="Tostador">
            <input className="input" value={form.roaster} onChange={(e) => onChange("roaster", e.target.value)} placeholder="ej. La Marzocco" />
          </Field>
          <Field label="País">
            <input className="input" value={form.country} onChange={(e) => onChange("country", e.target.value)} placeholder="ej. Etiopía" />
          </Field>
          <Field label="Varietal">
            <input className="input" value={form.varietal} onChange={(e) => onChange("varietal", e.target.value)} placeholder="ej. Heirloom" />
          </Field>
          <Field label="Proceso">
            <input className="input" value={form.process} onChange={(e) => onChange("process", e.target.value)} placeholder="ej. Natural" />
          </Field>
          <Field label="Productor">
            <input className="input" value={form.producer} onChange={(e) => onChange("producer", e.target.value)} placeholder="ej. Worku Sakaro" />
          </Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Fecha de tueste">
            <input className="input" type="date" value={form.roastedOn} onChange={(e) => onChange("roastedOn", e.target.value)} />
          </Field>
          <Field label="Cantidad actual (g)">
            <input className="input" type="number" min="0" value={form.weightGrams} onChange={(e) => onChange("weightGrams", e.target.value)} />
          </Field>
        </div>
        <Field label="Notas">
          <textarea className="input" value={form.notes} rows={2} style={{ resize: "vertical" }}
            onChange={(e) => onChange("notes", e.target.value)} placeholder="notas libres…" />
        </Field>
        <Field label="Cata inicial (qué buscás)">
          <textarea className="input" value={form.cataInicial} rows={2} style={{ resize: "vertical" }}
            onChange={(e) => onChange("cataInicial", e.target.value)} placeholder="al abrir el grano: qué perfil buscás…" />
        </Field>
        <Field label="Nota final (a dónde llegaste)">
          <textarea className="input" value={form.notaFinal} rows={2} style={{ resize: "vertical" }}
            onChange={(e) => onChange("notaFinal", e.target.value)} placeholder="al terminarlo: lograste algo parecido?…" />
        </Field>
      </div>
      <ModalFooter saving={saving} isEdit={isEdit} onSave={onSave} onClose={onClose} saveLabel="grano" />
    </Modal>
  );
}

// ---------- Wishlist modal ----------

function WishlistModal({ form, isEdit, saving, error, onChange, onSave, onClose }: {
  form: WishlistFormState;
  isEdit: boolean;
  saving: boolean;
  error: string | null;
  onChange: (k: keyof WishlistFormState, v: string) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  return (
    <Modal title={isEdit ? "Editar grano de la lista" : "Agregar grano a la lista"} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {error && <div style={{ color: "var(--danger)", fontSize: 13, padding: "6px 10px", background: "color-mix(in srgb, var(--danger) 12%, transparent)", borderRadius: 6 }}>{error}</div>}
        <Field label="Nombre *">
          <input className="input" value={form.name} autoFocus onChange={(e) => onChange("name", e.target.value)} placeholder="ej. Colombia Huila" />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Tostador">
            <input className="input" value={form.roaster} onChange={(e) => onChange("roaster", e.target.value)} placeholder="ej. Café Rituals" />
          </Field>
          <Field label="Proceso">
            <input className="input" value={form.process} onChange={(e) => onChange("process", e.target.value)} placeholder="ej. Lavado" />
          </Field>
        </div>
        <Field label="Precio (kr)">
          <input className="input" type="number" min="0" step="1" value={form.priceKr} onChange={(e) => onChange("priceKr", e.target.value)} placeholder="ej. 165" />
        </Field>
        <Field label="Notas">
          <textarea className="input" value={form.notes} rows={2} style={{ resize: "vertical" }}
            onChange={(e) => onChange("notes", e.target.value)} placeholder="notas libres…" />
        </Field>
      </div>
      <ModalFooter saving={saving} isEdit={isEdit} onSave={onSave} onClose={onClose} saveLabel="grano" />
    </Modal>
  );
}

// ---------- Recipe modal ----------

function RecipeModal({ form, isEdit, saving, error, onChange, onStepsChange, onSave, onClose }: {
  form: RecipeFormState;
  isEdit: boolean;
  saving: boolean;
  error: string | null;
  onChange: (k: keyof Omit<RecipeFormState, "steps">, v: string) => void;
  onStepsChange: (steps: CoffeeRecipeStep[]) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const [dosisRef, setDosisRef] = useState(15);

  function addStep() {
    const last = form.steps.length > 0 ? form.steps[form.steps.length - 1] : null;
    const type: CoffeeStepType = last ? last.type : "pour";
    onStepsChange([...form.steps, { type, timeSeconds: last?.timeSeconds ?? 20, description: "" }]);
  }

  function removeStep(i: number) {
    onStepsChange(form.steps.filter((_, idx) => idx !== i));
  }

  function patchStep(i: number, patch: Partial<CoffeeRecipeStep>) {
    onStepsChange(form.steps.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  }

  function toggleStepType(i: number) {
    const s = form.steps[i];
    patchStep(i, { type: s.type === "pour" ? "action" : "pour" });
  }

  return (
    <Modal title={isEdit ? "Editar receta" : "Nueva receta"} onClose={onClose} wide>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {error && <div style={{ color: "var(--danger)", fontSize: 13, padding: "6px 10px", background: "color-mix(in srgb, var(--danger) 12%, transparent)", borderRadius: 6 }}>{error}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
          <Field label="Nombre *">
            <input className="input" value={form.name} autoFocus onChange={(e) => onChange("name", e.target.value)} placeholder="ej. V60 Bloom & Pour" />
          </Field>
          <Field label="Tipo">
            <input className="input" list="coffee-types" value={form.coffeeType} onChange={(e) => onChange("coffeeType", e.target.value)} placeholder="v60, espresso…" />
            <datalist id="coffee-types">
              {COFFEE_TYPES.map((t) => <option key={t} value={t} />)}
            </datalist>
          </Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <Field label="Ratio (agua/café)">
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>1:</span>
              <input className="input" type="number" min="1" step="0.5" value={form.ratio}
                onChange={(e) => onChange("ratio", e.target.value)} />
            </div>
          </Field>
          <Field label="Temperatura (°C)">
            <input className="input" type="number" min="60" max="100" value={form.tempCelsius}
              onChange={(e) => onChange("tempCelsius", e.target.value)} />
          </Field>
          <Field label="Molienda">
            <input className="input" value={form.grindSize} onChange={(e) => onChange("grindSize", e.target.value)} placeholder="ej. 24 clicks" />
          </Field>
        </div>

        {/* Steps */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: "var(--fg-muted)" }}>Pasos</label>
              <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <span style={{ fontSize: 11, color: "var(--fg-subtle)" }}>dosis ref.:</span>
                <input
                  className="input"
                  type="number" min="1" step="1"
                  value={dosisRef}
                  onChange={(e) => setDosisRef(parseFloat(e.target.value) || 15)}
                  style={{ width: 48, fontSize: 11, padding: "2px 6px" }}
                />
                <span style={{ fontSize: 11, color: "var(--fg-subtle)" }}>g</span>
              </div>
            </div>
            <button className="btn ghost" style={{ fontSize: 11, padding: "2px 8px" }} onClick={addStep}>
              + Agregar paso
            </button>
          </div>
          {form.steps.length === 0 && (
            <div style={{ fontSize: 12, color: "var(--fg-subtle)", textAlign: "center", padding: "10px 0" }}>
              Sin pasos — la receta es libre
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column" }}>
            {form.steps.map((step, i) => {
              const isPour = step.type === "pour";
              const stepWaterMode = step.waterMode ?? "x_cafe";
              const ratio = parseFloat(form.ratio) || 15;
              const autoCompletePct = step.autoComplete ? autoCompleteRatio(i, form.steps, ratio) : null;
              const derivedGrams = dosisRef > 0
                ? step.autoComplete
                  ? Math.round((autoCompletePct! / 100) * ratio * dosisRef)
                  : step.waterRatio
                    ? stepWaterMode === "x_cafe"
                      ? Math.round(step.waterRatio * dosisRef)
                      : Math.round((step.waterRatio / 100) * ratio * dosisRef)
                    : null
                : null;
              return (
                <div key={i} style={{ display: "flex", flexDirection: "column", gap: 5, padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
                  {/* Row 1: type toggle + time + description + delete */}
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <button
                      type="button"
                      onClick={() => toggleStepType(i)}
                      style={{
                        flexShrink: 0, fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 20,
                        border: "none", cursor: "pointer",
                        background: isPour ? "color-mix(in srgb, var(--accent) 18%, transparent)" : "var(--bg-sunken)",
                        color: isPour ? "var(--accent)" : "var(--fg-muted)",
                      }}
                    >
                      {isPour ? "pour" : "acción"}
                    </button>
                    <input
                      className="input"
                      value={fmtTime(step.timeSeconds)}
                      onChange={(e) => patchStep(i, { timeSeconds: parseMmSs(e.target.value) })}
                      placeholder="0:00"
                      style={{ width: 58, fontFamily: "var(--font-mono)", fontSize: 12, flexShrink: 0 }}
                    />
                    <input
                      className="input"
                      value={step.description}
                      onChange={(e) => patchStep(i, { description: e.target.value })}
                      placeholder={isPour ? "ej. Bloom" : "ej. Revolver, esperar…"}
                      style={{ flex: 1 }}
                    />
                    <button className="icon-btn" style={{ color: "var(--danger)", flexShrink: 0 }} onClick={() => removeStep(i)}>
                      <IX size={12} />
                    </button>
                  </div>
                  {/* Row 2: pour fields (agua ratio + derived grams + flow) */}
                  {isPour && (
                    <div style={{ display: "flex", gap: 12, alignItems: "center", paddingLeft: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <span style={{ fontSize: 11, color: "var(--fg-subtle)", whiteSpace: "nowrap" }}>Agua</span>
                        {step.autoComplete ? (
                          /* auto mode: badge read-only + deactivate button */
                          <>
                            <span style={{
                              fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 10,
                              background: "color-mix(in srgb, var(--accent) 18%, transparent)",
                              color: "var(--accent)", whiteSpace: "nowrap",
                            }}>
                              auto · {Math.round(autoCompletePct!)}%
                            </span>
                            <button type="button" onClick={() => patchStep(i, { autoComplete: false })} style={{
                              fontSize: 10, padding: "1px 5px", borderRadius: 4, border: "1px solid var(--line)",
                              background: "transparent", color: "var(--fg-subtle)", cursor: "pointer",
                            }}>×</button>
                          </>
                        ) : (
                          /* normal mode: toggle + input + autocompletar button */
                          <>
                            <div style={{ display: "flex", gap: 1, background: "var(--bg-sunken)", borderRadius: 5, padding: 1 }}>
                              {(["x_cafe", "pct_agua"] as WaterMode[]).map((m) => (
                                <button key={m} type="button" onClick={() => patchStep(i, { waterMode: m })} style={{
                                  fontSize: 10, padding: "1px 6px", borderRadius: 4, border: "none", cursor: "pointer",
                                  background: stepWaterMode === m ? "var(--bg)" : "transparent",
                                  color: stepWaterMode === m ? "var(--fg)" : "var(--fg-subtle)",
                                  fontWeight: stepWaterMode === m ? 600 : 400,
                                }}>
                                  {m === "x_cafe" ? "×café" : "%"}
                                </button>
                              ))}
                            </div>
                            <input
                              className="input"
                              type="number" min="0"
                              step={stepWaterMode === "x_cafe" ? "0.1" : "1"}
                              value={step.waterRatio ?? ""}
                              onChange={(e) => patchStep(i, { waterRatio: parseFloat(e.target.value) || undefined })}
                              placeholder={stepWaterMode === "x_cafe" ? "ej. 2.0" : "ej. 30"}
                              style={{ width: 60 }}
                            />
                            {stepWaterMode === "pct_agua" && step.waterRatio != null && (
                              <span style={{ fontSize: 11, color: "var(--fg-subtle)" }}>%</span>
                            )}
                            {(() => {
                              const restRaw = autoCompleteRatio(i, form.steps, ratio);
                              const restRounded = Math.round(restRaw);
                              if (restRaw <= 0) return null;
                              return (
                                <button type="button" onClick={() => {
                                  onStepsChange(form.steps.map((s, idx) =>
                                    idx === i
                                      ? { ...s, autoComplete: true, waterMode: "pct_agua" as WaterMode }
                                      : { ...s, autoComplete: false }
                                  ));
                                }} style={{
                                  fontSize: 10, padding: "1px 6px", borderRadius: 4, border: "1px dashed var(--line)",
                                  background: "transparent", color: "var(--fg-muted)", cursor: "pointer", whiteSpace: "nowrap",
                                }}>
                                  autocompletar · {restRounded}%
                                </button>
                              );
                            })()}
                          </>
                        )}
                        {derivedGrams != null && (
                          <span style={{ fontSize: 12, color: "var(--fg-muted)", whiteSpace: "nowrap" }}>
                            ≈ {derivedGrams} g
                            {!step.autoComplete && stepWaterMode === "x_cafe" && step.waterRatio != null && ratio > 0 && (
                              <span style={{ color: "var(--fg-subtle)", marginLeft: 4 }}>
                                ({Math.round(step.waterRatio / ratio * 100)}%)
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <span style={{ fontSize: 11, color: "var(--fg-subtle)", whiteSpace: "nowrap" }}>Flow (g/s)</span>
                        <input
                          className="input"
                          type="number" min="0" step="0.5"
                          value={step.flowTarget ?? ""}
                          onChange={(e) => patchStep(i, { flowTarget: parseFloat(e.target.value) || undefined })}
                          placeholder="ej. 4.0"
                          style={{ width: 65 }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {/* pct_agua balance indicator */}
          {(() => {
            const hasTracked = form.steps.some(
              (s) => s.type === "pour" && ((s.waterMode ?? "x_cafe") === "pct_agua" || s.autoComplete)
            );
            if (!hasTracked) return null;
            const ratio = parseFloat(form.ratio) || 15;
            const sum = form.steps.reduce((acc, s, i) => {
              if (s.type !== "pour") return acc;
              if (s.autoComplete) return acc + autoCompleteRatio(i, form.steps, ratio);
              if ((s.waterMode ?? "x_cafe") === "pct_agua") return acc + (s.waterRatio ?? 0);
              return acc + (s.waterRatio != null && ratio > 0 ? s.waterRatio / ratio * 100 : 0);
            }, 0);
            const rounded = Math.round(sum);
            const diff = 100 - rounded;
            const isOver = diff < 0;
            const isExact = diff === 0;
            return (
              <div style={{
                marginTop: 6, padding: "5px 10px", borderRadius: 6, fontSize: 12,
                background: isOver
                  ? "color-mix(in srgb, var(--danger) 10%, transparent)"
                  : isExact
                  ? "color-mix(in srgb, #4caf50 10%, transparent)"
                  : "var(--bg-sunken)",
                color: isOver ? "var(--danger)" : isExact ? "#4caf50" : "var(--fg-muted)",
                display: "flex", alignItems: "center", gap: 6,
              }}>
                <span style={{ fontWeight: 600 }}>% total pours: {rounded}%</span>
                {!isExact && (
                  <span>— {isOver ? `sobrás ${-diff}%` : `falta ${diff}%`}</span>
                )}
                {isExact && <span>✓ completo</span>}
              </div>
            );
          })()}
        </div>

        <Field label="Notas">
          <textarea className="input" value={form.notes} rows={2} style={{ resize: "vertical" }}
            onChange={(e) => onChange("notes", e.target.value)} placeholder="tweaks, observaciones…" />
        </Field>
      </div>
      <ModalFooter saving={saving} isEdit={isEdit} onSave={onSave} onClose={onClose} saveLabel="receta" />
    </Modal>
  );
}

const FLAVOR_TAG_OPTIONS = [
  "Floral", "Cítrico", "Frutal", "Achocolatado", "Nuez/Caramelo",
  "Especiado", "Herbal", "Terroso", "Ácido brillante", "Dulce",
];

function FinishBeanModal({ bean, onClose, onConfirm }: {
  bean: CoffeeBean;
  onClose: () => void;
  onConfirm: (rating: number | null, flavorTags: string[]) => Promise<void>;
}) {
  const [rating, setRating] = useState<number | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleTag = (t: string) => {
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };

  const addCustomTag = () => {
    const t = customTag.trim();
    if (t && !tags.includes(t)) setTags((prev) => [...prev, t]);
    setCustomTag("");
  };

  const confirm = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    const finalTags = customTag.trim() && !tags.includes(customTag.trim())
      ? [...tags, customTag.trim()]
      : tags;
    const timeout = new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error("Timeout — reintentá si sigue pasando")), 10_000)
    );
    try {
      await Promise.race([onConfirm(rating, finalTags), timeout]);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
      setSaving(false);
    }
  };

  return (
    <Modal title={`Marcar "${bean.name}" como terminado`} onClose={onClose}>
      <Field label="Puntaje (1-10)">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              className={`btn ${rating === n ? "primary" : "ghost"}`}
              style={{ width: 34, padding: "4px 0", fontVariantNumeric: "tabular-nums", justifyContent: "center" }}
              onClick={() => setRating(n)}
            >
              {n}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Sabores (opcional)">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {FLAVOR_TAG_OPTIONS.map((t) => (
            <button
              key={t}
              type="button"
              className={`btn ${tags.includes(t) ? "primary" : "ghost"}`}
              style={{ fontSize: 11.5, padding: "3px 9px", borderRadius: 999 }}
              onClick={() => toggleTag(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <input
            className="input"
            placeholder="Agregar sabor propio…"
            value={customTag}
            onChange={(e) => setCustomTag(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomTag(); } }}
            style={{ flex: 1 }}
          />
          <button type="button" className="btn ghost" onClick={addCustomTag} disabled={!customTag.trim()}>
            Agregar
          </button>
        </div>
      </Field>

      {error && (
        <div style={{ fontSize: 12, color: "var(--danger)" }}>{error}</div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button className="btn" onClick={onClose} disabled={saving}>Cancelar</button>
        <button className="btn primary" onClick={() => void confirm()} disabled={saving}>
          {saving ? "Guardando…" : "Marcar terminado"}
        </button>
      </div>
    </Modal>
  );
}

// ---------- shared primitives ----------

function Modal({ title, children, onClose, wide }: {
  title: string; children: React.ReactNode; onClose: () => void; wide?: boolean;
}) {
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "var(--bg)", borderRadius: 12, padding: 24,
        width: wide ? 600 : 480, maxWidth: "92vw", maxHeight: "88vh", overflowY: "auto",
        boxShadow: "0 8px 40px rgba(0,0,0,0.35)", display: "flex", flexDirection: "column", gap: 16,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{title}</h3>
          <button className="icon-btn" onClick={onClose}><IX size={14} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalFooter({ saving, isEdit, onSave, onClose, saveLabel }: {
  saving: boolean; isEdit: boolean; onSave: () => void; onClose: () => void; saveLabel: string;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
      <button className="btn" onClick={onClose}>Cancelar</button>
      <button className="btn primary" onClick={onSave} disabled={saving}>
        {saving ? "Guardando…" : isEdit ? `Guardar ${saveLabel}` : `Crear ${saveLabel}`}
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {label && <label style={{ fontSize: 12, fontWeight: 500, color: "var(--fg-muted)" }}>{label}</label>}
      {children}
    </div>
  );
}

function ConfirmModal({ text, onConfirm, onCancel }: { text: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "var(--bg)", borderRadius: 10, padding: 24, width: 320, boxShadow: "0 4px 24px rgba(0,0,0,0.3)" }}>
        <p style={{ margin: "0 0 16px", fontSize: 14 }}>{text}</p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn" onClick={onCancel}>Cancelar</button>
          <button className="btn ghost" style={{ color: "var(--danger)" }} onClick={onConfirm}>Eliminar</button>
        </div>
      </div>
    </div>
  );
}

function EditIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}
