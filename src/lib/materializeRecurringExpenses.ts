import { useEffect, useRef } from "react";
import { useCreateExpense, useExpenses } from "./queries";
import { nextOccurrence } from "./recurrence";
import { useToday } from "./useToday";

/** For each active recurring expense (latest in chain with rule != null),
 *  generate forward instances up to today. Idempotent because we check
 *  whether an instance for the next-due date already exists in the chain.
 *  `today` comes from useToday() (not a one-off todayYmd() call) so this
 *  effect also re-runs when the calendar day changes while the app stays
 *  open, instead of only when expense data itself changes. */
export function useMaterializeRecurringExpenses(userId: string | undefined) {
  const expensesQ = useExpenses();
  const create = useCreateExpense();
  const ranRef = useRef<string | null>(null);
  const today = useToday();

  useEffect(() => {
    if (!userId) return;
    if (expensesQ.isLoading || expensesQ.isFetching) return;
    if (!expensesQ.data) return;
    const stamp = `${userId}:${today}:${expensesQ.data.length}:${expensesQ.data
      .map((e) => e.updatedAt)
      .reduce((max, u) => (u > max ? u : max), "")}`;
    if (ranRef.current === stamp) return;
    ranRef.current = stamp;

    (async () => {
      const expenses = expensesQ.data ?? [];

      // group by chain root (recurrence_parent_id, or self if no parent)
      const chains = new Map<string, typeof expenses>();
      for (const e of expenses) {
        if (!e.recurrence && !e.recurrenceParentId) continue;
        const root = e.recurrenceParentId ?? e.id;
        const arr = chains.get(root) ?? [];
        arr.push(e);
        chains.set(root, arr);
      }

      for (const [root, instances] of chains) {
        // Find the latest active rule-bearer
        const active = instances
          .filter((e) => e.recurrence !== null)
          .sort((a, b) => (a.spentOn < b.spentOn ? 1 : -1))[0];
        if (!active || !active.recurrence) continue;

        const haveDates = new Set(instances.map((e) => e.spentOn));

        let cursor = active.spentOn;
        let safety = 0;
        let mostRecent = active;
        while (safety++ < 60) {
          const next = nextOccurrence(active.recurrence, cursor);
          if (!next) break;
          if (next > today) break;
          cursor = next;
          if (haveDates.has(next)) continue;

          // Materialize new instance from the most-recent's data, with rule
          // moved forward to it. Clear rule from `mostRecent` (freeze prev).
          await create.mutateAsync({
            name: mostRecent.name,
            amount: mostRecent.amount,
            currency: mostRecent.currency,
            categoryId: mostRecent.categoryId,
            spentOn: next,
            note: mostRecent.note,
            recurrence: mostRecent.recurrence,
            recurrenceParentId: root,
          });
          haveDates.add(next);
          // (We don't update `mostRecent` to the just-created instance because
          // create.mutateAsync returns it but invalidation will refresh the
          // list on the next render. This loop will catch up next render.)
          break;
        }
      }
    })();
  }, [userId, expensesQ.data, expensesQ.isLoading, expensesQ.isFetching, create]);
}
