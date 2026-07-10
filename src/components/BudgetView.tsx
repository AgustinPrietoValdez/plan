import { useEffect, useMemo, useRef, useState } from "react";
import { colorsForHue } from "../lib/categoryColor";
import { useSession } from "../lib/auth";
import { fromYmd, shiftMonth } from "../lib/date";
import { CURRENCY, convertViaUsd, DEFAULT_RATES_PER_USD, fmtMoney, fmtMoneyIn, parseMoney } from "../lib/money";
import { formatRule } from "../lib/recurrence";
import { useMaterializeRecurringExpenses } from "../lib/materializeRecurringExpenses";
import {
  useAccounts,
  useAccountTransfers,
  useBudgets,
  useDeleteAccountTransfer,
  useDeleteExpense,

  useExpenseCategories,
  useExpenseLineItems,
  useExpenses,
  useFinanzasSettings,
  useIncomes,
  usePatchExpense,
  usePatchExpenseCategory,
  usePatchSavingsGoal,
  useSavingsContributions,
  useSavingsGoals,
  useUpsertIncome,
  useUpsertSavingsContribution,
} from "../lib/queries";
import { effectivePercent, overflowPercent as computeOverflowPercent } from "../lib/savingsAllocation";
import { useApp } from "../lib/store";
import type {
  Account,
  AccountTransfer,
  Expense,
  ExpenseCategory,
  ExpenseLineItem,
  SavingsGoal,
} from "../types";
import { KIND_LABEL, TransferModal } from "./finanzas/TransferModal";
import { ICheck, IChevD, IChevL, IChevR, IChevU, IPlus, IRecurring, ITrash } from "./icons";
import { SpendingPie } from "./SpendingPie";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function ymToLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

function expenseInMonth(e: Expense, yyyymm: string): boolean {
  return e.spentOn.slice(0, 7) === yyyymm;
}


// ── Inline expense row (collapsible — read-only info, edit via modal) ─────────
function InlineExpenseRow({
  expense,
  categories,
  lineItems,
  expanded,
  onToggle,
  onEdit,
  onDelete,
}: {
  expense: Expense;
  categories: ExpenseCategory[];
  lineItems: ExpenseLineItem[];
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const cat = expense.categoryId ? categories.find((c) => c.id === expense.categoryId) ?? null : null;
  const colors = cat ? colorsForHue(cat.hue) : { bg: "var(--bg-sunken)", fg: "var(--fg-muted)" };
  const date = fromYmd(expense.spentOn);
  const displayName = expense.name || expense.note || cat?.name || "Untitled";
  const expLineItems = lineItems.filter((li) => li.expenseId === expense.id && !li.deletedAt);
  const liTotal = expLineItems.reduce((s, li) => s + li.quantity * li.unitPrice, 0);

  return (
    <div style={{ background: "var(--bg-elev)", border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden" }}>
      {/* Header */}
      <div
        onClick={onToggle}
        style={{ display: "grid", gridTemplateColumns: "44px 8px 1fr auto auto", gap: 10, alignItems: "center", padding: "8px 10px", cursor: "pointer" }}
      >
        <span style={{ fontSize: 10.5, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
          {date.toLocaleDateString("da-DK", { day: "2-digit", month: "short" })}
        </span>
        <span style={{ width: 8, height: 8, borderRadius: 2, background: colors.bg }} />
        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{displayName}</span>
            {expense.recurrence && <IRecurring size={11} stroke={2} />}
          </div>
          {expLineItems.length > 0 && (
            <span style={{ fontSize: 10, color: "var(--fg-subtle)" }}>
              {expLineItems.length} item{expLineItems.length > 1 ? "s" : ""} · {fmtMoney(liTotal)}
            </span>
          )}
        </div>
        <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" }}>
          {fmtMoneyIn(expense.amount, expense.currency)}
        </span>
        {expanded ? <IChevU size={12} /> : <IChevD size={12} />}
      </div>

      {/* Expanded — read-only */}
      {expanded && (
        <div
          style={{ borderTop: "1px solid var(--line)", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Note */}
          <div>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600, color: "var(--fg-subtle)", marginBottom: 3 }}>Note</div>
            {expense.note
              ? <p style={{ margin: 0, fontSize: 12, color: "var(--fg-muted)", lineHeight: 1.4 }}>{expense.note}</p>
              : <p style={{ margin: 0, fontSize: 12, color: "var(--fg-subtle)", fontStyle: "italic" }}>No note</p>
            }
          </div>

          {/* Items */}
          <div>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600, color: "var(--fg-subtle)", marginBottom: 3 }}>
              Items{expLineItems.length > 0 && ` · ${fmtMoney(liTotal)}`}
            </div>
            {expLineItems.length === 0
              ? <p style={{ margin: 0, fontSize: 12, color: "var(--fg-subtle)", fontStyle: "italic" }}>No items</p>
              : expLineItems.map((li) => (
                  <div key={li.id} style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 8, alignItems: "center", fontSize: 12, color: "var(--fg-muted)", padding: "2px 0" }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{li.name}</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{li.quantity}×</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtMoney(li.unitPrice)}</span>
                    <span style={{ color: "var(--fg)", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>= {fmtMoney(li.quantity * li.unitPrice)}</span>
                  </div>
                ))
            }
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 6, paddingTop: 4, borderTop: "1px solid var(--line)" }}>
            <button className="btn ghost" style={{ padding: "4px 10px", fontSize: 11 }} onClick={onEdit}>Edit</button>
            <button className="btn ghost danger" style={{ padding: "4px 10px", fontSize: 11, marginLeft: "auto" }} onClick={onDelete}>Delete</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Recurring section (unchanged logic, visual update) ────────────────────────
function RecurringSection({
  expenses,
  categories,
  onEdit,
  onPause,
}: {
  expenses: Expense[];
  categories: ExpenseCategory[];
  onEdit: (e: Expense) => void;
  onPause: (e: Expense) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: ".05em",
          fontWeight: 600,
          color: "var(--fg-muted)",
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 4,
        }}
      >
        <IRecurring size={11} stroke={2} /> Recurring · {expenses.length}
      </div>
      {expenses.map((e) => {
        const c = e.categoryId ? categories.find((c) => c.id === e.categoryId) ?? null : null;
        const cols = c ? colorsForHue(c.hue) : { bg: "var(--bg-sunken)" };
        return (
          <div
            key={e.id}
            onClick={() => onEdit(e)}
            style={{
              display: "grid",
              gridTemplateColumns: "10px 1fr auto auto",
              gap: 10,
              alignItems: "center",
              padding: "8px 12px",
              background: "var(--bg-elev)",
              border: "1px solid var(--line)",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            <span style={{ width: 10, height: 10, borderRadius: 3, background: cols.bg }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {e.name || e.note || c?.name || "Untitled"}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--fg-muted)", fontVariantNumeric: "tabular-nums" }}>
                {e.recurrence ? formatRule(e.recurrence) : ""} · next {e.spentOn}
              </div>
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
              {fmtMoneyIn(e.amount, e.currency)}
            </span>
            <button
              className="btn ghost"
              style={{ padding: "4px 8px", fontSize: 11.5 }}
              onClick={(ev) => { ev.stopPropagation(); onPause(e); }}
              title="Stop generating future instances"
            >
              Pause
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ── Income input ──────────────────────────────────────────────────────────────
// ── Per-account income row ────────────────────────────────────────────────────
function AccountIncomeRow({
  account,
  amount,
  onSave,
}: {
  account: Account;
  amount: number;
  onSave: (amount: number) => void;
}) {
  const [text, setText] = useState<string>(amount > 0 ? amount.toString().replace(".", ",") : "");
  useEffect(() => {
    setText(amount > 0 ? amount.toString().replace(".", ",") : "");
  }, [account.id, amount]);

  const commit = () => {
    const parsed = parseMoney(text);
    const next = parsed === null || parsed < 0 ? 0 : parsed;
    if (next !== amount) onSave(next);
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ flex: 1, fontSize: 12.5, color: "var(--fg-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {account.name}
      </span>
      <input
        type="text"
        inputMode="decimal"
        placeholder="0,00"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        className="input"
        style={{ width: 100, fontVariantNumeric: "tabular-nums", textAlign: "right", padding: "4px 8px", fontSize: 12.5 }}
      />
      <span style={{ fontSize: 11, color: "var(--fg-subtle)", width: 28 }}>{account.currency}</span>
    </div>
  );
}

// ── Income-by-account section ─────────────────────────────────────────────────
function IncomeByAccountSection({
  accounts,
  incomeByAccountId,
  onSave,
}: {
  accounts: Account[];
  incomeByAccountId: Record<string, number>;
  onSave: (account: Account, amount: number) => void;
}) {
  if (accounts.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600, color: "var(--fg-muted)" }}>
        Ingresos por cuenta
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {accounts.map((a) => (
          <AccountIncomeRow
            key={a.id}
            account={a}
            amount={incomeByAccountId[a.id] ?? 0}
            onSave={(amount) => onSave(a, amount)}
          />
        ))}
      </div>
    </div>
  );
}

// ── Savings % editor (only active goals — el resto del ciclo de vida vive en Ahorros) ──
function GoalMonthRow({
  goal,
  overflowPct,
  leftover,
  onPatchPercent,
  onToggleOverflow,
}: {
  goal: SavingsGoal;
  overflowPct: number;
  leftover: number;
  onPatchPercent: (pct: number) => void;
  onToggleOverflow: () => void;
}) {
  const eff = effectivePercent(goal, overflowPct);
  const allocated = leftover > 0 ? (eff / 100) * leftover : 0;
  const [pctText, setPctText] = useState(goal.savingsPercent.toString());
  useEffect(() => setPctText(goal.savingsPercent.toString()), [goal.id, goal.savingsPercent]);
  const commitPct = () => {
    const val = parseInt(pctText, 10);
    if (!isNaN(val) && val >= 0 && val <= 100) {
      if (val !== goal.savingsPercent) onPatchPercent(val);
    } else {
      setPctText(goal.savingsPercent.toString());
    }
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 122px 70px", gap: 8, alignItems: "center", padding: "6px 8px", background: "var(--bg-elev)", border: goal.priority ? "1px solid var(--danger)" : "1px solid var(--line)", borderRadius: 8 }}>
      <span style={{ fontSize: 12.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: goal.priority ? "var(--danger)" : "var(--fg)" }}>
        {goal.name}
        {goal.isOverflowTarget && <span style={{ marginLeft: 6, fontSize: 9, color: "var(--ok)", textTransform: "uppercase" }}>overflow</span>}
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <input
          type="text"
          inputMode="numeric"
          value={pctText}
          onChange={(e) => setPctText(e.target.value)}
          onBlur={commitPct}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          className="input"
          style={{ width: 40, textAlign: "right", padding: "3px 5px", fontSize: 11.5 }}
        />
        <span style={{ fontSize: 10.5, color: "var(--fg-muted)" }}>%</span>
        <button className="btn ghost" style={{ width: 58, padding: "1px 0", fontSize: 9.5, textAlign: "center" }} onClick={onToggleOverflow}>
          {goal.isOverflowTarget ? "unset" : "overflow"}
        </button>
      </div>
      <span style={{ fontSize: 11.5, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: "var(--fg-muted)", textAlign: "right" }}>
        {fmtMoney(allocated, { compact: true })}
      </span>
    </div>
  );
}

// ── Pending savings transfers, grouped by destination account (one real transfer
// can cover several goals sharing an account) — marks green once done this month ──
function PendingTransferRow({
  accountName,
  goalNames,
  amount,
  done,
  onTransfer,
}: {
  accountName: string;
  goalNames: string[];
  amount: number;
  done: boolean;
  onTransfer: () => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: "var(--bg-elev)", border: "1px solid var(--line)", borderRadius: 8 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {accountName}
        </div>
        <div style={{ fontSize: 10.5, color: "var(--fg-subtle)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {goalNames.join(", ")}
        </div>
      </div>
      {done ? (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--ok)", fontWeight: 600, whiteSpace: "nowrap" }}>
          <ICheck size={12} stroke={2.4} /> {fmtMoney(amount, { compact: true })}
        </span>
      ) : (
        <button className="btn ghost" style={{ fontSize: 11, whiteSpace: "nowrap" }} onClick={onTransfer}>
          Transferir {fmtMoney(amount, { compact: true })}
        </button>
      )}
    </div>
  );
}

// ── Transfers section (recent movements for the month) ────────────────────────
function TransfersSection({
  month,
  transfers,
  accounts,
  onAdd,
  onDelete,
}: {
  month: string;
  transfers: AccountTransfer[];
  accounts: Account[];
  onAdd: () => void;
  onDelete: (id: string) => void;
}) {
  const nameOf = (id: string | null) => (id ? accounts.find((a) => a.id === id)?.name ?? "—" : "—");
  const monthTransfers = transfers.filter((t) => t.transferredOn.slice(0, 7) === month && !t.deletedAt);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600, color: "var(--fg-muted)" }}>
          Transferencias
        </span>
        <button className="btn ghost" style={{ marginLeft: "auto", padding: "2px 8px", fontSize: 11 }} onClick={onAdd}>
          <IPlus size={11} /> Nueva
        </button>
      </div>
      {monthTransfers.length === 0 ? (
        <div style={{ padding: "12px", textAlign: "center", fontSize: 12, color: "var(--fg-subtle)", border: "1px dashed var(--line)", borderRadius: 8 }}>
          Sin transferencias este mes.
        </div>
      ) : (
        monthTransfers.map((t) => (
          <div
            key={t.id}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto auto",
              gap: 10,
              alignItems: "center",
              padding: "8px 10px",
              background: "var(--bg-elev)",
              border: "1px solid var(--line)",
              borderRadius: 8,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {nameOf(t.fromAccountId)} → {nameOf(t.toAccountId)}
              </div>
              <div style={{ fontSize: 10.5, color: "var(--fg-subtle)" }}>
                {KIND_LABEL[t.kind]} · {t.transferredOn}
              </div>
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
              {fmtMoneyIn(t.amount, t.currency)}
            </span>
            <button className="icon-btn" style={{ color: "var(--fg-subtle)" }} onClick={() => onDelete(t.id)} title="Borrar">
              <ITrash size={12} />
            </button>
          </div>
        ))
      )}
    </div>
  );
}

// ── Main BudgetView ───────────────────────────────────────────────────────────
export function BudgetView() {
  const { session } = useSession();
  const userId = session?.user.id;
  useMaterializeRecurringExpenses(userId);

  const expensesQ = useExpenses();
  const categoriesQ = useExpenseCategories();
  const budgetsQ = useBudgets();
  const lineItemsQ = useExpenseLineItems();
  const patchExpense = usePatchExpense();
  const patchExpenseCategory = usePatchExpenseCategory();
  const deleteExpense = useDeleteExpense();

  const expenses = expensesQ.data ?? [];
  const categories = useMemo(
    () => (categoriesQ.data ?? []).filter((c) => !c.archived),
    [categoriesQ.data],
  );
  const budgets = budgetsQ.data ?? [];
  const lineItems = lineItemsQ.data ?? [];

  const goalsQ = useSavingsGoals();
  const incomesQ = useIncomes();
  const accountsQ = useAccounts();
  const transfersQ = useAccountTransfers();
  const finSettingsQ = useFinanzasSettings();
  const upsertIncome = useUpsertIncome();
  const patchGoal = usePatchSavingsGoal();
  const deleteTransfer = useDeleteAccountTransfer();
  const goals = useMemo(() => goalsQ.data ?? [], [goalsQ.data]);
  const incomes = useMemo(() => incomesQ.data ?? [], [incomesQ.data]);
  const transfers = useMemo(() => transfersQ.data ?? [], [transfersQ.data]);
  const allAccounts = useMemo(() => (accountsQ.data ?? []).filter((a) => !a.archived), [accountsQ.data]);
  // Capability-driven account lists; fall back to all if none has the capability.
  const incomeAccounts = useMemo(() => {
    const r = allAccounts.filter((a) => a.receivesIncome);
    return r.length > 0 ? r : allAccounts;
  }, [allAccounts]);

  // Presupuesto/Ahorros work in the app's nominal CURRENCY (DKK) — Holdings' user-selectable
  // baseCurrency is a separate concept (net worth display only). We still need live rates to
  // convert any income entered in another currency into DKK before summing.
  const ratesPerUsd: Record<string, number> = {
    USD: 1,
    DKK: finSettingsQ.data?.ratesPerUsd.DKK ?? DEFAULT_RATES_PER_USD.DKK,
    EUR: finSettingsQ.data?.ratesPerUsd.EUR ?? DEFAULT_RATES_PER_USD.EUR,
    ARS: finSettingsQ.data?.ratesPerUsd.ARS ?? DEFAULT_RATES_PER_USD.ARS,
  };

  const [showTransferModal, setShowTransferModal] = useState(false);

  const {
    budgetMonth,
    setBudgetMonth,
    openExpenseCreate,
    openExpenseEdit,
    openBudgetManager,
    openExpenseCategoryManager,
  } = useApp();

  const [filterCategoryId, setFilterCategoryId] = useState<string | null>(null);
  const [expandedExpenseId, setExpandedExpenseId] = useState<string | null>(null);

  // Keep the pie at ~40% of the column height at all times; the rest of the height
  // goes to the legend (beside it) and the expenses list below.
  const leftColRef = useRef<HTMLDivElement | null>(null);
  const [leftColH, setLeftColH] = useState<number | null>(null);
  useEffect(() => {
    const el = leftColRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setLeftColH(entries[0].contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const pieSizePx = leftColH != null ? leftColH * 0.40 : undefined;

  const monthExpenses = useMemo(
    () => expenses.filter((e) => expenseInMonth(e, budgetMonth) && !e.deletedAt),
    [expenses, budgetMonth],
  );
  // Expenses can be entered in any currency now (EUR/ARS/USD against a DKK account, etc.) —
  // convert each to nominal DKK before summing/charting, same as incomes.
  // Hidden categories (hiddenFromChart) don't count toward the header totals either —
  // hiding one shrinks both totalSpent and totalBudget, not just the pie arcs.
  const totalSpent = monthExpenses
    .filter((e) => !categories.find((c) => c.id === e.categoryId)?.hiddenFromChart)
    .reduce((s, e) => s + convertViaUsd(e.amount, e.currency, CURRENCY, ratesPerUsd), 0);
  const monthExpensesForPie = useMemo(
    () => monthExpenses.map((e) => ({ ...e, amount: convertViaUsd(e.amount, e.currency, CURRENCY, ratesPerUsd), currency: CURRENCY })),
    [monthExpenses, ratesPerUsd],
  );
  const totalBudget = budgets
    .filter((b) => !categories.find((c) => c.id === b.categoryId)?.hiddenFromChart)
    .reduce((s, b) => s + b.monthlyAmount, 0);
  const pctUsed = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;
  // Incomes are now per (month, account). Total = sum of all incomes for the
  // month, converted to the Finanzas base currency so mixed-currency incomes
  // add up correctly (old months' legacy "general" no-account income still counts).
  const monthIncomes = useMemo(
    () => incomes.filter((i) => i.month === budgetMonth && !i.deletedAt),
    [incomes, budgetMonth],
  );
  const incomeAmount = monthIncomes.reduce(
    (s, i) => s + convertViaUsd(i.amount, i.currency, CURRENCY, ratesPerUsd),
    0,
  );
  const incomeByAccountId = useMemo(() => {
    const map: Record<string, number> = {};
    for (const i of monthIncomes) if (i.accountId) map[i.accountId] = i.amount;
    return map;
  }, [monthIncomes]);
  const leftover = incomeAmount - totalSpent;

  // Savings allocation (only goals active in Presupuesto — inactive ones are
  // managed in Ahorros but excluded from the % split). Orden pedido: primero sin
  // objetivo, despues prioridad, y el resto en el orden de Ahorros (position).
  const activeGoals = useMemo(() => {
    const rank = (g: SavingsGoal) => (g.targetAmount === null ? 0 : g.priority ? 1 : 2);
    return goals
      .filter((g) => g.active && !g.purchasedAt && !g.deletedAt)
      .sort((a, b) => rank(a) - rank(b) || a.position - b.position);
  }, [goals]);
  const overflowPercent = computeOverflowPercent(activeGoals);
  const totalAllocated = leftover > 0
    ? activeGoals.reduce((s, g) => s + (effectivePercent(g, overflowPercent) / 100) * leftover, 0)
    : 0;

  // This month's savings target per active goal (% of leftover), and what's already
  // been recorded for it this month via savings_contributions (see Ahorros/TransferModal —
  // one real bank transfer can cover several goals sharing a destination account).
  const contributionsQ = useSavingsContributions();
  const contributions = useMemo(() => contributionsQ.data ?? [], [contributionsQ.data]);
  const goalMonthTarget = useMemo(() => {
    return activeGoals.map((g) => {
      const target = leftover > 0 ? (effectivePercent(g, overflowPercent) / 100) * leftover : 0;
      const contributedThisMonth = contributions.find((c) => c.goalId === g.id && c.month === budgetMonth && !c.deletedAt)?.amount ?? 0;
      const destAccount = g.destinationAccountId ? allAccounts.find((a) => a.id === g.destinationAccountId) ?? null : null;
      return { goal: g, target, contributedThisMonth, destAccount };
    });
  }, [activeGoals, leftover, overflowPercent, contributions, budgetMonth, allAccounts]);

  // Group by destination account: one real transfer can cover several goals at once.
  const pendingByAccount = useMemo(() => {
    const byAccount = new Map<string, { account: Account; goals: { goal: SavingsGoal; target: number }[]; contributed: number }>();
    for (const { goal, target, contributedThisMonth, destAccount } of goalMonthTarget) {
      if (!destAccount || target <= 1) continue;
      const entry = byAccount.get(destAccount.id) ?? { account: destAccount, goals: [], contributed: 0 };
      entry.goals.push({ goal, target });
      entry.contributed += contributedThisMonth;
      byAccount.set(destAccount.id, entry);
    }
    return [...byAccount.values()].map((e) => ({
      ...e,
      totalTarget: e.goals.reduce((s, g) => s + g.target, 0),
    }));
  }, [goalMonthTarget]);

  const upsertContribution = useUpsertSavingsContribution();
  const [goalTransfer, setGoalTransfer] = useState<{
    toId: string;
    amount: number;
    goalId?: string;
    goals: { goal: SavingsGoal; target: number }[];
  } | null>(null);

  const recurringActive = useMemo(() => {
    const byRoot = new Map<string, Expense>();
    for (const e of expenses) {
      if (!e.recurrence || e.deletedAt) continue;
      const root = e.recurrenceParentId ?? e.id;
      const prev = byRoot.get(root);
      if (!prev || prev.spentOn < e.spentOn) byRoot.set(root, e);
    }
    return [...byRoot.values()].sort((a, b) => a.spentOn.localeCompare(b.spentOn));
  }, [expenses]);

  const filteredExpenses = filterCategoryId
    ? monthExpenses.filter((e) => e.categoryId === filterCategoryId)
    : monthExpenses;

  const onPauseRecurring = (e: Expense) => {
    patchExpense.mutate({ id: e.id, patch: { recurrence: null } });
  };

  return (
    <div className="day-view-main">
      {/* Header */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          paddingBottom: 8,
          borderBottom: "1px solid var(--line)",
          minHeight: 84,
          boxSizing: "border-box",
        }}
      >
        <div>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--fg-subtle)", fontWeight: 600 }}>
            Budget
          </div>
          <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>
            {ymToLabel(budgetMonth)}
          </div>
          <div
            style={{
              marginTop: 8,
              display: "flex",
              alignItems: "center",
              gap: 12,
              fontSize: 12,
              color: "var(--fg-muted)",
              flexWrap: "wrap",
            }}
          >
            <span>
              <span style={{ color: "var(--fg)", fontWeight: 600 }}>{fmtMoney(totalSpent)}</span>{" "}
              spent{totalBudget > 0 && <> of {fmtMoney(totalBudget)} ({pctUsed}%)</>}
            </span>
            {incomeAmount > 0 && (
              <>
                <span style={{ color: "var(--line-strong)" }}>·</span>
                {leftover >= 0 ? (
                  <span>
                    <span
                      style={{
                        color: "var(--fg)",
                        fontWeight: 600,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {fmtMoney(leftover)}
                    </span>{" "}
                    leftover
                  </span>
                ) : (
                  <span style={{ color: "var(--danger)", fontWeight: 600 }}>
                    no leftover
                  </span>
                )}
                {totalAllocated > 0 && (
                  <>
                    <span style={{ color: "var(--line-strong)" }}>·</span>
                    <span>
                      <span style={{ color: "var(--ok)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                        {fmtMoney(totalAllocated)}
                      </span>{" "}
                      to savings
                    </span>
                  </>
                )}
              </>
            )}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <button className="icon-btn" onClick={() => setBudgetMonth(shiftMonth(budgetMonth, -1))} title="Previous month">
          <IChevL size={15} />
        </button>
        <button className="icon-btn" onClick={() => setBudgetMonth(shiftMonth(budgetMonth, 1))} title="Next month">
          <IChevR size={15} />
        </button>
        <button className="btn" onClick={() => openExpenseCreate({ spentOn: new Date().toISOString().slice(0, 10) })}>
          <IPlus size={12} /> Expense
        </button>
        <button className="btn ghost" onClick={openBudgetManager}>Edit budgets</button>
        <button className="btn ghost" onClick={openExpenseCategoryManager}>Categories</button>
      </header>

      {/* Main grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 380px",
          gap: 24,
          flex: 1,
          minHeight: 0,
        }}
      >
        {/* LEFT — spending overview */}
        <div ref={leftColRef} style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0, minHeight: 0 }}>
          {/* Spending pie (row layout: pie beside category legend) */}
          <SpendingPie
            expenses={monthExpensesForPie}
            categories={categories}
            layout="row"
            fill={false}
            sizePx={pieSizePx}
            limit={totalBudget > 0 ? totalBudget : undefined}
            budgets={budgets}
            onToggleHidden={(categoryId) => {
              const cat = categories.find((c) => c.id === categoryId);
              if (cat) patchExpenseCategory.mutate({ id: categoryId, patch: { hiddenFromChart: !cat.hiddenFromChart } });
            }}
            selectedCategoryId={filterCategoryId}
            onSelectCategory={(categoryId) => setFilterCategoryId(filterCategoryId === categoryId ? null : categoryId)}
          />

          {/* Scrollable: expenses + recurring (pie above stays pinned) */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16, flex: 1, minHeight: 120, overflowY: "auto" }}>
          {/* Expenses section */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div
              style={{
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: ".05em",
                fontWeight: 600,
                color: "var(--fg-muted)",
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 4,
              }}
            >
              <span>Expenses · {filteredExpenses.length}</span>
              {filterCategoryId && (
                <button
                  className="btn ghost"
                  style={{ padding: "2px 6px", fontSize: 11 }}
                  onClick={() => setFilterCategoryId(null)}
                >
                  Clear filter
                </button>
              )}
            </div>
            {filteredExpenses.length === 0 && (
              <div
                style={{
                  padding: "20px 12px",
                  textAlign: "center",
                  fontSize: 12,
                  color: "var(--fg-subtle)",
                  border: "1px dashed var(--line)",
                  borderRadius: 8,
                }}
              >
                No expenses to show.
              </div>
            )}
            {filteredExpenses.map((e) => (
              <InlineExpenseRow
                key={e.id}
                expense={e}
                categories={categories}
                lineItems={lineItems}
                expanded={expandedExpenseId === e.id}
                onToggle={() => setExpandedExpenseId(expandedExpenseId === e.id ? null : e.id)}
                onEdit={() => openExpenseEdit(e.id)}
                onDelete={() => {
                  deleteExpense.mutate(e.id);
                  if (expandedExpenseId === e.id) setExpandedExpenseId(null);
                }}
              />
            ))}
          </div>

          {/* Recurring */}
          {recurringActive.length > 0 && (
            <RecurringSection
              expenses={recurringActive}
              categories={categories}
              onEdit={(e) => openExpenseEdit(e.id)}
              onPause={onPauseRecurring}
            />
          )}
          </div>
        </div>

        {/* RIGHT — income (top) + transfers (rest) */}
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, gap: 12 }}>
          {/* Income by account (compact, fixed) */}
          <IncomeByAccountSection
            accounts={incomeAccounts}
            incomeByAccountId={incomeByAccountId}
            onSave={(account, amount) =>
              upsertIncome.mutate({ month: budgetMonth, amount, currency: account.currency, accountId: account.id })
            }
          />

          {/* Savings % editor — top half, scrolls on its own */}
          {activeGoals.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflowY: "auto" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600, color: "var(--fg-muted)" }}>
                  % de ahorro
                </div>
                {goalMonthTarget.map(({ goal }) => (
                  <GoalMonthRow
                    key={goal.id}
                    goal={goal}
                    overflowPct={overflowPercent}
                    leftover={leftover}
                    onPatchPercent={(pct) => patchGoal.mutate({ id: goal.id, patch: { savingsPercent: pct } })}
                    onToggleOverflow={() => patchGoal.mutate({ id: goal.id, patch: { isOverflowTarget: !goal.isOverflowTarget } })}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Transfers — fills the rest, scrolls on its own */}
          <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflowY: "auto", gap: 12 }}>
          {pendingByAccount.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600, color: "var(--fg-muted)" }}>
                Ahorro de este mes
              </div>
              {pendingByAccount.map(({ account, goals: goalsInAccount, contributed, totalTarget }) => (
                <PendingTransferRow
                  key={account.id}
                  accountName={account.name}
                  goalNames={goalsInAccount.map((g) => g.goal.name)}
                  amount={totalTarget}
                  done={contributed >= totalTarget - 1}
                  onTransfer={() =>
                    setGoalTransfer({
                      toId: account.id,
                      amount: totalTarget,
                      goalId: goalsInAccount.length === 1 ? goalsInAccount[0].goal.id : undefined,
                      goals: goalsInAccount,
                    })
                  }
                />
              ))}
            </div>
          )}
          <TransfersSection
            month={budgetMonth}
            transfers={transfers}
            accounts={allAccounts}
            onAdd={() => setShowTransferModal(true)}
            onDelete={(id) => deleteTransfer.mutate(id)}
          />
          </div>
        </div>
      </div>

      {showTransferModal && (
        <TransferModal
          defaultDate={`${budgetMonth}-15`}
          accounts={allAccounts}
          goals={activeGoals}
          onClose={() => setShowTransferModal(false)}
        />
      )}

      {goalTransfer && (
        <TransferModal
          defaultDate={`${budgetMonth}-15`}
          accounts={allAccounts}
          goals={activeGoals}
          initialKind="savings"
          initialGoalId={goalTransfer.goalId}
          initialToId={goalTransfer.toId}
          initialAmount={goalTransfer.amount}
          onSaved={() => {
            // Una transferencia real puede cubrir varios goals de la misma cuenta —
            // se registra el aporte de cada uno para el progreso individual.
            for (const { goal, target } of goalTransfer.goals) {
              upsertContribution.mutate({ goalId: goal.id, month: budgetMonth, amount: target });
            }
          }}
          onClose={() => setGoalTransfer(null)}
        />
      )}
    </div>
  );
}
