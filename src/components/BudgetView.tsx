import { useEffect, useMemo, useState } from "react";
import { colorsForHue } from "../lib/categoryColor";
import { useSession } from "../lib/auth";
import { shiftMonth } from "../lib/date";
import { CURRENCY, convertViaUsd, DEFAULT_RATES_PER_USD, fmtMoney, fmtMoneyIn, parseMoney } from "../lib/money";
import { formatRule } from "../lib/recurrence";
import { useMaterializeRecurringExpenses } from "../lib/materializeRecurringExpenses";
import { useFrameScale } from "../lib/uiScale";
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

// Mismo frame de diseño 1280×720 (2× a 2560×1440) que Home/Café/Finanzas — `--s`
// lo pone FinanzasView en la raíz y cascadea hasta acá.
function fluid(base: number): string {
  return `calc(var(--s, 2) * ${base}px)`;
}

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function ymToParts(yyyymm: string): { month: string; year: string } {
  const [y, m] = yyyymm.split("-").map(Number);
  return { month: MONTHS[m - 1], year: String(y) };
}

function expenseInMonth(e: Expense, yyyymm: string): boolean {
  return e.spentOn.slice(0, 7) === yyyymm;
}

const sectionLabelStyle = {
  fontSize: fluid(11),
  textTransform: "uppercase" as const,
  letterSpacing: ".05em",
  fontWeight: 600,
  color: "var(--fg-muted)",
};

// `className="input"` alone has no CSS — it's only styled when nested inside a
// `.field` wrapper (see `.field .input` in components.css). These small inline
// inputs live directly in cards, not in `.field`s, so they need their own chrome.
const fieldChrome = {
  border: "1px solid var(--line)",
  background: "var(--bg-elev)",
  borderRadius: fluid(6),
  outline: 0,
};

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
  const [, m, d] = expense.spentOn.split("-");
  const displayName = expense.name || expense.note || cat?.name || "Untitled";
  const expLineItems = lineItems.filter((li) => li.expenseId === expense.id && !li.deletedAt);
  const liTotal = expLineItems.reduce((s, li) => s + li.quantity * li.unitPrice, 0);

  return (
    <div style={{ background: "var(--bg-elev)", border: "1px solid var(--line)", borderRadius: fluid(8), overflow: "hidden" }}>
      {/* Header — same height for every row (single line, no subtitle) */}
      <div
        onClick={onToggle}
        style={{
          display: "grid",
          gridTemplateColumns: `${fluid(46)} ${fluid(10)} 1fr auto ${fluid(14)}`,
          gap: fluid(10), alignItems: "center", padding: `${fluid(9)} ${fluid(12)}`, cursor: "pointer",
        }}
      >
        <span style={{ fontSize: fluid(10), color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
          {d} {MONTHS[Number(m) - 1].slice(0, 3).toLowerCase()}
        </span>
        <span style={{ width: fluid(10), height: fluid(10), borderRadius: 3, background: colors.bg }} />
        <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: fluid(6) }}>
          <span style={{ fontSize: fluid(12.5), fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {displayName}
          </span>
          {expense.recurrence && <IRecurring size={11} stroke={2} />}
        </div>
        <span style={{ fontSize: fluid(12.5), fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
          {fmtMoneyIn(expense.amount, expense.currency)}
        </span>
        <span style={{ color: "var(--fg-subtle)", display: "flex", justifyContent: "center" }}>
          {expanded ? <IChevU size={12} /> : <IChevD size={12} />}
        </span>
      </div>

      {/* Expanded — read-only */}
      {expanded && (
        <div
          style={{ borderTop: "1px solid var(--line)", padding: `${fluid(10)} ${fluid(12)}`, display: "flex", flexDirection: "column", gap: fluid(8) }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Note */}
          <div>
            <div style={{ fontSize: fluid(10), textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600, color: "var(--fg-subtle)", marginBottom: 3 }}>Note</div>
            {expense.note
              ? <p style={{ margin: 0, fontSize: fluid(12), color: "var(--fg-muted)", lineHeight: 1.4 }}>{expense.note}</p>
              : <p style={{ margin: 0, fontSize: fluid(12), color: "var(--fg-subtle)", fontStyle: "italic" }}>No note</p>
            }
          </div>

          {/* Items */}
          <div>
            <div style={{ fontSize: fluid(10), textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600, color: "var(--fg-subtle)", marginBottom: 3 }}>
              Items{expLineItems.length > 0 && ` · ${fmtMoney(liTotal)}`}
            </div>
            {expLineItems.length === 0
              ? <p style={{ margin: 0, fontSize: fluid(12), color: "var(--fg-subtle)", fontStyle: "italic" }}>No items</p>
              : expLineItems.map((li) => (
                  <div key={li.id} style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: fluid(8), alignItems: "center", fontSize: fluid(12), color: "var(--fg-muted)", padding: "2px 0" }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{li.name}</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{li.quantity}×</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtMoney(li.unitPrice)}</span>
                    <span style={{ color: "var(--fg)", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>= {fmtMoney(li.quantity * li.unitPrice)}</span>
                  </div>
                ))
            }
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: fluid(6), paddingTop: fluid(4), borderTop: "1px solid var(--line)" }}>
            <button className="btn ghost" style={{ padding: `${fluid(4)} ${fluid(10)}`, fontSize: fluid(11) }} onClick={onEdit}>Edit</button>
            <button className="btn ghost danger" style={{ padding: `${fluid(4)} ${fluid(10)}`, fontSize: fluid(11), marginLeft: "auto" }} onClick={onDelete}>Delete</button>
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
    <div style={{ display: "flex", flexDirection: "column", gap: fluid(4) }}>
      {/* Sticky, igual que el titulo de Gastos arriba — al llegar acá lo reemplaza. */}
      <div style={{ ...sectionLabelStyle, display: "flex", alignItems: "center", gap: fluid(6), padding: `${fluid(2)} 0`, position: "sticky", top: 0, zIndex: 2, background: "var(--bg)" }}>
        <IRecurring size={11} stroke={2} /> Recurrentes · {expenses.length}
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
              gridTemplateColumns: `${fluid(10)} 1fr auto auto`,
              gap: fluid(10),
              alignItems: "center",
              padding: `${fluid(9)} ${fluid(12)}`,
              background: "var(--bg-elev)",
              border: "1px solid var(--line)",
              borderRadius: fluid(8),
              cursor: "pointer",
            }}
          >
            <span style={{ width: fluid(10), height: fluid(10), borderRadius: 3, background: cols.bg }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: fluid(12.5), fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {e.name || e.note || c?.name || "Untitled"}
              </div>
              <div style={{ fontSize: fluid(11), color: "var(--fg-muted)", fontVariantNumeric: "tabular-nums" }}>
                {e.recurrence ? formatRule(e.recurrence) : ""} · próximo {e.spentOn}
              </div>
            </div>
            <span style={{ fontSize: fluid(12.5), fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
              {fmtMoneyIn(e.amount, e.currency)}
            </span>
            <button
              className="btn ghost"
              style={{ padding: `${fluid(4)} ${fluid(8)}`, fontSize: fluid(11) }}
              onClick={(ev) => { ev.stopPropagation(); onPause(e); }}
              title="Dejar de generar futuras instancias"
            >
              Pausar
            </button>
          </div>
        );
      })}
    </div>
  );
}

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
    <div style={{ display: "flex", alignItems: "center", gap: fluid(8) }}>
      <span style={{ flex: 1, fontSize: fluid(12), color: "var(--fg-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
        style={{ ...fieldChrome, width: fluid(96), fontVariantNumeric: "tabular-nums", textAlign: "right", padding: `${fluid(5)} ${fluid(8)}`, fontSize: fluid(12) }}
      />
      <span style={{ fontSize: fluid(10.5), color: "var(--fg-subtle)", width: fluid(26) }}>{account.currency}</span>
    </div>
  );
}

// ── Income-by-account card ────────────────────────────────────────────────────
function IncomeByAccountCard({
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
    <div style={{ background: "var(--bg-elev)", border: "1px solid var(--line)", borderRadius: fluid(12), padding: fluid(14), boxShadow: "var(--shadow-sm)", display: "flex", flexDirection: "column", gap: fluid(8), flex: "0 0 auto" }}>
      <div style={sectionLabelStyle}>Ingresos por cuenta</div>
      <div style={{ display: "flex", flexDirection: "column", gap: fluid(6) }}>
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

// ── Savings % editor row (only active goals — el resto del ciclo de vida vive en Ahorros) ──
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
    <div style={{
      display: "grid", gridTemplateColumns: "minmax(0,1fr) auto auto", gap: fluid(8), alignItems: "center",
      padding: `${fluid(6)} ${fluid(8)}`, background: "var(--bg-sunken)",
      border: goal.priority ? "1px solid var(--danger)" : "1px solid var(--line)", borderRadius: fluid(8),
    }}>
      <span style={{ fontSize: fluid(12), fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: goal.priority ? "var(--danger)" : "var(--fg)" }}>
        {goal.name}
        {goal.isOverflowTarget && <span style={{ marginLeft: 6, fontSize: fluid(9), color: "var(--ok)", textTransform: "uppercase" }}>overflow</span>}
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: fluid(3) }}>
        <input
          type="text"
          inputMode="numeric"
          value={pctText}
          onChange={(e) => setPctText(e.target.value)}
          onBlur={commitPct}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          className="input"
          style={{ ...fieldChrome, width: fluid(38), textAlign: "right", padding: `${fluid(3)} ${fluid(5)}`, fontSize: fluid(11) }}
        />
        <span style={{ fontSize: fluid(10), color: "var(--fg-muted)" }}>%</span>
        <button className="btn ghost" style={{ width: fluid(58), padding: "1px 0", fontSize: fluid(9.5), textAlign: "center" }} onClick={onToggleOverflow}>
          {goal.isOverflowTarget ? "unset" : "overflow"}
        </button>
      </div>
      <span style={{ fontSize: fluid(11), fontWeight: 600, fontVariantNumeric: "tabular-nums", color: "var(--fg-muted)", textAlign: "right", minWidth: fluid(52) }}>
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
    <div style={{
      display: "grid", gridTemplateColumns: "1fr auto", gap: fluid(10), alignItems: "center",
      padding: `${fluid(9)} ${fluid(11)}`, background: "var(--bg-sunken)", border: "1px solid var(--line)", borderRadius: fluid(8),
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: fluid(12), fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {accountName}
        </div>
        <div style={{ fontSize: fluid(10), color: "var(--fg-subtle)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {goalNames.join(", ")}
        </div>
      </div>
      {done ? (
        <span style={{ display: "inline-flex", alignItems: "center", gap: fluid(4), fontSize: fluid(11), color: "var(--ok)", fontWeight: 600, whiteSpace: "nowrap" }}>
          <ICheck size={12} stroke={2.4} /> {fmtMoney(amount, { compact: true })}
        </span>
      ) : (
        <button className="btn ghost" style={{ fontSize: fluid(11), whiteSpace: "nowrap" }} onClick={onTransfer}>
          Transferir {fmtMoney(amount, { compact: true })}
        </button>
      )}
    </div>
  );
}

// ── Transfers card (recent real movements, "+ Nueva" pinned header) ───────────
function TransfersCard({
  month,
  transfers,
  accounts,
  pendingByAccount,
  onAdd,
  onTransferPending,
  onDelete,
}: {
  month: string;
  transfers: AccountTransfer[];
  accounts: Account[];
  pendingByAccount: { account: Account; goals: { goal: SavingsGoal; target: number }[]; contributed: number; totalTarget: number }[];
  onAdd: () => void;
  onTransferPending: (p: { account: Account; goals: { goal: SavingsGoal; target: number }[]; totalTarget: number }) => void;
  onDelete: (id: string) => void;
}) {
  const nameOf = (id: string | null) => (id ? accounts.find((a) => a.id === id)?.name ?? "—" : "—");
  const monthTransfers = transfers.filter((t) => t.transferredOn.slice(0, 7) === month && !t.deletedAt);

  return (
    <div style={{
      background: "var(--bg-elev)", border: "1px solid var(--line)", borderRadius: fluid(12), padding: fluid(14), boxShadow: "var(--shadow-sm)",
      display: "flex", flexDirection: "column", gap: fluid(8), flex: "1 1 0", minHeight: fluid(140), overflow: "hidden",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: fluid(8), flex: "0 0 auto" }}>
        <span style={sectionLabelStyle}>Transferencias</span>
        <button className="btn ghost" style={{ marginLeft: "auto", padding: `${fluid(2)} ${fluid(8)}`, fontSize: fluid(11) }} onClick={onAdd}>
          <IPlus size={11} /> Nueva
        </button>
      </div>
      <div className="fz-col" style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: fluid(6), paddingRight: fluid(4) }}>
        {pendingByAccount.map((p) => (
          <PendingTransferRow
            key={p.account.id}
            accountName={p.account.name}
            goalNames={p.goals.map((g) => g.goal.name)}
            amount={p.totalTarget}
            done={p.contributed >= p.totalTarget - 1}
            onTransfer={() => onTransferPending(p)}
          />
        ))}
        {monthTransfers.length === 0 && pendingByAccount.length === 0 ? (
          <div style={{ padding: fluid(12), textAlign: "center", fontSize: fluid(12), color: "var(--fg-subtle)", border: "1px dashed var(--line)", borderRadius: fluid(8) }}>
            Sin transferencias este mes.
          </div>
        ) : (
          monthTransfers.map((t) => (
            <div
              key={t.id}
              style={{
                display: "grid", gridTemplateColumns: "1fr auto auto", gap: fluid(10), alignItems: "center",
                padding: `${fluid(9)} ${fluid(11)}`, background: "var(--bg-sunken)", border: "1px solid var(--line)", borderRadius: fluid(8), flex: "0 0 auto",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: fluid(12), fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {nameOf(t.fromAccountId)} → {nameOf(t.toAccountId)}
                </div>
                <div style={{ fontSize: fluid(10), color: "var(--fg-subtle)" }}>
                  {KIND_LABEL[t.kind]} · {t.transferredOn}
                </div>
              </div>
              <span style={{ fontSize: fluid(12.5), fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                {fmtMoneyIn(t.amount, t.currency)}
              </span>
              <button className="icon-btn" style={{ color: "var(--fg-subtle)" }} onClick={() => onDelete(t.id)} title="Borrar">
                <ITrash size={12} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Main BudgetView ───────────────────────────────────────────────────────────
export function BudgetView() {
  const { session } = useSession();
  const userId = session?.user.id;
  useMaterializeRecurringExpenses(userId);
  const s = useFrameScale();

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
    openExpenseEdit,
  } = useApp();

  const [filterCategoryId, setFilterCategoryId] = useState<string | null>(null);
  const [expandedExpenseId, setExpandedExpenseId] = useState<string | null>(null);

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
    patchExpense.mutateAsync({ id: e.id, patch: { recurrence: null } }).catch((err) =>
      window.alert(err instanceof Error ? err.message : "No se pudo pausar"),
    );
  };

  const monthParts = ymToParts(budgetMonth);

  const kpiCards = [
    { label: "Gastado", value: fmtMoney(totalSpent, { compact: true }), sub: totalBudget > 0 ? `${pctUsed}% del presupuesto` : "sin presupuesto", color: "var(--fg)" },
    { label: "Presupuesto", value: fmtMoney(totalBudget, { compact: true }), sub: "límite mensual", color: "var(--fg)" },
    { label: "Sobra", value: fmtMoney(Math.max(0, leftover), { compact: true }), sub: "tras gastos", color: leftover < 0 ? "var(--danger)" : "var(--fg)" },
    { label: "A ahorro", value: fmtMoney(totalAllocated, { compact: true }), sub: "asignado a goals", color: "var(--ok)" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: fluid(12), flex: 1, minHeight: 0 }}>
      {/* KPI cards + month nav */}
      <div style={{ display: "flex", alignItems: "center", gap: fluid(10), flex: "0 0 auto" }}>
        <button className="icon-btn" onClick={() => setBudgetMonth(shiftMonth(budgetMonth, -1))} title="Mes anterior" style={{ width: fluid(26), height: fluid(26) }}>
          <IChevL size={13} />
        </button>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: "0 0 auto", lineHeight: 1.15 }}>
          <span style={{ fontSize: fluid(13.5), fontWeight: 700, letterSpacing: "-0.01em" }}>{monthParts.month}</span>
          <span style={{ fontSize: fluid(10.5), color: "var(--fg-subtle)", fontVariantNumeric: "tabular-nums" }}>{monthParts.year}</span>
        </div>
        <button className="icon-btn" onClick={() => setBudgetMonth(shiftMonth(budgetMonth, 1))} title="Mes siguiente" style={{ width: fluid(26), height: fluid(26) }}>
          <IChevR size={13} />
        </button>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: fluid(12), flex: 1 }}>
          {kpiCards.map((k) => (
            <div key={k.label} style={{ background: "var(--bg-elev)", border: "1px solid var(--line)", borderRadius: fluid(12), padding: `${fluid(12)} ${fluid(14)}`, boxShadow: "var(--shadow-sm)" }}>
              <div style={{ fontSize: fluid(10.5), textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600, color: "var(--fg-subtle)" }}>{k.label}</div>
              <div style={{ fontSize: fluid(20), fontWeight: 600, letterSpacing: "-0.01em", fontVariantNumeric: "tabular-nums", marginTop: fluid(3), color: k.color }}>{k.value}</div>
              <div style={{ fontSize: fluid(10.5), color: "var(--fg-subtle)", marginTop: 1 }}>{k.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Main grid */}
      <div style={{ display: "grid", gridTemplateColumns: `1fr ${fluid(380)}`, gap: fluid(20), flex: 1, minHeight: 0 }}>
        {/* LEFT — spending overview */}
        <div style={{ display: "flex", flexDirection: "column", gap: fluid(12), minWidth: 0, minHeight: 0 }}>
          <div style={{ background: "var(--bg-elev)", border: "1px solid var(--line)", borderRadius: fluid(12), padding: fluid(16), boxShadow: "var(--shadow-sm)", display: "flex", alignItems: "center", gap: fluid(22), flex: "0 0 auto" }}>
            <SpendingPie
              expenses={monthExpensesForPie}
              categories={categories}
              layout="row"
              fill={false}
              sizePx={Math.round(190 * s)}
              limit={totalBudget > 0 ? totalBudget : undefined}
              budgets={budgets}
              centerLabel="gastado"
              onToggleHidden={(categoryId) => {
                const cat = categories.find((c) => c.id === categoryId);
                if (cat) {
                  patchExpenseCategory
                    .mutateAsync({ id: categoryId, patch: { hiddenFromChart: !cat.hiddenFromChart } })
                    .catch((err) => window.alert(err instanceof Error ? err.message : "No se pudo cambiar"));
                }
              }}
              selectedCategoryId={filterCategoryId}
              onSelectCategory={(categoryId) => setFilterCategoryId(filterCategoryId === categoryId ? null : categoryId)}
            />
          </div>

          {/* Scrollable: expenses + recurring (pie above stays pinned) */}
          <div className="fz-col" style={{ display: "flex", flexDirection: "column", gap: fluid(12), flex: 1, minHeight: 0, overflowY: "auto", paddingRight: fluid(4) }}>
            <div style={{ display: "flex", flexDirection: "column", gap: fluid(4) }}>
              {/* Sticky — mientras se scrollea la lista de gastos este titulo queda
                  pegado arriba; al llegar a Recurrentes, su propio titulo lo tapa. */}
              <div style={{ ...sectionLabelStyle, display: "flex", alignItems: "center", gap: fluid(8), padding: `${fluid(2)} 0`, position: "sticky", top: 0, zIndex: 2, background: "var(--bg)" }}>
                <span>Gastos · {filteredExpenses.length}</span>
                {filterCategoryId && (
                  <button className="btn ghost" style={{ padding: `${fluid(2)} ${fluid(6)}`, fontSize: fluid(11) }} onClick={() => setFilterCategoryId(null)}>
                    Quitar filtro
                  </button>
                )}
              </div>
              {filteredExpenses.length === 0 && (
                <div style={{ padding: `${fluid(20)} ${fluid(12)}`, textAlign: "center", fontSize: fluid(12), color: "var(--fg-subtle)", border: "1px dashed var(--line)", borderRadius: fluid(8) }}>
                  Sin gastos para mostrar.
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
                    deleteExpense.mutateAsync(e.id).catch((err) =>
                      window.alert(err instanceof Error ? err.message : "No se pudo borrar"),
                    );
                    if (expandedExpenseId === e.id) setExpandedExpenseId(null);
                  }}
                />
              ))}
            </div>

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

        {/* RIGHT — income (top) + savings % + transfers (rest) */}
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, gap: fluid(12) }}>
          <IncomeByAccountCard
            accounts={incomeAccounts}
            incomeByAccountId={incomeByAccountId}
            onSave={(account, amount) =>
              upsertIncome
                .mutateAsync({ month: budgetMonth, amount, currency: account.currency, accountId: account.id })
                .catch((err) => window.alert(err instanceof Error ? err.message : "No se pudo guardar el ingreso"))
            }
          />

          {activeGoals.length > 0 && (
            <div style={{ background: "var(--bg-elev)", border: "1px solid var(--line)", borderRadius: fluid(12), padding: fluid(14), boxShadow: "var(--shadow-sm)", display: "flex", flexDirection: "column", gap: fluid(6), flex: "0 0 auto" }}>
              <div style={sectionLabelStyle}>% de ahorro</div>
              {/* Cap la lista a ~3 filas visibles y scrollea adentro — asi Transferencias
                  (debajo) no se queda sin espacio cuando hay muchos goals activos. */}
              <div className="fz-col" style={{ display: "flex", flexDirection: "column", gap: fluid(6), maxHeight: fluid(130), overflowY: "auto", paddingRight: fluid(4) }}>
                {goalMonthTarget.map(({ goal }) => (
                  <GoalMonthRow
                    key={goal.id}
                    goal={goal}
                    overflowPct={overflowPercent}
                    leftover={leftover}
                    onPatchPercent={(pct) =>
                      patchGoal.mutateAsync({ id: goal.id, patch: { savingsPercent: pct } }).catch((err) =>
                        window.alert(err instanceof Error ? err.message : "No se pudo guardar"),
                      )
                    }
                    onToggleOverflow={() =>
                      patchGoal
                        .mutateAsync({ id: goal.id, patch: { isOverflowTarget: !goal.isOverflowTarget } })
                        .catch((err) => window.alert(err instanceof Error ? err.message : "No se pudo guardar"))
                    }
                  />
                ))}
              </div>
            </div>
          )}

          <TransfersCard
            month={budgetMonth}
            transfers={transfers}
            accounts={allAccounts}
            pendingByAccount={pendingByAccount}
            onAdd={() => setShowTransferModal(true)}
            onTransferPending={(p) =>
              setGoalTransfer({
                toId: p.account.id,
                amount: p.totalTarget,
                goalId: p.goals.length === 1 ? p.goals[0].goal.id : undefined,
                goals: p.goals,
              })
            }
            onDelete={(id) =>
              deleteTransfer.mutateAsync(id).catch((err) =>
                window.alert(err instanceof Error ? err.message : "No se pudo borrar"),
              )
            }
          />
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
              upsertContribution.mutateAsync({ goalId: goal.id, month: budgetMonth, amount: target }).catch((err) =>
                window.alert(err instanceof Error ? err.message : "No se pudo registrar el aporte"),
              );
            }
          }}
          onClose={() => setGoalTransfer(null)}
        />
      )}
    </div>
  );
}
