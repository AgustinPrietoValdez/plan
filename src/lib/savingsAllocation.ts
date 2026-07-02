import type { SavingsGoal } from "../types";

/** Sum of every active goal's explicit savingsPercent. */
export function totalExplicitPercent(goals: SavingsGoal[]): number {
  return goals.reduce((s, g) => s + g.savingsPercent, 0);
}

/** Percent left unassigned once every goal's explicit percent is accounted for. */
export function overflowPercent(goals: SavingsGoal[]): number {
  return Math.max(0, 100 - totalExplicitPercent(goals));
}

/** A goal's real share of the leftover: its own percent, plus the overflow if it's the overflow target. */
export function effectivePercent(goal: SavingsGoal, overflowPct: number): number {
  return goal.savingsPercent + (goal.isOverflowTarget ? overflowPct : 0);
}

/** Amount of the leftover this goal is allocated this month. */
export function allocatedAmount(goal: SavingsGoal, leftover: number, overflowPct: number): number {
  if (leftover <= 0) return 0;
  return (effectivePercent(goal, overflowPct) / 100) * leftover;
}
