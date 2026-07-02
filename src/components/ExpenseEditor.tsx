import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { colorsForHue } from "../lib/categoryColor";
import { CURRENCY, fmtMoney, fmtMoneyIn, parseMoney } from "../lib/money";
import {
  useAccounts,
  useCreateExpense,
  useCreateExpenseLineItem,
  useDeleteExpense,
  useDeleteExpenseLineItem,
  useExpenseCategories,
  useExpenseLineItems,
  useExpenses,
  usePatchExpense,
} from "../lib/queries";
import { useApp } from "../lib/store";
import type { AccountCurrency, Expense, RecurrenceRule } from "../types";
import { ICheck, IRecurring, ITrash, IX } from "./icons";
import { RecurrencePicker } from "./RecurrencePicker";

const CURRENCY_OPTIONS: AccountCurrency[] = ["DKK", "USD", "EUR", "ARS"];

interface DraftFields {
  name: string;
  amount: number;
  currency: AccountCurrency;
  categoryId: string | null;
  accountId: string | null;
  goalId: string | null;
  spentOn: string;
  note: string;
  recurrence: RecurrenceRule | null;
}

function fromExpense(e: Expense): DraftFields {
  return {
    name: e.name,
    amount: e.amount,
    currency: (e.currency as AccountCurrency) ?? CURRENCY,
    categoryId: e.categoryId,
    accountId: e.accountId,
    goalId: e.goalId,
    spentOn: e.spentOn,
    note: e.note,
    recurrence: e.recurrence,
  };
}

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
  const expensesQ = useExpenses();
  const categoriesQ = useExpenseCategories();
  const accountsQ = useAccounts();
  const expenses = expensesQ.data ?? [];
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

  const create = useCreateExpense();
  const patchMut = usePatchExpense();
  const remove = useDeleteExpense();
  const lineItemsQ = useExpenseLineItems();
  const createLineItem = useCreateExpenseLineItem();
  const deleteLineItem = useDeleteExpenseLineItem();
  const { openExpenseCategoryManager } = useApp();

  const expLineItems = (lineItemsQ.data ?? []).filter(
    (li) => li.expenseId === expenseId && !li.deletedAt,
  );
  const liTotal = expLineItems.reduce((s, li) => s + li.quantity * li.unitPrice, 0);

  const [liName, setLiName] = useState("");
  const [liQty, setLiQty] = useState("1");
  const [liPrice, setLiPrice] = useState("");

  const addLineItem = () => {
    if (!expenseId) return;
    const name = liName.trim();
    const qty = parseFloat(liQty.replace(",", "."));
    const price = parseMoney(liPrice);
    if (!name || isNaN(qty) || qty <= 0 || price === null || price <= 0) return;
    createLineItem.mutate({ expenseId, name, quantity: qty, unitPrice: price });
    setLiName("");
    setLiQty("1");
    setLiPrice("");
  };

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
      accountId: prefill?.accountId ?? null,
      goalId: prefill?.goalId ?? null,
      spentOn: prefill?.spentOn ?? new Date().toISOString().slice(0, 10),
      note: "",
      recurrence: null,
    };
  });
  const [amountText, setAmountText] = useState<string>(() =>
    draft.amount > 0 ? draft.amount.toString().replace(".", ",") : "",
  );

  useEffect(() => {
    if (existing) {
      setDraft(fromExpense(existing));
      setAmountText(existing.amount > 0 ? existing.amount.toString().replace(".", ",") : "");
    }
  }, [existing]);

  const set = (patch: Partial<DraftFields>) => setDraft((d) => ({ ...d, ...patch }));

  const save = () => {
    if (draft.amount <= 0) return; // require positive amount
    if (mode === "edit" && existing) {
      patchMut.mutate({
        id: existing.id,
        patch: {
          name: draft.name,
          amount: draft.amount,
          currency: draft.currency,
          categoryId: draft.categoryId,
          accountId: draft.accountId,
          goalId: draft.goalId,
          spentOn: draft.spentOn,
          note: draft.note,
          recurrence: draft.recurrence,
        },
      });
    } else {
      create.mutate({
        name: draft.name,
        amount: draft.amount,
        currency: draft.currency,
        categoryId: draft.categoryId,
        accountId: draft.accountId,
        goalId: draft.goalId,
        spentOn: draft.spentOn,
        note: draft.note,
        recurrence: draft.recurrence,
        recurrenceParentId: null,
      });
    }
    onClose();
  };

  const onDelete = () => {
    if (mode === "edit" && existing) {
      remove.mutate(existing.id);
    }
    onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onBackdropMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) save();
  };

  const isRecurring = draft.recurrence !== null;
  const isRecurringExisting = mode === "edit" && existing && existing.recurrenceParentId !== null;

  return (
    <div className="modal-backdrop" onMouseDown={onBackdropMouseDown}>
      <div className="modal" style={{ width: 480 }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span style={{ flex: 1, fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" }}>
            {mode === "edit" ? "Edit expense" : "New expense"}
            {isRecurring || isRecurringExisting ? (
              <span
                style={{
                  fontSize: 10.5,
                  color: "var(--accent)",
                  marginLeft: 8,
                  fontWeight: 500,
                  textTransform: "uppercase",
                  letterSpacing: ".05em",
                }}
              >
                <IRecurring size={10} /> Recurring
              </span>
            ) : null}
          </span>
          <button className="icon-btn" onClick={onClose} title="Close">
            <IX size={14} />
          </button>
        </div>

        <div className="modal-body">
          <div className="field">
            <label>Name</label>
            <input
              type="text"
              className="input"
              placeholder="e.g. Rema 1000, Netflix…"
              value={draft.name}
              onChange={(e) => set({ name: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter") save(); }}
            />
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
                  width: 140,
                  fontVariantNumeric: "tabular-nums",
                  textAlign: "right",
                  fontSize: 18,
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
                    fontSize: 11,
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
                <span style={{ fontSize: 12, color: "var(--fg-subtle)" }}>
                  No categories yet —{" "}
                  <button
                    type="button"
                    onClick={openExpenseCategoryManager}
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
                      style={{ background: colors.bg, border: "1px solid rgba(0,0,0,0.06)" }}
                    />
                    {c.name}
                  </span>
                );
              })}
              {categories.length > 0 && (
                <button
                  type="button"
                  onClick={openExpenseCategoryManager}
                  style={{
                    fontSize: 10.5,
                    color: "var(--fg-subtle)",
                    textTransform: "none",
                    letterSpacing: 0,
                    fontWeight: 500,
                    padding: "2px 6px",
                    background: "none",
                    border: "1px solid var(--line)",
                    borderRadius: 5,
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
              <input
                type="date"
                className="input"
                style={{ width: "auto" }}
                value={draft.spentOn}
                onChange={(e) => set({ spentOn: e.target.value })}
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

          {mode === "edit" && (
            <div className="field">
              <label>Items{expLineItems.length > 0 && ` · ${fmtMoney(liTotal)}`}</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {expLineItems.map((li) => (
                  <div
                    key={li.id}
                    style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto auto", gap: 8, alignItems: "center", fontSize: 12.5, color: "var(--fg-muted)" }}
                  >
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{li.name}</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{li.quantity}×</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtMoney(li.unitPrice)}</span>
                    <span style={{ color: "var(--fg)", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>= {fmtMoney(li.quantity * li.unitPrice)}</span>
                    <button
                      className="icon-btn"
                      style={{ color: "var(--fg-subtle)" }}
                      onClick={() => deleteLineItem.mutate(li.id)}
                      title="Remove"
                    >
                      <ITrash size={12} />
                    </button>
                  </div>
                ))}
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 2 }}>
                  <input
                    type="text"
                    className="input"
                    placeholder="Item name"
                    value={liName}
                    onChange={(e) => setLiName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") addLineItem(); }}
                    style={{ flex: 1 }}
                  />
                  <input
                    type="text"
                    inputMode="decimal"
                    className="input"
                    placeholder="Qty"
                    value={liQty}
                    onChange={(e) => setLiQty(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") addLineItem(); }}
                    style={{ width: 52, textAlign: "right" }}
                  />
                  <span style={{ fontSize: 11, color: "var(--fg-subtle)" }}>×</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="input"
                    placeholder="Price"
                    value={liPrice}
                    onChange={(e) => setLiPrice(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") addLineItem(); }}
                    style={{ width: 80, textAlign: "right" }}
                  />
                  <button className="btn ghost" onClick={addLineItem} style={{ whiteSpace: "nowrap" }}>
                    Add
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="modal-foot">
          {mode === "edit" ? (
            <button className="btn ghost danger" onClick={onDelete}>
              <ITrash size={12} /> Delete
            </button>
          ) : (
            <span />
          )}
          <div className="actions">
            <button className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn primary"
              onClick={save}
              disabled={draft.amount <= 0}
              style={draft.amount <= 0 ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
            >
              <ICheck size={12} stroke={2.4} /> Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
