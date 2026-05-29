import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { colorsForHue } from "../lib/categoryColor";
import { CURRENCY, fmtMoney, parseMoney } from "../lib/money";
import {
  useCreateExpense,
  useDeleteExpense,
  useExpenseCategories,
  useExpenses,
  usePatchExpense,
} from "../lib/queries";
import { useApp } from "../lib/store";
import type { Expense, RecurrenceRule } from "../types";
import { ICheck, IRecurring, ITrash, IX } from "./icons";
import { RecurrencePicker } from "./RecurrencePicker";

interface DraftFields {
  amount: number;
  categoryId: string | null;
  spentOn: string;
  note: string;
  recurrence: RecurrenceRule | null;
}

function fromExpense(e: Expense): DraftFields {
  return {
    amount: e.amount,
    categoryId: e.categoryId,
    spentOn: e.spentOn,
    note: e.note,
    recurrence: e.recurrence,
  };
}

interface Props {
  mode: "edit" | "create";
  expenseId?: string;
  prefill?: { amount?: number; categoryId?: string | null; spentOn?: string; note?: string };
  onClose: () => void;
}

export function ExpenseEditor({ mode, expenseId, prefill, onClose }: Props) {
  const expensesQ = useExpenses();
  const categoriesQ = useExpenseCategories();
  const expenses = expensesQ.data ?? [];
  const categories = useMemo(
    () => (categoriesQ.data ?? []).filter((c) => !c.archived),
    [categoriesQ.data],
  );

  const create = useCreateExpense();
  const patchMut = usePatchExpense();
  const remove = useDeleteExpense();
  const { openExpenseCategoryManager } = useApp();

  const existing = mode === "edit" && expenseId
    ? expenses.find((e) => e.id === expenseId)
    : undefined;

  const [draft, setDraft] = useState<DraftFields>(() => {
    if (existing) return fromExpense(existing);
    return {
      amount: prefill?.amount ?? 0,
      categoryId: prefill?.categoryId ?? null,
      spentOn: prefill?.spentOn ?? new Date().toISOString().slice(0, 10),
      note: prefill?.note ?? "",
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
          amount: draft.amount,
          categoryId: draft.categoryId,
          spentOn: draft.spentOn,
          note: draft.note,
          recurrence: draft.recurrence,
        },
      });
    } else {
      create.mutate({
        amount: draft.amount,
        currency: CURRENCY,
        categoryId: draft.categoryId,
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
              <span
                style={{
                  alignSelf: "center",
                  fontSize: 12,
                  color: "var(--fg-muted)",
                  fontWeight: 600,
                }}
              >
                {CURRENCY}
              </span>
              {draft.amount > 0 && (
                <span
                  style={{
                    alignSelf: "center",
                    fontSize: 11,
                    color: "var(--fg-subtle)",
                    marginLeft: "auto",
                  }}
                >
                  = {fmtMoney(draft.amount)}
                </span>
              )}
            </div>
          </div>

          <div className="field">
            <label
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                paddingRight: 4,
              }}
            >
              <span>Category</span>
              <button
                type="button"
                onClick={openExpenseCategoryManager}
                style={{
                  fontSize: 10.5,
                  color: "var(--fg-subtle)",
                  textTransform: "none",
                  letterSpacing: 0,
                  fontWeight: 500,
                  padding: 0,
                  background: "none",
                  border: 0,
                  cursor: "pointer",
                }}
              >
                Manage
              </button>
            </label>
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
            </div>
          </div>

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
