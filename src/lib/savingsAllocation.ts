import type { SavingsGoal } from "../types";

/**
 * Highest % of the leftover a goal can take without saving more than its target
 * (the compra). `savedBefore` is what was already saved for it in other months.
 * Goals without a target (or no leftover) have no cap.
 */
export function maxPercent(goal: SavingsGoal, leftover: number, savedBefore: number): number {
  if (goal.targetAmount === null || leftover <= 0) return Infinity;
  return (Math.max(0, goal.targetAmount - savedBefore) / leftover) * 100;
}

/** The goal's explicit percent, lowered to its max if it would overshoot the target. */
export function cappedPercent(goal: SavingsGoal, leftover: number, savedBefore: number): number {
  return Math.min(goal.savingsPercent, maxPercent(goal, leftover, savedBefore));
}

/** Percent left unassigned once every goal's (capped) percent is accounted for. */
export function overflowPercent(cappedPercents: number[]): number {
  return Math.max(0, 100 - cappedPercents.reduce((s, p) => s + p, 0));
}

/** Plata que todavia le entra a un goal este mes (Infinity si no tiene objetivo). */
function room(goal: SavingsGoal, savedBefore: number): number {
  return goal.targetAmount === null ? Infinity : Math.max(0, goal.targetAmount - savedBefore);
}

/**
 * Reparto completo del mes, en el orden de Presupuesto. Cada goal recibe su %
 * (topeado) y el overflow target ademas el % sin asignar. Si el overflow target
 * tiene objetivo y se llena, lo que le sobra pasa al goal SIGUIENTE en la lista
 * (y si ese tambien se llena, al que sigue, dando la vuelta) — pedido del usuario.
 */
export function allocateMonth(
  rows: { goal: SavingsGoal; savedBefore: number }[],
  leftover: number,
): { pct: number; amount: number }[] {
  const pcts = rows.map((r) => cappedPercent(r.goal, leftover, r.savedBefore));
  const overflow = overflowPercent(pcts);
  const amounts = rows.map((r) => allocatedAmount(r.goal, leftover, overflow, r.savedBefore));
  const ovIdx = rows.findIndex((r) => r.goal.isOverflowTarget);
  if (leftover > 0 && ovIdx >= 0) {
    const raw = ((pcts[ovIdx] + overflow) / 100) * leftover;
    let spill = raw - amounts[ovIdx];
    for (let k = 1; k < rows.length && spill > 0.005; k++) {
      const i = (ovIdx + k) % rows.length;
      const give = Math.min(spill, room(rows[i].goal, rows[i].savedBefore) - amounts[i]);
      if (give > 0) {
        amounts[i] += give;
        spill -= give;
      }
    }
  }
  return rows.map((_, i) => ({ pct: pcts[i], amount: amounts[i] }));
}

/**
 * Amount of the leftover this goal is allocated this month: its capped percent,
 * plus the overflow if it's the overflow target — never more than what's still
 * missing for its target.
 */
export function allocatedAmount(goal: SavingsGoal, leftover: number, overflowPct: number, savedBefore = 0): number {
  if (leftover <= 0) return 0;
  const pct = cappedPercent(goal, leftover, savedBefore) + (goal.isOverflowTarget ? overflowPct : 0);
  const raw = (pct / 100) * leftover;
  if (goal.targetAmount === null) return raw;
  return Math.min(raw, Math.max(0, goal.targetAmount - savedBefore));
}
