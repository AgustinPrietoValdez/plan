import { useEffect, useMemo, useState } from "react";
import { colorsForHue } from "../lib/categoryColor";
import { useSession } from "../lib/auth";
import { fromYmd } from "../lib/date";
import { CURRENCY, fmtMoney, parseMoney } from "../lib/money";
import { formatRule } from "../lib/recurrence";
import { useMaterializeRecurringExpenses } from "../lib/materializeRecurringExpenses";
import {
  useBudgets,

  useDeleteExpense,

  useExpenseCategories,
  useExpenseLineItems,
  useExpenses,
  useIncomes,
  usePatchExpense,
  usePatchSavingsGoal,
  useSavingsContributions,
  useSavingsGoals,
  useUpsertIncome,
} from "../lib/queries";
import { useApp } from "../lib/store";
import type { Expense, ExpenseCategory, ExpenseLineItem, SavingsGoal } from "../types";
import { IChevD, IChevL, IChevR, IChevU, IPlus, IRecurring } from "./icons";
import { SpendingPie } from "./SpendingPie";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function ymToLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

function shiftMonth(yyyymm: string, delta: number): string {
  const [y, m] = yyyymm.split("-").map(Number);
  let year = y;
  let month = m + delta;
  while (month > 12) { month -= 12; year += 1; }
  while (month < 1) { month += 12; year -= 1; }
  return `${year}-${String(month).padStart(2, "0")}`;
}

function expenseInMonth(e: Expense, yyyymm: string): boolean {
  return e.spentOn.slice(0, 7) === yyyymm;
}

// ── Small donut ring for a single percentage ──────────────────────────────────
const DONUT_SIZE = 72;
const DONUT_CX = DONUT_SIZE / 2;
const DONUT_R = 28;
const DONUT_CIRC = 2 * Math.PI * DONUT_R;

function GoalDonut({ pct, color }: { pct: number; color: string }) {
  const fill = Math.min(100, Math.max(0, pct));
  const dashLen = (fill / 100) * DONUT_CIRC;
  return (
    <svg width={DONUT_SIZE} height={DONUT_SIZE} viewBox={`0 0 ${DONUT_SIZE} ${DONUT_SIZE}`} style={{ display: "block" }}>
      <circle cx={DONUT_CX} cy={DONUT_CX} r={DONUT_R} fill="none" stroke="var(--bg-sunken)" strokeWidth={9} />
      {fill > 0 && (
        <circle
          cx={DONUT_CX} cy={DONUT_CX} r={DONUT_R}
          fill="none" stroke={color} strokeWidth={9}
          strokeDasharray={`${dashLen} ${DONUT_CIRC - dashLen}`}
          strokeDashoffset={DONUT_CIRC / 4}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray .3s" }}
        />
      )}
    </svg>
  );
}

// ── Savings goal card ─────────────────────────────────────────────────────────
function SavingsGoalCard({
  goal,
  leftover,
  overflowPercent,
  totalSaved,
  onPatchPercent,
  onSetOverflow,
  onUnsetOverflow,
  onMarkPurchased,
}: {
  goal: SavingsGoal;
  leftover: number;
  overflowPercent: number;
  totalSaved: number;
  onPatchPercent: (pct: number) => void;
  onSetOverflow: () => void;
  onUnsetOverflow: () => void;
  onMarkPurchased: () => void;
}) {
  const effectivePct = goal.savingsPercent + (goal.isOverflowTarget ? overflowPercent : 0);
  const allocatedAmount = leftover > 0 ? (effectivePct / 100) * leftover : 0;
  const color = goal.isOverflowTarget ? "var(--ok)" : "var(--accent)";
  const progressPct = goal.targetAmount !== null && goal.targetAmount > 0
    ? Math.min(100, Math.round((totalSaved / goal.targetAmount) * 100))
    : null;

  const [pctText, setPctText] = useState(goal.savingsPercent.toString());
  useEffect(() => {
    setPctText(goal.savingsPercent.toString());
  }, [goal.id, goal.savingsPercent]);

  const commitPct = () => {
    const val = parseInt(pctText, 10);
    if (!isNaN(val) && val >= 0 && val <= 100) {
      if (val !== goal.savingsPercent) onPatchPercent(val);
    } else {
      setPctText(goal.savingsPercent.toString());
    }
  };

  const reachedTarget = goal.targetAmount !== null && goal.targetAmount > 0 && allocatedAmount >= goal.targetAmount;

  return (
    <div
      style={{
        background: "var(--bg-elev)",
        border: goal.isOverflowTarget
          ? "2px solid var(--ok)"
          : reachedTarget
          ? "1px solid var(--ok)"
          : "1px solid var(--line)",
        borderRadius: 10,
        padding: "10px 12px",
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
      }}
    >
      {/* Donut — progress toward target if set, otherwise allocation % */}
      <div style={{ position: "relative", flex: "0 0 auto" }}>
        <GoalDonut pct={progressPct ?? effectivePct} color={color} />
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "var(--fg)" }}>
            {progressPct !== null ? `${progressPct}%` : `${effectivePct}%`}
          </span>
        </div>
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 500,
              flex: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {goal.name}
          </span>
          {goal.isOverflowTarget && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: ".06em",
                color: "var(--ok)",
                background: "rgba(34,197,94,0.15)",
                borderRadius: 4,
                padding: "1px 5px",
              }}
            >
              Overflow
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type="text"
            inputMode="numeric"
            value={pctText}
            onChange={(e) => setPctText(e.target.value)}
            onBlur={commitPct}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            className="input"
            style={{ width: 48, textAlign: "right", padding: "3px 6px", fontSize: 12, fontVariantNumeric: "tabular-nums" }}
          />
          <span style={{ fontSize: 11, color: "var(--fg-muted)" }}>%</span>
          {goal.isOverflowTarget && overflowPercent > 0 && (
            <span style={{ fontSize: 10, color: "var(--fg-subtle)" }}>+{overflowPercent}%</span>
          )}
          <span style={{ fontSize: 12, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: allocatedAmount > 0 ? "var(--fg)" : "var(--fg-subtle)", marginLeft: 4 }}>
            {fmtMoney(allocatedAmount, { compact: true })}
          </span>
        </div>

        {goal.targetAmount !== null && (
          <div style={{ fontSize: 10.5, color: "var(--fg-subtle)", marginTop: 4 }}>
            {totalSaved > 0
              ? <><span style={{ color: "var(--fg-muted)", fontVariantNumeric: "tabular-nums" }}>{fmtMoney(totalSaved, { compact: true })}</span> / {fmtMoney(goal.targetAmount, { compact: true })}</>
              : <>Target: {fmtMoney(goal.targetAmount)}</>
            }
          </div>
        )}

        <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
          {!goal.isOverflowTarget ? (
            <button
              className="btn ghost"
              style={{ padding: "2px 7px", fontSize: 10.5 }}
              onClick={onSetOverflow}
            >
              Set overflow
            </button>
          ) : (
            <button
              className="btn ghost"
              style={{ padding: "2px 7px", fontSize: 10.5 }}
              onClick={onUnsetOverflow}
            >
              Unset overflow
            </button>
          )}
          {reachedTarget && (
            <button
              className="btn"
              style={{ padding: "2px 7px", fontSize: 10.5, color: "var(--ok)", borderColor: "var(--ok)" }}
              onClick={onMarkPurchased}
            >
              Mark purchased
            </button>
          )}
        </div>
      </div>
    </div>
  );
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
          {fmtMoney(expense.amount)}
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
              {fmtMoney(e.amount)}
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
function IncomeInput({
  month,
  currentAmount,
  onSave,
}: {
  month: string;
  currentAmount: number;
  onSave: (amount: number) => void;
}) {
  const [text, setText] = useState<string>(
    currentAmount > 0 ? currentAmount.toString().replace(".", ",") : "",
  );

  useEffect(() => {
    setText(currentAmount > 0 ? currentAmount.toString().replace(".", ",") : "");
  }, [month, currentAmount]);

  const commit = () => {
    const parsed = parseMoney(text);
    const amount = parsed === null || parsed < 0 ? 0 : parsed;
    if (amount !== currentAmount) onSave(amount);
  };

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600, color: "var(--fg-subtle)" }}>
        Income
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
        style={{ width: 110, fontVariantNumeric: "tabular-nums", textAlign: "right", padding: "4px 8px", fontSize: 13, fontWeight: 600 }}
      />
      <span style={{ fontSize: 11, color: "var(--fg-muted)" }}>{CURRENCY}</span>
    </span>
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
  const deleteExpense = useDeleteExpense();

  const expenses = expensesQ.data ?? [];
  const categories = useMemo(
    () => (categoriesQ.data ?? []).filter((c) => !c.archived),
    [categoriesQ.data],
  );
  const budgets = budgetsQ.data ?? [];
  const lineItems = lineItemsQ.data ?? [];

  const goalsQ = useSavingsGoals();
  const contributionsQ = useSavingsContributions();
  const incomesQ = useIncomes();
  const upsertIncome = useUpsertIncome();
  const patchGoal = usePatchSavingsGoal();
  const goals = useMemo(() => goalsQ.data ?? [], [goalsQ.data]);
  const contributions = useMemo(() => contributionsQ.data ?? [], [contributionsQ.data]);
  const incomes = useMemo(() => incomesQ.data ?? [], [incomesQ.data]);

  const {
    budgetMonth,
    setBudgetMonth,
    openExpenseCreate,
    openExpenseEdit,
    openBudgetManager,
    openExpenseCategoryManager,
    openSavingsGoalManager,
  } = useApp();

  const [filterCategoryId, setFilterCategoryId] = useState<string | null>(null);
  const [expandedExpenseId, setExpandedExpenseId] = useState<string | null>(null);

  const monthExpenses = useMemo(
    () => expenses.filter((e) => expenseInMonth(e, budgetMonth) && !e.deletedAt),
    [expenses, budgetMonth],
  );
  const totalSpent = monthExpenses.reduce((s, e) => s + e.amount, 0);
  const totalBudget = budgets.reduce((s, b) => s + b.monthlyAmount, 0);
  const pctUsed = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;
  const monthIncome = incomes.find((i) => i.month === budgetMonth && !i.deletedAt);
  const incomeAmount = monthIncome?.amount ?? 0;
  const leftover = incomeAmount - totalSpent;

  // Savings allocation
  const activeGoals = useMemo(() => goals.filter((g) => !g.purchasedAt && !g.deletedAt), [goals]);
  const purchasedGoals = useMemo(() => goals.filter((g) => g.purchasedAt && !g.deletedAt), [goals]);
  const totalExplicitPct = activeGoals.reduce((s, g) => s + g.savingsPercent, 0);
  const overflowPercent = Math.max(0, 100 - totalExplicitPct);
  const overflowGoal = activeGoals.find((g) => g.isOverflowTarget);
  const totalAllocated = leftover > 0
    ? activeGoals.reduce((s, g) => {
        const eff = g.savingsPercent + (g.isOverflowTarget ? overflowPercent : 0);
        return s + (eff / 100) * leftover;
      }, 0)
    : 0;

  // Cumulative saved per goal (sum of all contributions)
  const savedByGoalId = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of contributions) {
      if (c.deletedAt) continue;
      map[c.goalId] = (map[c.goalId] ?? 0) + c.amount;
    }
    return map;
  }, [contributions]);

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
            <IncomeInput
              month={budgetMonth}
              currentAmount={incomeAmount}
              onSave={(amount) => upsertIncome.mutate({ month: budgetMonth, amount, currency: CURRENCY })}
            />
            <span style={{ color: "var(--line-strong)" }}>·</span>
            <span>
              <span style={{ color: "var(--fg)", fontWeight: 600 }}>{fmtMoney(totalSpent)}</span>{" "}
              spent{totalBudget > 0 && <> of {fmtMoney(totalBudget)} ({pctUsed}%)</>}
            </span>
            {incomeAmount > 0 && (
              <>
                <span style={{ color: "var(--line-strong)" }}>·</span>
                <span>
                  <span
                    style={{
                      color: leftover < 0 ? "var(--danger)" : "var(--fg)",
                      fontWeight: 600,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {fmtMoney(leftover)}
                  </span>{" "}
                  leftover
                </span>
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
        <button className="btn ghost" onClick={openSavingsGoalManager}>Goals</button>
      </header>

      {/* Main grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 380px",
          gap: 24,
          minHeight: 0,
        }}
      >
        {/* LEFT — spending overview */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          {/* Spending pie (row layout: pie beside category legend) */}
          <SpendingPie
            expenses={monthExpenses}
            categories={categories}
            layout="row"
            limit={totalBudget > 0 ? totalBudget : undefined}
            budgets={budgets}
          />

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

        {/* RIGHT — savings goals + expenses */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          {/* Savings section */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: ".05em",
                fontWeight: 600,
                color: "var(--fg-muted)",
              }}
            >
              <span>Savings</span>
              {activeGoals.length > 0 && (
                <span
                  style={{
                    fontVariantNumeric: "tabular-nums",
                    textTransform: "none",
                    letterSpacing: 0,
                    fontWeight: 400,
                    color: "var(--fg-subtle)",
                    fontSize: 11,
                    flex: 1,
                    textAlign: "right",
                  }}
                >
                  {totalExplicitPct}% explicit
                  {overflowPercent > 0 && !overflowGoal && (
                    <span style={{ color: "var(--fg-subtle)" }}> · {overflowPercent}% unassigned</span>
                  )}
                </span>
              )}
            </div>

            {activeGoals.length === 0 && (
              <div
                style={{
                  padding: "16px 12px",
                  textAlign: "center",
                  fontSize: 12,
                  color: "var(--fg-subtle)",
                  border: "1px dashed var(--line)",
                  borderRadius: 8,
                }}
              >
                No savings goals yet. Click <strong>Goals</strong> to add one.
              </div>
            )}

            {activeGoals.map((g) => (
              <SavingsGoalCard
                key={g.id}
                goal={g}
                leftover={leftover}
                overflowPercent={overflowPercent}
                totalSaved={savedByGoalId[g.id] ?? 0}
                onPatchPercent={(pct) => patchGoal.mutate({ id: g.id, patch: { savingsPercent: pct } })}
                onSetOverflow={() => patchGoal.mutate({ id: g.id, patch: { isOverflowTarget: true } })}
                onUnsetOverflow={() => patchGoal.mutate({ id: g.id, patch: { isOverflowTarget: false } })}
                onMarkPurchased={() => patchGoal.mutate({ id: g.id, patch: { purchasedAt: new Date().toISOString() } })}
              />
            ))}

            {purchasedGoals.length > 0 && (
              <div style={{ marginTop: 4 }}>
                <div
                  style={{
                    fontSize: 10.5,
                    textTransform: "uppercase",
                    letterSpacing: ".05em",
                    fontWeight: 600,
                    color: "var(--fg-subtle)",
                    marginBottom: 4,
                  }}
                >
                  Purchased · {purchasedGoals.length}
                </div>
                {purchasedGoals.map((g) => (
                  <div
                    key={g.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "6px 10px",
                      background: "var(--bg-elev)",
                      border: "1px solid var(--line)",
                      borderRadius: 8,
                      opacity: 0.6,
                      marginTop: 2,
                    }}
                  >
                    <span style={{ flex: 1, fontSize: 12.5, fontWeight: 500, textDecoration: "line-through", color: "var(--fg-subtle)" }}>
                      {g.name}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--ok)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em" }}>
                      Bought
                    </span>
                    <button
                      className="btn ghost"
                      style={{ padding: "3px 8px", fontSize: 11 }}
                      onClick={() => patchGoal.mutate({ id: g.id, patch: { purchasedAt: null } })}
                    >
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
