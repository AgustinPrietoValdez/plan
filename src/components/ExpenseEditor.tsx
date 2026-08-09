import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { colorsForHue } from "../lib/categoryColor";
import { todayYmd } from "../lib/date";
import {
  CURRENCY,
  convertViaUsd,
  DEFAULT_RATES_PER_USD,
  fmtMoneyIn,
  parseMoney,
} from "../lib/money";
import { avgPriceLast3Months, buildPriceHistory, cheapestMerchant } from "../lib/priceHistory";
import { baseUnit, parseQuantity, toBase, unitOptions, type Dimension } from "../lib/units";
import {
  useAccounts,
  useCreateExpense,
  useCreateExpenseLineItem,
  useCreateMerchant,
  useDeleteExpense,
  useDeleteExpenseLineItem,
  useExpenseCategories,
  useExpenseLineItems,
  useExpenses,
  useFinanzasSettings,
  useIngredientPresentations,
  useIngredients,
  useMerchants,
  usePatchExpense,
  usePatchExpenseLineItem,
} from "../lib/queries";
import { useApp } from "../lib/store";
import type { AccountCurrency, Expense, RecurrenceRule } from "../types";
import { EntityPicker } from "./EntityPicker";
import { ICheck, IRecurring, ITrash, IX } from "./icons";
import { RecurrencePicker } from "./RecurrencePicker";
import { DateInput } from "./DateInput";

const CURRENCY_OPTIONS: AccountCurrency[] = ["DKK", "USD", "EUR", "ARS"];

/** Todo lo que vive dentro de un `.modal` escala con `--home-s`: un px pelado
 *  se ve diminuto en 2K. Ver el bloque de comentarios en components.css:764. */
const s = (n: number) => `calc(var(--home-s, 1) * ${n}px)`;

/** El backdrop del modal CIERRA en mousedown (ver `onBackdropMouseDown`), así que
 *  todo control nuevo tiene que cortar la propagación o tocarlo cierra el gasto. */
const stopMouse = (e: MouseEvent) => e.stopPropagation();

/** Unidad en la que se muestra un precio normalizado: /kg, /L o /u. */
const priceUnitLabel = (dim: Dimension) =>
  dim === "weight" ? "kg" : dim === "volume" ? "L" : baseUnit(dim);

/** Pasa un precio por unidad base (g / ml / u) a la unidad de display. */
const perDisplayUnit = (pricePerBase: number, dim: Dimension) =>
  dim === "count" ? pricePerBase : pricePerBase * 1000;

interface DraftFields {
  name: string;
  amount: number;
  currency: AccountCurrency;
  categoryId: string | null;
  merchantId: string | null;
  accountId: string | null;
  goalId: string | null;
  spentOn: string;
  note: string;
  recurrence: RecurrenceRule | null;
}

/** Una línea todavía no escrita (modo "create"): el gasto aún no tiene id, así
 *  que se acumulan acá y se escriben recién después de crearlo. */
interface PendingLine {
  key: string;
  name: string;
  quantity: number;
  unitPrice: number;
  ingredientId: string;
  presentationId: string | null;
  baseQuantity: number;
  addToStock: boolean;
}

/** Vista unificada de una línea, venga de la DB (edit) o del borrador (create). */
interface RowView {
  key: string;
  name: string;
  quantity: number;
  unitPrice: number;
  baseQuantity: number;
  ingredientId: string | null;
  addToStock: boolean;
}

function fromExpense(e: Expense): DraftFields {
  return {
    name: e.name,
    amount: e.amount,
    currency: (e.currency as AccountCurrency) ?? CURRENCY,
    categoryId: e.categoryId,
    merchantId: e.merchantId,
    accountId: e.accountId,
    goalId: e.goalId,
    spentOn: e.spentOn,
    note: e.note,
    recurrence: e.recurrence,
  };
}

/** Firma estable del borrador completo (campos + líneas todavía sin escribir).
 *  Se compara contra la firma del borrador INICIAL, no contra "está vacío":
 *  reabrir un gasto viejo y clickear afuera sin tocar nada no es un cambio, y
 *  abrir el editor con datos precargados tampoco. */
const draftSig = (d: DraftFields, lines: PendingLine[]) =>
  JSON.stringify([
    d.name,
    d.amount,
    d.currency,
    d.categoryId,
    d.merchantId,
    d.accountId,
    d.goalId,
    d.spentOn,
    d.note,
    d.recurrence,
    lines.map((l) => [
      l.name,
      l.quantity,
      l.unitPrice,
      l.ingredientId,
      l.presentationId,
      l.baseQuantity,
      l.addToStock,
    ]),
  ]);

interface Props {
  mode: "edit" | "create";
  expenseId?: string;
  prefill?: {
    amount?: number;
    categoryId?: string | null;
    spentOn?: string;
    note?: string;
    accountId?: string | null;
    goalId?: string | null;
  };
  onClose: () => void;
}

export function ExpenseEditor({ mode, expenseId, prefill, onClose }: Props) {
  const qc = useQueryClient();
  const expensesQ = useExpenses();
  const categoriesQ = useExpenseCategories();
  const accountsQ = useAccounts();
  const merchantsQ = useMerchants();
  const ingredientsQ = useIngredients();
  const presentationsQ = useIngredientPresentations();
  const finSettingsQ = useFinanzasSettings();
  const expenses = expensesQ.data ?? [];
  const categories = useMemo(
    () => (categoriesQ.data ?? []).filter((c) => !c.archived),
    [categoriesQ.data],
  );
  // `allMerchants` incluye los archivados: siguen siendo el "dónde" de gastos
  // viejos, así que hay que poder resolver su nombre aunque ya no se ofrezcan.
  const allMerchants = useMemo(() => merchantsQ.data ?? [], [merchantsQ.data]);
  const merchants = useMemo(
    () => allMerchants.filter((m) => !m.archived),
    [allMerchants],
  );
  const ingredients = ingredientsQ.data ?? [];
  const presentations = presentationsQ.data ?? [];
  // Cuentas que pagan gastos; si ninguna tiene la capacidad, mostrar todas.
  const accounts = useMemo(() => {
    const active = (accountsQ.data ?? []).filter((a) => !a.archived);
    const paying = active.filter((a) => a.paysExpenses);
    return paying.length > 0 ? paying : active;
  }, [accountsQ.data]);

  const create = useCreateExpense();
  const patchMut = usePatchExpense();
  const remove = useDeleteExpense();
  const createMerchant = useCreateMerchant();
  const lineItemsQ = useExpenseLineItems();
  const createLineItem = useCreateExpenseLineItem();
  const patchLineItem = usePatchExpenseLineItem();
  const deleteLineItem = useDeleteExpenseLineItem();
  const { openExpenseCategoryManager, openMerchantManager } = useApp();

  // Las mutaciones de líneas de queries.ts sólo invalidan `expense_line_items`,
  // pero desde 0043 una línea también mueve la despensa (repo/local.ts), así que
  // hay que refrescarla a mano o el stock se ve viejo hasta el próximo refetch.
  const invalidateStock = () => qc.invalidateQueries({ queryKey: ["inventory"] });

  const ratesPerUsd: Record<string, number> = useMemo(
    () => ({
      USD: 1,
      DKK: finSettingsQ.data?.ratesPerUsd.DKK ?? DEFAULT_RATES_PER_USD.DKK,
      EUR: finSettingsQ.data?.ratesPerUsd.EUR ?? DEFAULT_RATES_PER_USD.EUR,
      ARS: finSettingsQ.data?.ratesPerUsd.ARS ?? DEFAULT_RATES_PER_USD.ARS,
    }),
    [finSettingsQ.data],
  );

  const allLineItems = lineItemsQ.data ?? [];
  const expLineItems = useMemo(
    () => allLineItems.filter((li) => li.expenseId === expenseId && !li.deletedAt),
    [allLineItems, expenseId],
  );

  // El historial excluye las líneas de ESTE gasto: "prom. 3m" tiene que decir
  // cuánto salía ANTES de esta compra, no mezclarse con ella.
  const history = useMemo(
    () =>
      buildPriceHistory(
        allLineItems.filter((li) => li.expenseId !== expenseId),
        expenses,
        ratesPerUsd,
      ),
    [allLineItems, expenseId, expenses, ratesPerUsd],
  );

  const existing = mode === "edit" && expenseId
    ? expenses.find((e) => e.id === expenseId)
    : undefined;

  const [draft, setDraft] = useState<DraftFields>(() => {
    if (existing) return fromExpense(existing);
    const prefillAccount = prefill?.accountId
      ? (accountsQ.data ?? []).find((a) => a.id === prefill.accountId)
      : null;
    return {
      name: prefill?.note ?? "",
      amount: prefill?.amount ?? 0,
      currency: (prefillAccount?.currency as AccountCurrency) ?? (CURRENCY as AccountCurrency),
      categoryId: prefill?.categoryId ?? null,
      merchantId: null,
      accountId: prefill?.accountId ?? null,
      goalId: prefill?.goalId ?? null,
      spentOn: prefill?.spentOn ?? todayYmd(),
      note: "",
      recurrence: null,
    };
  });
  const [amountText, setAmountText] = useState<string>(() =>
    draft.amount > 0 ? draft.amount.toString().replace(".", ",") : "",
  );
  const [pendingLines, setPendingLines] = useState<PendingLine[]>([]);
  // Línea base contra la que se mide "hay cambios sin guardar". Arranca con el
  // borrador inicial (el del gasto en edit, el precargado en create) y se
  // reemplaza junto con el borrador cuando el gasto termina de cargar.
  const [baseSig, setBaseSig] = useState<string>(() => draftSig(draft, []));

  useEffect(() => {
    if (existing) {
      const next = fromExpense(existing);
      setDraft(next);
      setAmountText(existing.amount > 0 ? existing.amount.toString().replace(".", ",") : "");
      setBaseSig(draftSig(next, []));
    }
  }, [existing]);

  const set = (patch: Partial<DraftFields>) => setDraft((d) => ({ ...d, ...patch }));

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const isBusy = create.isPending || patchMut.isPending || remove.isPending || saving;

  // ---------- líneas ----------
  const rows: RowView[] = useMemo(
    () =>
      mode === "edit"
        ? expLineItems.map((li) => ({
            key: li.id,
            name: li.name,
            quantity: li.quantity,
            unitPrice: li.unitPrice,
            baseQuantity: li.baseQuantity,
            ingredientId: li.ingredientId,
            addToStock: li.addToStock,
          }))
        : pendingLines.map((p) => ({
            key: p.key,
            name: p.name,
            quantity: p.quantity,
            unitPrice: p.unitPrice,
            baseQuantity: p.baseQuantity,
            ingredientId: p.ingredientId,
            addToStock: p.addToStock,
          })),
    [mode, expLineItems, pendingLines],
  );
  const liTotal = rows.reduce((sum, r) => sum + r.quantity * r.unitPrice, 0);
  // Aviso suave, nunca bloqueante: un resto sin detallar es legítimo (comprás
  // veinte cosas y sólo cargás las cuatro que te interesa seguir de precio).
  const remainder = draft.amount - liTotal;
  const showRemainder = rows.length > 0 && Math.abs(remainder) > 0.005;

  const [liIngredientId, setLiIngredientId] = useState<string | null>(null);
  const [liPresentationId, setLiPresentationId] = useState<string | null>(null);
  const [liQty, setLiQty] = useState("1");
  const [liUnitRaw, setLiUnitRaw] = useState("");
  const [liPrice, setLiPrice] = useState("");
  const [liAddToStock, setLiAddToStock] = useState(true);

  const liIngredient = useMemo(
    () => ingredients.find((i) => i.id === liIngredientId) ?? null,
    [ingredients, liIngredientId],
  );
  const liDim: Dimension = liIngredient?.dimension ?? "count";
  const liPresentations = useMemo(
    () => presentations.filter((p) => p.ingredientId === liIngredientId),
    [presentations, liIngredientId],
  );
  const liPresentation = useMemo(
    () => liPresentations.find((p) => p.id === liPresentationId) ?? null,
    [liPresentations, liPresentationId],
  );
  // "package" con tamaño = se cuentan paquetes; todo lo demás (bulk, o un
  // ingrediente sin variantes) se carga por cantidad + total pagado.
  const byPackage = liPresentation?.kind === "package" && liPresentation.size > 0;
  const liUnits = unitOptions(liDim);
  const liUnit = liUnits.some((u) => u.unit === liUnitRaw)
    ? liUnitRaw
    : (liUnits[0]?.unit ?? "u");

  const pickIngredient = (id: string | null) => {
    setLiIngredientId(id);
    // Autoseleccionar la primera variante: casi todos los ingredientes tienen una
    // sola y obligar a un click extra por línea no aporta nada.
    const first = id ? presentations.find((p) => p.ingredientId === id) : undefined;
    setLiPresentationId(first?.id ?? null);
    setLiQty("1");
    setLiPrice("");
    setLiAddToStock(true);
  };

  const resetAddRow = () => {
    setLiIngredientId(null);
    setLiPresentationId(null);
    setLiQty("1");
    setLiPrice("");
    setLiAddToStock(true);
  };

  /** La línea que se agregaría con lo tipeado ahora, o null si falta algo.
   *  Preserva el invariante `quantity × unitPrice = total de la línea`:
   *   - paquete: quantity = cuántos paquetes, unitPrice = precio del paquete;
   *   - granel : quantity = 1, unitPrice = total pagado, y la cantidad real va
   *              entera en baseQuantity. */
  const addDraft = useMemo(() => {
    if (!liIngredient) return null;
    const amount = parseQuantity(liQty);
    const price = parseMoney(liPrice);
    if (amount === null || amount <= 0 || price === null || price <= 0) return null;
    const name = liPresentation ? `${liIngredient.name} (${liPresentation.label})` : liIngredient.name;
    if (byPackage && liPresentation) {
      return {
        name,
        quantity: amount,
        unitPrice: price,
        baseQuantity: amount * liPresentation.size,
        ingredientId: liIngredient.id,
        presentationId: liPresentation.id,
      };
    }
    return {
      name,
      quantity: 1,
      unitPrice: price,
      baseQuantity: toBase(amount, liUnit),
      ingredientId: liIngredient.id,
      presentationId: liPresentation?.id ?? null,
    };
  }, [liIngredient, liPresentation, byPackage, liQty, liPrice, liUnit]);

  /** Precio de esta línea por unidad base vs. el histórico. Todo en CURRENCY:
   *  comparar un precio en EUR contra un promedio en DKK no dice nada. */
  const comparison = useMemo(() => {
    if (!addDraft || addDraft.baseQuantity <= 0) return null;
    const totalInCurrency = convertViaUsd(
      addDraft.quantity * addDraft.unitPrice,
      draft.currency,
      CURRENCY,
      ratesPerUsd,
    );
    const nowPerBase = totalInCurrency / addDraft.baseQuantity;
    const entries = history.get(addDraft.ingredientId) ?? [];
    return {
      nowPerBase,
      avg: avgPriceLast3Months(entries, todayYmd()),
      cheapest: cheapestMerchant(entries),
    };
  }, [addDraft, draft.currency, ratesPerUsd, history]);

  const addLineItem = async () => {
    if (!addDraft) return;
    if (mode === "create") {
      setPendingLines((prev) => [
        ...prev,
        { key: crypto.randomUUID(), ...addDraft, addToStock: liAddToStock },
      ]);
      resetAddRow();
      return;
    }
    if (!expenseId) return;
    try {
      await createLineItem.mutateAsync({
        expenseId,
        ...addDraft,
        addToStock: liAddToStock,
      });
      invalidateStock();
      resetAddRow();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo agregar la línea");
    }
  };

  const toggleRowStock = async (row: RowView) => {
    if (mode === "create") {
      setPendingLines((prev) =>
        prev.map((p) => (p.key === row.key ? { ...p, addToStock: !p.addToStock } : p)),
      );
      return;
    }
    try {
      await patchLineItem.mutateAsync({ id: row.key, patch: { addToStock: !row.addToStock } });
      invalidateStock();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo actualizar la línea");
    }
  };

  const removeRow = async (row: RowView) => {
    if (mode === "create") {
      setPendingLines((prev) => prev.filter((p) => p.key !== row.key));
      return;
    }
    try {
      await deleteLineItem.mutateAsync(row.key);
      invalidateStock();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo borrar la línea");
    }
  };

  // ---------- guardar ----------
  const withTimeout = <T,>(p: Promise<T>): Promise<T> =>
    Promise.race([
      p,
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("Timeout — reintentá si sigue pasando")), 10_000)),
    ]);

  const save = async () => {
    if (draft.amount <= 0 || saving) return; // require positive amount
    setSaving(true);
    setError(null);
    try {
      if (mode === "edit" && existing) {
        await withTimeout(
          patchMut.mutateAsync({
            id: existing.id,
            patch: {
              name: draft.name,
              amount: draft.amount,
              currency: draft.currency,
              categoryId: draft.categoryId,
              merchantId: draft.merchantId,
              accountId: draft.accountId,
              goalId: draft.goalId,
              spentOn: draft.spentOn,
              note: draft.note,
              recurrence: draft.recurrence,
            },
          }),
        );
      } else {
        const created = await withTimeout(
          create.mutateAsync({
            name: draft.name,
            amount: draft.amount,
            currency: draft.currency,
            categoryId: draft.categoryId,
            merchantId: draft.merchantId,
            accountId: draft.accountId,
            goalId: draft.goalId,
            spentOn: draft.spentOn,
            note: draft.note,
            recurrence: draft.recurrence,
            recurrenceParentId: null,
          }),
        );
        // Las líneas del borrador se escriben recién ahora, que ya hay un id de
        // gasto. Cada create dispara el alta de stock en el repo.
        for (const line of pendingLines) {
          await withTimeout(
            createLineItem.mutateAsync({
              expenseId: created.id,
              name: line.name,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              ingredientId: line.ingredientId,
              presentationId: line.presentationId,
              baseQuantity: line.baseQuantity,
              addToStock: line.addToStock,
            }),
          );
        }
        if (pendingLines.length > 0) invalidateStock();
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (saving) return;
    if (mode === "edit" && existing) {
      setSaving(true);
      setError(null);
      try {
        await withTimeout(remove.mutateAsync(existing.id));
        invalidateStock(); // el borrado cascadea a las líneas y a sus lotes
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo borrar");
        setSaving(false);
      }
    } else {
      onClose();
    }
  };

  // ---------- salir sin guardar ----------
  // El backdrop GUARDABA en mousedown: clickear el gris para "salir" de un gasto
  // a medio cargar lo escribía (y desde 0043 también movía la despensa). Ahora
  // cierra, y sólo pregunta si de verdad hay algo que se perdería.
  const isDirty = draftSig(draft, pendingLines) !== baseSig;

  const requestClose = () => {
    if (
      isDirty &&
      !window.confirm("Hay cambios sin guardar en este gasto. ¿Cerrar y descartarlos?")
    ) {
      return;
    }
    onClose();
  };

  // El listener de Escape se registra una sola vez; `requestClose` se rearma en
  // cada render (depende del borrador), así que se lee por ref.
  const requestCloseRef = useRef(requestClose);
  requestCloseRef.current = requestClose;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onBackdropMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) requestClose();
  };

  // Un comercio archivado que ya está elegido tiene que seguir apareciendo en el
  // picker: si no, un gasto viejo se ve "sin comercio" aunque lo tenga.
  const selectedMerchant = draft.merchantId
    ? allMerchants.find((m) => m.id === draft.merchantId) ?? null
    : null;
  const merchantOptions =
    selectedMerchant?.archived ? [selectedMerchant, ...merchants] : merchants;

  const isRecurring = draft.recurrence !== null;
  const isRecurringExisting = mode === "edit" && existing && existing.recurrenceParentId !== null;

  const numInput: CSSProperties = {
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
    fontSize: s(13),
    padding: `${s(6)} ${s(8)}`,
  };

  return (
    <div className="modal-backdrop" onMouseDown={onBackdropMouseDown}>
      <div className="modal" style={{ width: "calc(var(--home-s, 1) * 480px)" }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span style={{ flex: 1, fontSize: s(15), fontWeight: 600, letterSpacing: "-0.01em" }}>
            {mode === "edit" ? "Edit expense" : "New expense"}
            {isRecurring || isRecurringExisting ? (
              <span
                style={{
                  fontSize: s(10.5),
                  color: "var(--accent)",
                  marginLeft: s(8),
                  fontWeight: 500,
                  textTransform: "uppercase",
                  letterSpacing: ".05em",
                }}
              >
                <IRecurring size={10} style={{ width: s(10), height: s(10) }} /> Recurring
              </span>
            ) : null}
          </span>
          <button className="icon-btn" onClick={onClose} title="Close">
            <IX size={14} style={{ width: s(14), height: s(14) }} />
          </button>
        </div>

        <div className="modal-body">
          <div className="field">
            <label>Name</label>
            <input
              type="text"
              className="input"
              placeholder="e.g. Compra semanal, Netflix…"
              value={draft.name}
              onChange={(e) => set({ name: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter") save(); }}
            />
          </div>

          <div className="field">
            <label>Comercio</label>
            <div style={{ display: "flex", flexDirection: "column", gap: s(4), minWidth: 0 }}>
              <EntityPicker
                items={merchantOptions}
                value={draft.merchantId}
                onChange={(id) => {
                  const m = id ? merchants.find((x) => x.id === id) : null;
                  // El nombre del gasto venía haciendo de comercio (su placeholder
                  // era literalmente "Rema 1000, Netflix…"). Ahora se completa solo,
                  // pero NUNCA pisa algo que el usuario haya tipeado.
                  set({ merchantId: id, ...(m && draft.name.trim() === "" ? { name: m.name } : {}) });
                }}
                getId={(m) => m.id}
                getLabel={(m) => m.name}
                placeholder="¿Dónde lo compraste?"
                allowCreate
                onCreate={async (name) => {
                  const m = await createMerchant.mutateAsync({ name });
                  if (draft.name.trim() === "") set({ name: m.name });
                  return m.id;
                }}
                emptyHint="Sin comercios todavía — escribí uno para crearlo."
              />
              {/* Renombrar / archivar / fusionar comercios. El backdrop de acá
                  CIERRA en mousedown, así que el evento se corta igual que en el
                  resto del editor. El manager se monta como HERMANO del editor
                  (App.tsx), no como hijo: abrirlo no lo cierra. */}
              <button
                type="button"
                onMouseDown={stopMouse}
                onClick={(e) => {
                  e.stopPropagation();
                  openMerchantManager();
                }}
                style={{
                  alignSelf: "flex-start",
                  fontSize: s(10.5),
                  color: "var(--fg-subtle)",
                  textTransform: "none",
                  letterSpacing: 0,
                  fontWeight: 500,
                  padding: `${s(2)} ${s(6)}`,
                  background: "none",
                  border: "1px solid var(--line)",
                  borderRadius: s(5),
                  cursor: "pointer",
                }}
              >
                Gestionar
              </button>
            </div>
          </div>

          <div className="field">
            <label>Amount</label>
            <div className="control" style={{ alignItems: "stretch" }}>
              <input
                type="text"
                inputMode="decimal"
                autoFocus
                placeholder="0,00"
                value={amountText}
                onChange={(e) => {
                  const text = e.target.value;
                  setAmountText(text);
                  const parsed = parseMoney(text);
                  if (parsed !== null && parsed >= 0) set({ amount: parsed });
                  else if (text === "") set({ amount: 0 });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") save();
                }}
                className="input"
                style={{
                  width: s(140),
                  fontVariantNumeric: "tabular-nums",
                  textAlign: "right",
                  fontSize: s(18),
                  fontWeight: 600,
                }}
              />
              <select
                className="input"
                style={{ width: "auto", alignSelf: "center" }}
                value={draft.currency}
                onChange={(e) => set({ currency: e.target.value as AccountCurrency })}
                title="Moneda en la que pagaste (puede diferir de la cuenta)"
              >
                {CURRENCY_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              {draft.amount > 0 && (
                <span
                  style={{
                    alignSelf: "center",
                    fontSize: s(11),
                    color: "var(--fg-subtle)",
                    marginLeft: "auto",
                  }}
                >
                  = {fmtMoneyIn(draft.amount, draft.currency)}
                </span>
              )}
            </div>
          </div>

          <div className="field">
            <label>Category</label>
            <div className="control">
              {categories.length === 0 && (
                <span style={{ fontSize: s(12), color: "var(--fg-subtle)" }}>
                  No categories yet —{" "}
                  <button
                    type="button"
                    onMouseDown={stopMouse}
                    onClick={(e) => {
                      e.stopPropagation();
                      openExpenseCategoryManager();
                    }}
                    style={{
                      background: "none",
                      border: 0,
                      padding: 0,
                      color: "var(--accent)",
                      cursor: "pointer",
                      font: "inherit",
                    }}
                  >
                    add one
                  </button>
                </span>
              )}
              {categories.map((c) => {
                const colors = colorsForHue(c.hue);
                const active = draft.categoryId === c.id;
                return (
                  <span
                    key={c.id}
                    className={`pill-select ${active ? "active" : ""}`}
                    style={
                      active
                        ? { background: colors.bg, color: colors.fg, borderColor: "transparent" }
                        : undefined
                    }
                    onClick={() => set({ categoryId: c.id })}
                  >
                    <span
                      className="swatch"
                      style={{
                        background: colors.bg,
                        border: "1px solid color-mix(in srgb, var(--fg) 6%, transparent)",
                      }}
                    />
                    {c.name}
                  </span>
                );
              })}
              {categories.length > 0 && (
                <button
                  type="button"
                  onMouseDown={stopMouse}
                  onClick={(e) => {
                    e.stopPropagation();
                    openExpenseCategoryManager();
                  }}
                  style={{
                    fontSize: s(10.5),
                    color: "var(--fg-subtle)",
                    textTransform: "none",
                    letterSpacing: 0,
                    fontWeight: 500,
                    padding: `${s(2)} ${s(6)}`,
                    background: "none",
                    border: "1px solid var(--line)",
                    borderRadius: s(5),
                    cursor: "pointer",
                  }}
                >
                  Manage
                </button>
              )}
            </div>
          </div>

          {accounts.length > 0 && (
            <div className="field">
              <label>Cuenta</label>
              <div className="control">
                <select
                  className="input"
                  style={{ width: "auto" }}
                  value={draft.accountId ?? ""}
                  onChange={(e) => {
                    const accountId = e.target.value || null;
                    const account = accountId ? accounts.find((a) => a.id === accountId) : null;
                    set({ accountId, ...(account ? { currency: account.currency } : {}) });
                  }}
                >
                  <option value="">(ninguna)</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} · {a.currency}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="field">
            <label>Date</label>
            <div className="control">
              <DateInput
                className="input"
                style={{ width: "auto" }}
                value={draft.spentOn}
                onChange={(v) => set({ spentOn: v })}
              />
            </div>
          </div>

          <div className="field">
            <label>Repeats</label>
            <RecurrencePicker
              value={draft.recurrence}
              onChange={(recurrence) => set({ recurrence })}
            />
          </div>

          <div className="field">
            <label>Note</label>
            <input
              type="text"
              className="input"
              placeholder="Optional…"
              value={draft.note}
              onChange={(e) => set({ note: e.target.value })}
            />
          </div>

          {/* ---------- Items ----------
              Sin texto libre: una línea es siempre "un ingrediente del catálogo".
              Un gasto que no es de super (Netflix, alquiler) simplemente no tiene
              líneas, que ya era válido. Y funciona en modo "create": antes había
              que guardar y reabrir el gasto para poder cargar los items. */}
          <div className="field">
            <label>
              Items{rows.length > 0 && ` · ${fmtMoneyIn(liTotal, draft.currency)}`}
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: s(6) }}>
              {rows.map((row) => {
                const total = row.quantity * row.unitPrice;
                return (
                  <div
                    key={row.key}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto auto auto",
                      gap: s(8),
                      alignItems: "center",
                      fontSize: s(12.5),
                      color: "var(--fg-muted)",
                    }}
                  >
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {row.name}
                      <span style={{ color: "var(--fg-subtle)" }}>
                        {" "}· {row.quantity}× {fmtMoneyIn(row.unitPrice, draft.currency)}
                      </span>
                    </span>
                    <span
                      style={{ color: "var(--fg)", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}
                    >
                      {fmtMoneyIn(total, draft.currency)}
                    </span>
                    <label
                      onMouseDown={stopMouse}
                      onClick={stopMouse}
                      title="Sumar a la despensa"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: s(4),
                        fontSize: s(11),
                        color: row.addToStock ? "var(--accent)" : "var(--fg-subtle)",
                        cursor: row.ingredientId ? "pointer" : "not-allowed",
                        opacity: row.ingredientId ? 1 : 0.45,
                        whiteSpace: "nowrap",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={row.addToStock}
                        disabled={!row.ingredientId}
                        onMouseDown={stopMouse}
                        onChange={() => void toggleRowStock(row)}
                        style={{ width: s(12), height: s(12), accentColor: "var(--accent)", margin: 0 }}
                      />
                      despensa
                    </label>
                    <button
                      className="icon-btn"
                      style={{ color: "var(--fg-subtle)" }}
                      onMouseDown={stopMouse}
                      onClick={(e) => {
                        e.stopPropagation();
                        void removeRow(row);
                      }}
                      title="Remove"
                    >
                      <ITrash size={12} style={{ width: s(12), height: s(12) }} />
                    </button>
                  </div>
                );
              })}

              {/* --- fila de alta --- */}
              <div
                onMouseDown={stopMouse}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: s(6),
                  padding: s(8),
                  border: "1px solid var(--line)",
                  borderRadius: s(8),
                  background: "var(--bg-elev)",
                }}
              >
                <EntityPicker
                  items={ingredients}
                  value={liIngredientId}
                  onChange={pickIngredient}
                  getId={(i) => i.id}
                  getLabel={(i) => i.name}
                  placeholder="Agregar ingrediente…"
                  emptyHint="Todavía no hay ingredientes en el catálogo."
                />

                {liIngredient && liPresentations.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: s(4) }}>
                    {liPresentations.map((p) => (
                      <span
                        key={p.id}
                        className={`pill-select ${p.id === liPresentationId ? "active" : ""}`}
                        style={{ fontSize: s(11.5) }}
                        onMouseDown={stopMouse}
                        onClick={(e) => {
                          e.stopPropagation();
                          setLiPresentationId(p.id === liPresentationId ? null : p.id);
                        }}
                      >
                        {p.label}
                        {p.kind === "bulk" ? " · granel" : ""}
                      </span>
                    ))}
                  </div>
                )}

                {liIngredient && (
                  <div style={{ display: "flex", gap: s(6), alignItems: "center" }}>
                    <input
                      type="text"
                      inputMode="decimal"
                      className="input"
                      placeholder={byPackage ? "Cant." : "Cantidad"}
                      value={liQty}
                      onChange={(e) => setLiQty(e.target.value)}
                      onMouseDown={stopMouse}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === "Enter") void addLineItem();
                      }}
                      style={{ ...numInput, width: s(64) }}
                    />
                    {byPackage ? (
                      <span style={{ fontSize: s(11.5), color: "var(--fg-subtle)", whiteSpace: "nowrap" }}>
                        × paquete
                      </span>
                    ) : (
                      <select
                        className="input"
                        value={liUnit}
                        onMouseDown={stopMouse}
                        onChange={(e) => setLiUnitRaw(e.target.value)}
                        style={{ width: "auto", fontSize: s(12.5), padding: `${s(6)} ${s(8)}` }}
                      >
                        {liUnits.map((u) => (
                          <option key={u.unit} value={u.unit}>
                            {u.label}
                          </option>
                        ))}
                      </select>
                    )}
                    <input
                      type="text"
                      inputMode="decimal"
                      className="input"
                      placeholder={byPackage ? "Precio c/u" : "Total pagado"}
                      value={liPrice}
                      onChange={(e) => setLiPrice(e.target.value)}
                      onMouseDown={stopMouse}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === "Enter") void addLineItem();
                      }}
                      style={{ ...numInput, flex: 1, minWidth: s(80) }}
                    />
                    <button
                      className="btn ghost"
                      onMouseDown={stopMouse}
                      onClick={(e) => {
                        e.stopPropagation();
                        void addLineItem();
                      }}
                      disabled={!addDraft}
                      style={{
                        whiteSpace: "nowrap",
                        fontSize: s(12),
                        padding: `${s(6)} ${s(10)}`,
                        opacity: addDraft ? 1 : 0.5,
                      }}
                    >
                      Agregar
                    </button>
                  </div>
                )}

                {/* La comparación con el histórico es el punto entero de todo esto. */}
                {comparison && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: s(6), fontSize: s(11.5), alignItems: "baseline" }}>
                    <span style={{ color: "var(--fg)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                      {fmtMoneyIn(perDisplayUnit(comparison.nowPerBase, liDim), CURRENCY)}/
                      {priceUnitLabel(liDim)}
                    </span>
                    {comparison.avg ? (
                      <>
                        <span style={{ color: "var(--fg-subtle)" }}>·</span>
                        <span style={{ color: "var(--fg-muted)", fontVariantNumeric: "tabular-nums" }}>
                          prom. 3m {fmtMoneyIn(perDisplayUnit(comparison.avg.avg, liDim), CURRENCY)}/
                          {priceUnitLabel(liDim)}
                        </span>
                        {/* Sin la cantidad de muestras, un "promedio" de una sola
                            compra se lee como si fuera autoridad. */}
                        <span style={{ color: "var(--fg-subtle)" }}>
                          ({comparison.avg.samples === 1 ? "1 compra" : `${comparison.avg.samples} compras`})
                        </span>
                        {comparison.avg.avg > 0 && (
                          <span
                            style={{
                              fontWeight: 600,
                              color:
                                comparison.nowPerBase > comparison.avg.avg
                                  ? "var(--danger)"
                                  : "var(--ok)",
                            }}
                          >
                            {comparison.nowPerBase >= comparison.avg.avg ? "+" : ""}
                            {Math.round(
                              ((comparison.nowPerBase - comparison.avg.avg) / comparison.avg.avg) * 100,
                            )}
                            %
                          </span>
                        )}
                      </>
                    ) : (
                      <span style={{ color: "var(--fg-subtle)" }}>primera compra registrada</span>
                    )}
                    {comparison.cheapest?.merchantId && (
                      <span style={{ color: "var(--fg-subtle)", width: "100%" }}>
                        más barato en{" "}
                        {allMerchants.find((m) => m.id === comparison.cheapest?.merchantId)?.name ??
                          "otro comercio"}{" "}
                        · {fmtMoneyIn(perDisplayUnit(comparison.cheapest.price, liDim), CURRENCY)}/
                        {priceUnitLabel(liDim)}
                      </span>
                    )}
                  </div>
                )}

                {liIngredient && (
                  <label
                    onMouseDown={stopMouse}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: s(6),
                      fontSize: s(12),
                      color: "var(--fg-muted)",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={liAddToStock}
                      onMouseDown={stopMouse}
                      onChange={(e) => setLiAddToStock(e.target.checked)}
                      style={{ width: s(13), height: s(13), accentColor: "var(--accent)", margin: 0 }}
                    />
                    sumar a la despensa
                  </label>
                )}
              </div>

              {showRemainder && (
                <div style={{ fontSize: s(11.5), color: "var(--fg-subtle)" }}>
                  Las líneas suman {fmtMoneyIn(liTotal, draft.currency)} y el gasto es{" "}
                  {fmtMoneyIn(draft.amount, draft.currency)} —{" "}
                  {remainder > 0
                    ? `quedan ${fmtMoneyIn(remainder, draft.currency)} sin detallar.`
                    : `te pasaste por ${fmtMoneyIn(-remainder, draft.currency)}.`}
                </div>
              )}
            </div>
          </div>

          {error && (
            <div style={{ fontSize: s(12), color: "var(--danger)" }}>{error}</div>
          )}
        </div>

        <div className="modal-foot">
          {mode === "edit" ? (
            <button className="btn ghost danger" onClick={onDelete} disabled={isBusy}>
              <ITrash size={12} style={{ width: s(12), height: s(12) }} /> Delete
            </button>
          ) : (
            <span />
          )}
          <div className="actions">
            <button className="btn ghost" onClick={onClose} disabled={isBusy}>
              Cancel
            </button>
            <button
              className="btn primary"
              onClick={save}
              disabled={draft.amount <= 0 || isBusy}
              style={draft.amount <= 0 ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
            >
              <ICheck size={12} stroke={2.4} style={{ width: s(12), height: s(12) }} /> Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
