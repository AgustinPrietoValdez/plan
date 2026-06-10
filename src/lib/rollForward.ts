import { useEffect, useRef } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { Task } from "../types";
import { todayYmd } from "./date";
import { nextOccurrence } from "./recurrence";
import { repo } from "./repo";

interface RollResult {
  rolled: number;
}

/** Advance each recurring task whose scheduled day is in the past (and is not
 *  done) by creating a new instance for the next occurrence on or after today.
 *  For real tasks, the old (unfinished) instance is frozen in place — its
 *  recurrence is cleared so it stays visible on its original day as a "not
 *  finished" leftover the user can still mark done retroactively. For habit
 *  tasks, write a missed log entry for each expected day that was skipped and
 *  then drop the old instance: a skipped habit day just lapses (the tracker
 *  keeps the per-day record), it is not a lingering leftover. */
export async function rollForwardRecurringTasks(
  tasks: Task[],
  qc: QueryClient,
): Promise<RollResult> {
  const today = todayYmd();
  let rolled = 0;

  for (const t of tasks) {
    if (!t.recurrence) continue;
    if (!t.day) continue;
    if (t.done) continue;
    if (t.day >= today) continue;

    let next: string | null = nextOccurrence(t.recurrence, t.day);
    let guard = 0;
    while (next && next < today && guard < 366) {
      const further: string | null = nextOccurrence(t.recurrence, next);
      if (!further || further === next) break;
      next = further;
      guard++;
    }
    if (!next) continue;

    const parentId = t.recurrenceParentId ?? t.id;
    const rule = t.recurrence;

    try {
      if (t.isHabit) {
        // A skipped habit day just lapses. The missed log written above is the
        // record that matters for the tracker, so we do NOT keep the old
        // instance around as a red "not finished" leftover — drop it. The chain
        // still advances via the fresh instance created below.
        await repo.deleteTask(t.id);
      } else {
        // Real task: freeze the old instance on its original day. Clearing the
        // rule stops it from being rolled again and stops it from showing as an
        // "active" recurring task — it sticks around as an overdue leftover the
        // user can still tick off.
        await repo.patchTask(t.id, { recurrence: null });
      }

      // Create the fresh instance at the next due day, carrying the rule
      // forward so the chain keeps advancing.
      await repo.createTask({
        title: t.title,
        projectId: t.projectId,
        categoryId: t.categoryId,
        priority: t.priority,
        duration: t.duration,
        day: next,
        due: null,
        recurring: true,
        recurrence: rule,
        recurrenceParentId: parentId,
        notes: t.notes,
        subtasks: t.subtasks.map((s) => ({ ...s, done: false })),
        isHabit: t.isHabit,
      });
      rolled++;
    } catch (e) {
      console.error("Failed to roll forward task:", e);
    }
  }

  if (rolled > 0) qc.invalidateQueries({ queryKey: ["tasks"] });
  return { rolled };
}

/** React hook: runs roll-forward once per calendar day. Re-checks every minute
 *  so an app left open across midnight rolls forward when the date changes. */
export function useRollForwardRecurringTasks(
  tasks: Task[] | undefined,
  enabled: boolean,
): void {
  const qc = useQueryClient();
  const lastRolledDay = useRef<string | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (!tasks) return;

    const maybeRoll = () => {
      const today = todayYmd();
      if (lastRolledDay.current === today) return;
      if (inFlight.current) return;
      inFlight.current = true;
      lastRolledDay.current = today;
      void rollForwardRecurringTasks(tasks, qc).finally(() => {
        inFlight.current = false;
      });
    };

    maybeRoll();
    const id = window.setInterval(maybeRoll, 60_000);
    return () => window.clearInterval(id);
  }, [enabled, tasks, qc]);
}
