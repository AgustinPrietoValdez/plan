import { useEffect, useMemo, useState } from "react";
import { colorsForHue } from "../lib/categoryColor";
import { useSession } from "../lib/auth";
import { fromYmd } from "../lib/date";
import { CURRENCY, fmtMoney, parseMoney } from "../lib/money";
import { formatRule } from "../lib/recurrence";
import { useMaterializeRecurringExpenses } from "../lib/materializeRecurringExpenses";
import {
  useBudgets,
  useExpenseCategories,
  useExpenses,
  useIncomes,
  usePatchExpense,
  usePatchSavingsGoal,
  useSavingsContributions,
  useSavingsGoals,
  useUpsertIncome,
  useUpsertSavingsContribution,
} from "../lib/queries";
import { useApp } from "../lib/store";
import type { Expense, ExpenseCategory, SavingsContribution, SavingsGoal } from "../types";
import { IChevL, IChevR, IPlus, IRecurring } from "./icons";
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

export function BudgetView() {
  const { session } = useSession();
  const userId = session?.user.id;
  useMaterializeRecurringExpenses(userId);

  const expensesQ = useExpenses();
  const categoriesQ = useExpenseCategories();
  const budgetsQ = useBudgets();
  const patchExpense = usePatchExpense();

  const expenses = expensesQ.data ?? [];
  const categories = useMemo(
    () => (categoriesQ.data ?? []).filter((c) => !c.archived),
    [categoriesQ.data],
  );
  const budgets = budgetsQ.data ?? [];

  const goalsQ = useSavingsGoals();
  const contribsQ = useSavingsContributions();
  const incomesQ = useIncomes();
  const upsertIncome = useUpsertIncome();
  const goals = useMemo(() => goalsQ.data ?? [], [goalsQ.data]);
  const contributions = useMemo(() => contribsQ.data ?? [], [contribsQ.data]);
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

  const monthExpenses = expenses.filter((e) => expenseInMonth(e, budgetMonth) && !e.deletedAt);
  const totalSpent = monthExpenses.reduce((s, e) => s + e.amount, 0);
  const totalBudget = budgets.reduce((s, b) => s + b.monthlyAmount, 0);
  const pctUsed = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;
  const monthIncome = incomes.find((i) => i.month === budgetMonth && !i.deletedAt);
  const incomeAmount = monthIncome?.amount ?? 0;
  const monthSaved = contributions
    .filter((c) => c.month === budgetMonth && !c.deletedAt)
    .reduce((s, c) => s + c.amount, 0);
  const leftover = incomeAmount - totalSpent - monthSaved;

  // active recurring chains (latest with rule != null) — show as commitments
  const recurringActive = useMemo(() => {
    const byRoot = new Map<string, Expense>();
    for (const e of expenses) {
      if (!e.recurrence) continue;
      if (e.deletedAt) continue;
      const root = e.recurrenceParentId ?? e.id;
      const prev = byRoot.get(root);
      if (!prev || (prev.spentOn < e.spentOn)) byRoot.set(root, e);
    }
    return [...byRoot.values()].sort((a, b) => a.spentOn.localeCompare(b.spentOn));
  }, [expenses]);

  const filteredExpenses = filterCategoryId
    ? monthExpenses.filter((e) => e.categoryId === filterCategoryId)
    : monthExpenses;

  const onPauseRecurring = (e: Expense) => {
    patchExpense.mutate({
      id: e.id,
      patch: { recurrence: null },
    });
  };

  return (
    <div className="day-view-main">
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
            Budget
          </div>
          <div
            style={{
              fontSize: 24,
              fontWeight: 600,
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
              fontVariantNumeric: "tabular-nums",
            }}
          >
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
              onSave={(amount) =>
                upsertIncome.mutate({ month: budgetMonth, amount, currency: CURRENCY })
              }
            />
            <span style={{ color: "var(--line-strong)" }}>·</span>
            <span>
              <span style={{ color: "var(--fg)", fontWeight: 600 }}>{fmtMoney(totalSpent)}</span>{" "}
              spent
              {totalBudget > 0 && (
                <>
                  {" "}of {fmtMoney(totalBudget)} ({pctUsed}%)
                </>
              )}
            </span>
            <span style={{ color: "var(--line-strong)" }}>·</span>
            <span>
              <span style={{ color: "var(--fg)", fontWeight: 600 }}>{fmtMoney(monthSaved)}</span>{" "}
              saved
            </span>
            {incomeAmount > 0 && (
              <>
                <span style={{ color: "var(--line-strong)" }}>·</span>
                <span
                  style={{
                    color: leftover < 0 ? "var(--danger)" : "var(--ok)",
                    fontWeight: 600,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {fmtMoney(leftover)} left
                </span>
              </>
            )}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <button
          className="icon-btn"
          onClick={() => setBudgetMonth(shiftMonth(budgetMonth, -1))}
          title="Previous month"
        >
          <IChevL size={15} />
        </button>
        <button
          className="icon-btn"
          onClick={() => setBudgetMonth(shiftMonth(budgetMonth, 1))}
          title="Next month"
        >
          <IChevR size={15} />
        </button>
        <button
          className="btn"
          onClick={() => openExpenseCreate({ spentOn: new Date().toISOString().slice(0, 10) })}
        >
          <IPlus size={12} /> Expense
        </button>
        <button className="btn ghost" onClick={openBudgetManager}>
          Edit budgets
        </button>
        <button className="btn ghost" onClick={openExpenseCategoryManager}>
          Categories
        </button>
        <button className="btn ghost" onClick={openSavingsGoalManager}>
          Goals
        </button>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 320px",
          gap: 24,
          minHeight: 0,
        }}
      >
        {/* LEFT — categories vs budget + expenses list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
          {recurringActive.length > 0 && (
            <RecurringSection
              expenses={recurringActive}
              categories={categories}
              onEdit={(e) => openExpenseEdit(e.id)}
              onPause={onPauseRecurring}
            />
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div
              style={{
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: ".05em",
                fontWeight: 600,
                color: "var(--fg-muted)",
                marginBottom: 4,
              }}
            >
              Categories
            </div>
            {categories.length === 0 && (
              <div style={{ fontSize: 12, color: "var(--fg-subtle)" }}>No categories yet.</div>
            )}
            {categories.map((c) => {
              const budget = budgets.find((b) => b.categoryId === c.id);
              const spent = monthExpenses
                .filter((e) => e.categoryId === c.id)
                .reduce((s, e) => s + e.amount, 0);
              const colors = colorsForHue(c.hue);
              const pct = budget && budget.monthlyAmount > 0
                ? Math.round((spent / budget.monthlyAmount) * 100)
                : 0;
              const overBudget = budget && spent > budget.monthlyAmount;
              const active = filterCategoryId === c.id;
              return (
                <div
                  key={c.id}
                  onClick={() => setFilterCategoryId(active ? null : c.id)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "10px 1fr auto",
                    gap: 10,
                    alignItems: "center",
                    padding: "8px 10px",
                    background: active ? "var(--bg-sunken)" : "var(--bg-elev)",
                    border: `1px solid ${active ? "var(--accent)" : "var(--line)"}`,
                    borderRadius: 8,
                    cursor: "pointer",
                  }}
                >
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: colors.bg }} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: 12.5,
                        fontWeight: 500,
                      }}
                    >
                      <span style={{ flex: 1 }}>{c.name}</span>
                      <span
                        style={{
                          fontSize: 11.5,
                          color: "var(--fg-muted)",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {fmtMoney(spent)}
                        {budget && (
                          <span style={{ color: "var(--fg-subtle)" }}>
                            {" "}/ {fmtMoney(budget.monthlyAmount)}
                          </span>
                        )}
                      </span>
                    </div>
                    {budget && (
                      <div
                        style={{
                          height: 4,
                          background: "var(--bg-sunken)",
                          borderRadius: 2,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: `${Math.min(100, pct)}%`,
                            background: overBudget ? "var(--danger)" : colors.bg,
                            transition: "width .2s",
                          }}
                        />
                      </div>
                    )}
                  </div>
                  <span
                    style={{
                      fontSize: 10.5,
                      color: overBudget ? "var(--danger)" : "var(--fg-subtle)",
                      fontVariantNumeric: "tabular-nums",
                      fontWeight: overBudget ? 600 : 400,
                      minWidth: 36,
                      textAlign: "right",
                    }}
                  >
                    {budget ? `${pct}%` : "—"}
                  </span>
                </div>
              );
            })}
          </div>

          <SavingsSection
            goals={goals}
            contributions={contributions}
            month={budgetMonth}
          />

          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
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
              <ExpenseRow
                key={e.id}
                expense={e}
                categories={categories}
                onClick={() => openExpenseEdit(e.id)}
              />
            ))}
          </div>
        </div>

        {/* RIGHT — pie + summary */}
        <aside
          style={{
            background: "var(--bg-sunken)",
            border: "1px solid var(--line)",
            borderRadius: 10,
            padding: 16,
            height: "fit-content",
          }}
        >
          <div
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: ".05em",
              color: "var(--fg-subtle)",
              fontWeight: 600,
              marginBottom: 10,
            }}
          >
            By category
          </div>
          <SpendingPie expenses={monthExpenses} categories={categories} />
        </aside>
      </div>
    </div>
  );
}

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
      <span
        style={{
          fontSize: 10.5,
          textTransform: "uppercase",
          letterSpacing: ".05em",
          fontWeight: 600,
          color: "var(--fg-subtle)",
        }}
      >
        Income
      </span>
      <input
        type="text"
        inputMode="decimal"
        placeholder="0,00"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="input"
        style={{
          width: 110,
          fontVariantNumeric: "tabular-nums",
          textAlign: "right",
          padding: "4px 8px",
          fontSize: 13,
          fontWeight: 600,
        }}
      />
      <span style={{ fontSize: 11, color: "var(--fg-muted)" }}>{CURRENCY}</span>
    </span>
  );
}

function SavingsSection({
  goals,
  contributions,
  month,
}: {
  goals: SavingsGoal[];
  contributions: SavingsContribution[];
  month: string;
}) {
  const upsert = useUpsertSavingsContribution();
  const patchGoal = usePatchSavingsGoal();

  const active = goals.filter((g) => g.purchasedAt === null);
  const purchased = goals.filter((g) => g.purchasedAt !== null);

  const monthTotal = useMemo(
    () =>
      contributions
        .filter((c) => c.month === month && !c.deletedAt)
        .reduce((s, c) => s + c.amount, 0),
    [contributions, month],
  );
  const allTimeTotal = useMemo(
    () => contributions.filter((c) => !c.deletedAt).reduce((s, c) => s + c.amount, 0),
    [contributions],
  );

  if (goals.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
        <div
          style={{
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: ".05em",
            fontWeight: 600,
            color: "var(--fg-muted)",
            marginBottom: 4,
          }}
        >
          Savings
        </div>
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
          No savings goals yet. Click <strong>Goals</strong> in the header to add one.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
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
          marginBottom: 4,
        }}
      >
        <span>Savings</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontVariantNumeric: "tabular-nums", textTransform: "none", letterSpacing: 0, fontWeight: 500 }}>
          {fmtMoney(monthTotal)} this month · {fmtMoney(allTimeTotal)} total
        </span>
      </div>

      {active.map((g) => (
        <SavingsGoalRow
          key={g.id}
          goal={g}
          contributions={contributions}
          month={month}
          onContrib={(amount) =>
            upsert.mutate({ goalId: g.id, month, amount })
          }
          onMarkPurchased={() =>
            patchGoal.mutate({
              id: g.id,
              patch: { purchasedAt: new Date().toISOString() },
            })
          }
        />
      ))}

      {purchased.length > 0 && (
        <div style={{ marginTop: 6 }}>
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
            Purchased · {purchased.length}
          </div>
          {purchased.map((g) => {
            const balance = contributions
              .filter((c) => c.goalId === g.id && !c.deletedAt)
              .reduce((s, c) => s + c.amount, 0);
            return (
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
                <span
                  style={{
                    flex: 1,
                    fontSize: 12.5,
                    fontWeight: 500,
                    textDecoration: "line-through",
                    color: "var(--fg-subtle)",
                  }}
                >
                  {g.name}
                </span>
                <span style={{ fontSize: 11, color: "var(--ok)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em" }}>
                  Bought
                </span>
                <span style={{ fontSize: 11.5, color: "var(--fg-muted)", fontVariantNumeric: "tabular-nums" }}>
                  {fmtMoney(balance)}
                </span>
                <button
                  className="btn ghost"
                  style={{ padding: "3px 8px", fontSize: 11 }}
                  onClick={() => patchGoal.mutate({ id: g.id, patch: { purchasedAt: null } })}
                >
                  Restore
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SavingsGoalRow({
  goal,
  contributions,
  month,
  onContrib,
  onMarkPurchased,
}: {
  goal: SavingsGoal;
  contributions: SavingsContribution[];
  month: string;
  onContrib: (amount: number) => void;
  onMarkPurchased: () => void;
}) {
  const goalContribs = contributions.filter((c) => c.goalId === goal.id && !c.deletedAt);
  const balance = goalContribs.reduce((s, c) => s + c.amount, 0);
  const monthContrib = goalContribs.find((c) => c.month === month);
  const monthAmount = monthContrib?.amount ?? 0;

  const [text, setText] = useState<string>(monthAmount > 0 ? monthAmount.toString().replace(".", ",") : "");

  // Sync state when month or goal changes externally
  useEffect(() => {
    setText(monthAmount > 0 ? monthAmount.toString().replace(".", ",") : "");
  }, [month, goal.id, monthAmount]);

  const isOpen = goal.targetAmount === null;
  const reachedTarget = !isOpen && goal.targetAmount !== null && balance >= goal.targetAmount;
  const pct = !isOpen && goal.targetAmount !== null && goal.targetAmount > 0
    ? Math.min(100, Math.round((balance / goal.targetAmount) * 100))
    : 0;

  const commit = () => {
    const parsed = parseMoney(text);
    const amount = parsed === null || parsed < 0 ? 0 : parsed;
    if (amount !== monthAmount) onContrib(amount);
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto auto",
        gap: 12,
        alignItems: "center",
        padding: "8px 10px",
        background: "var(--bg-elev)",
        border: `1px solid ${reachedTarget ? "var(--ok)" : "var(--line)"}`,
        borderRadius: 8,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 500,
              flex: 1,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {goal.name}
          </span>
          <span
            style={{
              fontSize: 11.5,
              color: "var(--fg-muted)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {fmtMoney(balance)}
            {!isOpen && goal.targetAmount !== null && (
              <span style={{ color: "var(--fg-subtle)" }}>
                {" "}/ {fmtMoney(goal.targetAmount)}
              </span>
            )}
          </span>
        </div>
        {!isOpen && goal.targetAmount !== null && (
          <div
            style={{
              height: 4,
              background: "var(--bg-sunken)",
              borderRadius: 2,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${pct}%`,
                background: reachedTarget ? "var(--ok)" : "var(--accent)",
                transition: "width .2s",
              }}
            />
          </div>
        )}
        {isOpen && (
          <span style={{ fontSize: 10.5, color: "var(--fg-subtle)" }}>Open-ended</span>
        )}
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <span
          style={{
            fontSize: 10.5,
            color: "var(--fg-subtle)",
            textTransform: "uppercase",
            letterSpacing: ".05em",
            fontWeight: 600,
          }}
        >
          This month
        </span>
        <input
          type="text"
          inputMode="decimal"
          placeholder="0,00"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className="input"
          style={{
            width: 110,
            fontVariantNumeric: "tabular-nums",
            textAlign: "right",
            padding: "5px 8px",
          }}
        />
        <span style={{ fontSize: 11, color: "var(--fg-muted)" }}>{CURRENCY}</span>
      </div>
      {reachedTarget && (
        <button
          className="btn"
          onClick={onMarkPurchased}
          style={{
            padding: "4px 10px",
            fontSize: 11.5,
            color: "var(--ok)",
            borderColor: "var(--ok)",
          }}
        >
          Mark purchased
        </button>
      )}
      {!reachedTarget && <span />}
    </div>
  );
}

function ExpenseRow({
  expense,
  categories,
  onClick,
}: {
  expense: Expense;
  categories: ExpenseCategory[];
  onClick: () => void;
}) {
  const cat = expense.categoryId
    ? categories.find((c) => c.id === expense.categoryId) ?? null
    : null;
  const colors = cat ? colorsForHue(cat.hue) : { bg: "var(--bg-sunken)", fg: "var(--fg-muted)" };
  const date = fromYmd(expense.spentOn);
  return (
    <div
      onClick={onClick}
      style={{
        display: "grid",
        gridTemplateColumns: "44px 8px 1fr auto",
        gap: 10,
        alignItems: "center",
        padding: "8px 10px",
        background: "var(--bg-elev)",
        border: "1px solid var(--line)",
        borderRadius: 8,
        cursor: "pointer",
      }}
    >
      <span
        style={{
          fontSize: 10.5,
          color: "var(--fg-subtle)",
          textTransform: "uppercase",
          letterSpacing: ".05em",
          fontWeight: 600,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {date.toLocaleDateString("da-DK", { day: "2-digit", month: "short" })}
      </span>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: colors.bg }} />
      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            gap: 6,
            minWidth: 0,
          }}
        >
          <span
            style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {expense.note || cat?.name || "Untitled"}
          </span>
          {expense.recurrence && (
            <IRecurring size={11} stroke={2} />
          )}
        </div>
        {expense.note && cat && (
          <div style={{ fontSize: 11, color: "var(--fg-subtle)" }}>{cat.name}</div>
        )}
      </div>
      <span
        style={{
          fontSize: 13,
          fontWeight: 600,
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "-0.01em",
        }}
      >
        {fmtMoney(expense.amount)}
      </span>
    </div>
  );
}

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
        const cat = e.categoryId ? categories.find((c) => c.id === e.categoryId) ?? null : null;
        const colors = cat ? colorsForHue(cat.hue) : { bg: "var(--bg-sunken)" };
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
            <span style={{ width: 10, height: 10, borderRadius: 3, background: colors.bg }} />
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {e.note || cat?.name || "Untitled"}
              </div>
              <div
                style={{ fontSize: 11.5, color: "var(--fg-muted)", fontVariantNumeric: "tabular-nums" }}
              >
                {e.recurrence ? formatRule(e.recurrence) : ""} · next {e.spentOn}
              </div>
            </div>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {fmtMoney(e.amount)}
            </span>
            <button
              className="btn ghost"
              style={{ padding: "4px 8px", fontSize: 11.5 }}
              onClick={(ev) => {
                ev.stopPropagation();
                onPause(e);
              }}
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
