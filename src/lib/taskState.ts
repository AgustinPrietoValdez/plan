import type { Task } from "../types";
import { todayYmd } from "./date";

/** A task scheduled for a past day that never got marked done — covers both
 *  one-off leftovers and recurring instances frozen in place by roll-forward.
 *  Tasks still carrying an active recurrence rule are excluded since those
 *  are about to be picked up by the next roll-forward pass.
 *
 *  Habits are excluded too: a habit does not "fail" when you skip a day. A
 *  skipped day just lapses (what matters is done/not-done per day, recorded in
 *  the habit tracker via habit_logs), so it must never render as a red
 *  "not finished" leftover. */
export function isNotFinished(t: Task): boolean {
  if (t.done) return false;
  if (t.isHabit) return false;
  if (t.recurrence) return false;
  if (!t.day) return false;
  return t.day < todayYmd();
}
