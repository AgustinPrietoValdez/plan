// Budgets can be set per month or per week. The stored column is still
// `monthly_amount` (renaming it would break the sync wire format), but it now
// means **amount per period** — so a weekly budget of 300 is 300 *each week*,
// not 300 a month. This module is the single place that turns a budget + a
// period of time into the cap that applies over it.
//
// Why it exists: a month with five weeks was reading as overspending, because
// five weeks of 300 were being compared against a 1200 monthly cap.

import { addDays, fromYmd, monthOfWeek, weekLabel, weekStartsInMonth, weeksInMonth, ymd } from "./date";

export type BudgetScope =
  | { kind: "month"; yyyymm: string }
  | { kind: "week"; weekStart: string };

/** Structural input so this module doesn't depend on the Budget type.
 *  `Budget` from src/types satisfies it. */
export interface PeriodicBudget {
  monthlyAmount: number;
  period: "monthly" | "weekly";
}

/** Weeks in the month a scope covers — the conversion factor between the two
 *  periods, and the only reason this isn't plain arithmetic.
 *
 *  A week belongs to whichever month holds **most** of its seven days (see
 *  `monthOfWeek`). That rule is what makes the conversion honest: the weeks of
 *  a year partition cleanly across the twelve months, so no week is counted in
 *  two of them and none falls through the cracks. Summing the twelve monthly
 *  caps of a weekly budget therefore gives exactly 52 or 53 weeks of it — the
 *  real year — instead of double counting the weeks that straddle a boundary.
 *
 *  Never 0 in practice (a month always holds 4 or 5 weeks), but callers divide
 *  by this, so the floor of 1 keeps a bad input from producing Infinity/NaN. */
function weeksInScope(scope: BudgetScope): number {
  const yyyymm = scope.kind === "month" ? scope.yyyymm : monthOfWeek(scope.weekStart);
  return Math.max(1, weeksInMonth(yyyymm));
}

/** The budget cap that applies over `scope`. */
export function budgetAmountFor(budget: PeriodicBudget, scope: BudgetScope): number {
  if (budget.period === "weekly") {
    // Per-week amount: a month costs as many weeks as it actually has.
    return scope.kind === "week" ? budget.monthlyAmount : budget.monthlyAmount * weeksInScope(scope);
  }
  // Per-month amount: a single week gets its prorated share of it.
  return scope.kind === "month" ? budget.monthlyAmount : budget.monthlyAmount / weeksInScope(scope);
}

/** Combined cap of several budgets over the same scope. */
export function sumBudgetsFor(budgets: PeriodicBudget[], scope: BudgetScope): number {
  return budgets.reduce((sum, b) => sum + budgetAmountFor(b, scope), 0);
}

/** Whether an expense dated `spentOn` ("YYYY-MM-DD") falls inside `scope`.
 *  Both branches compare strings: zero-padded YYYY-MM-DD sorts lexicographically
 *  in the same order as the dates themselves, so `>=`/`<=` are exact here and
 *  there's no need to build Date objects. */
export function expenseInScope(spentOn: string, scope: BudgetScope): boolean {
  if (scope.kind === "month") return spentOn.slice(0, 7) === scope.yyyymm;
  const end = weekEnd(scope.weekStart);
  return spentOn >= scope.weekStart && spentOn <= end;
}

/** The Friday closing the week that opens on Saturday `weekStart`. */
function weekEnd(weekStart: string): string {
  return ymd(addDays(fromYmd(weekStart), 6));
}

/** The month's span measured in whole weeks: from the first Saturday belonging
 *  to it through the Friday closing the last one. The weeks of a month are
 *  consecutive, so their union is this single contiguous range.
 *
 *  It does NOT line up with the calendar month — a 4-week month covers 28 days
 *  of a 31-day one, a 5-week month covers 35. That gap is exactly why this
 *  exists: comparing a weekly budget's 5-week cap against a calendar month of
 *  spending is the bug this feature set out to fix, and comparing a 4-week cap
 *  against 31 days of spending would reintroduce it with the sign flipped. */
export function monthWeekRange(yyyymm: string): { from: string; to: string } {
  const weeks = weekStartsInMonth(yyyymm);
  if (weeks.length === 0) return { from: `${yyyymm}-01`, to: `${yyyymm}-31` };
  return { from: weeks[0], to: weekEnd(weeks[weeks.length - 1]) };
}

/** Whether an expense counts against a budget of this `period` over `scope`.
 *
 *  A weekly budget is always measured in whole weeks, so viewing one "by month"
 *  sums the weeks that belong to that month rather than its calendar days —
 *  otherwise the cap and the spending would be counting different things.
 *  A monthly budget keeps the plain calendar month. */
export function expenseInScopeFor(
  spentOn: string,
  scope: BudgetScope,
  period: PeriodicBudget["period"],
): boolean {
  if (period === "weekly" && scope.kind === "month") {
    const { from, to } = monthWeekRange(scope.yyyymm);
    return spentOn >= from && spentOn <= to;
  }
  return expenseInScope(spentOn, scope);
}

/** Short Spanish label for a scope, for the UI to compose with. Months describe
 *  their week count, since that's the number that explains an odd-looking cap. */
export function describeScope(scope: BudgetScope): string {
  if (scope.kind === "week") return weekLabel(scope.weekStart);
  const n = weeksInMonth(scope.yyyymm);
  return `${n} semanas`;
}
