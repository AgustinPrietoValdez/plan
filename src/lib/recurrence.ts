import { addDays, fromYmd, ymd } from "./date";

/** Roll-forward recurrence rule. Only one occurrence is materialized at a
 *  time; completing the current task generates the next instance via
 *  nextOccurrence(). */
export type RecurrenceRule =
  | { kind: "daily"; interval: number }
  | { kind: "weekly"; interval: number; weekdays: number[] } // 0=Sun .. 6=Sat
  | { kind: "monthly"; interval: number; dayOfMonth: number };

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Compute the next occurrence date strictly AFTER `fromYmdStr`.
 *  Returns null when the rule is malformed (e.g. weekly with no weekdays). */
export function nextOccurrence(rule: RecurrenceRule, fromYmdStr: string): string | null {
  const from = fromYmd(fromYmdStr);

  if (rule.kind === "daily") {
    const step = Math.max(1, rule.interval);
    return ymd(addDays(from, step));
  }

  if (rule.kind === "weekly") {
    if (!rule.weekdays || rule.weekdays.length === 0) return null;
    const sorted = [...rule.weekdays].sort((a, b) => a - b);
    const interval = Math.max(1, rule.interval);

    // Walk forward day by day until we hit a matching weekday in an
    // active week. (Active = the week count from the source week is a
    // multiple of `interval`.)
    const sourceWeek = weekIndex(from);
    for (let i = 1; i <= 7 * interval + 7; i++) {
      const candidate = addDays(from, i);
      const dow = candidate.getDay();
      const candidateWeek = weekIndex(candidate);
      const weekDelta = candidateWeek - sourceWeek;
      if (weekDelta % interval !== 0) continue;
      if (sorted.includes(dow)) return ymd(candidate);
    }
    return null;
  }

  if (rule.kind === "monthly") {
    const interval = Math.max(1, rule.interval);
    const day = Math.min(31, Math.max(1, rule.dayOfMonth));
    let year = from.getFullYear();
    let month = from.getMonth() + interval;
    while (month >= 12) {
      month -= 12;
      year += 1;
    }
    const lastOfTarget = new Date(year, month + 1, 0).getDate();
    const useDay = Math.min(day, lastOfTarget);
    const next = new Date(year, month, useDay);
    return ymd(next);
  }

  return null;
}

/** Days since 1970-01-04 (a Sunday) divided by 7. Stable monotonic week
 *  index across DST changes (uses local-time epoch components, not UTC). */
function weekIndex(d: Date): number {
  const ms = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.floor(ms / (7 * 24 * 60 * 60 * 1000));
}

/** Mirror of {@link nextOccurrence} walking backward — strictly BEFORE
 *  `fromYmdStr`. Used by the Habits view to anchor period grids on the actual
 *  chain rhythm instead of an arbitrary month boundary. */
export function previousOccurrence(rule: RecurrenceRule, fromYmdStr: string): string | null {
  const from = fromYmd(fromYmdStr);

  if (rule.kind === "daily") {
    const step = Math.max(1, rule.interval);
    return ymd(addDays(from, -step));
  }

  if (rule.kind === "weekly") {
    if (!rule.weekdays || rule.weekdays.length === 0) return null;
    const sorted = [...rule.weekdays].sort((a, b) => a - b);
    const interval = Math.max(1, rule.interval);
    const sourceWeek = weekIndex(from);
    for (let i = 1; i <= 7 * interval + 7; i++) {
      const candidate = addDays(from, -i);
      const dow = candidate.getDay();
      const candidateWeek = weekIndex(candidate);
      const weekDelta = sourceWeek - candidateWeek;
      if (weekDelta % interval !== 0) continue;
      if (sorted.includes(dow)) return ymd(candidate);
    }
    return null;
  }

  if (rule.kind === "monthly") {
    const interval = Math.max(1, rule.interval);
    const day = Math.min(31, Math.max(1, rule.dayOfMonth));
    let year = from.getFullYear();
    let month = from.getMonth() - interval;
    while (month < 0) {
      month += 12;
      year -= 1;
    }
    const lastOfTarget = new Date(year, month + 1, 0).getDate();
    const useDay = Math.min(day, lastOfTarget);
    return ymd(new Date(year, month, useDay));
  }

  return null;
}

export function formatRule(rule: RecurrenceRule): string {
  if (rule.kind === "daily") {
    return rule.interval === 1 ? "Every day" : `Every ${rule.interval} days`;
  }
  if (rule.kind === "weekly") {
    const days = (rule.weekdays ?? []).map((d) => WEEKDAY_SHORT[d]).join(", ");
    const prefix = rule.interval === 1 ? "Weekly on" : `Every ${rule.interval} weeks on`;
    return days ? `${prefix} ${days}` : "Weekly (no days)";
  }
  if (rule.kind === "monthly") {
    const suffix = ordinalSuffix(rule.dayOfMonth);
    return rule.interval === 1
      ? `Monthly on the ${rule.dayOfMonth}${suffix}`
      : `Every ${rule.interval} months on the ${rule.dayOfMonth}${suffix}`;
  }
  return "Recurring";
}

function ordinalSuffix(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return "th";
  switch (n % 10) {
    case 1: return "st";
    case 2: return "nd";
    case 3: return "rd";
    default: return "th";
  }
}

export const DEFAULT_RULES: Record<RecurrenceRule["kind"], RecurrenceRule> = {
  daily: { kind: "daily", interval: 1 },
  weekly: { kind: "weekly", interval: 1, weekdays: [1] },
  monthly: { kind: "monthly", interval: 1, dayOfMonth: 1 },
};

/** Whether a given calendar day matches the recurrence pattern. Used by the
 *  Habits view to know which days the habit was expected on. Ignores
 *  `interval` (so a weekly habit with interval=2 is treated as interval=1
 *  for habit-tracking purposes). */
export function isExpectedDay(rule: RecurrenceRule, dayYmd: string): boolean {
  if (rule.kind === "daily") return true;
  const d = fromYmd(dayYmd);
  if (rule.kind === "weekly") {
    return (rule.weekdays ?? []).includes(d.getDay());
  }
  if (rule.kind === "monthly") {
    const lastOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return d.getDate() === Math.min(rule.dayOfMonth, lastOfMonth);
  }
  return false;
}
