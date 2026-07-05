import { useMemo, useState } from "react";
import { categoryFor } from "../lib/categoryFor";
import { colorsForCategory } from "../lib/categoryColor";
import { addDays, DOW_MINI, fromYmd, ymd } from "../lib/date";
import { useToday } from "../lib/useToday";
import { formatRule, isExpectedDay, nextOccurrence, previousOccurrence } from "../lib/recurrence";
import {
  useCategories,
  useHabitLogs,
  useProjects,
  useTasks,
  useUpsertHabitLog,
} from "../lib/queries";
import { useApp } from "../lib/store";
import type { RecurrenceRule, Task } from "../types";
import { ICheck, IChevL, IChevR, IHabit } from "./icons";

/** Walk a known chain anchor to the largest expected day at or before doneDay. */
function habitPeriodStart(rule: RecurrenceRule, anchor: string, doneDay: string): string {
  let cur = anchor;
  let guard = 0;
  if (cur > doneDay) {
    while (cur > doneDay && guard < 1000) {
      const prev = previousOccurrence(rule, cur);
      if (!prev || prev >= cur) break;
      cur = prev;
      guard++;
    }
  } else {
    while (guard < 1000) {
      const next = nextOccurrence(rule, cur);
      if (!next || next > doneDay) break;
      cur = next;
      guard++;
    }
  }
  return cur;
}

interface Habit {
  rootId: string;
  rule: RecurrenceRule;
  representative: Task;
  todayActive: Task | null;
  todayDone: boolean;
  /** Any expected day in the chain — used to anchor the period grid so it
   *  reflects the chain's actual rhythm instead of an arbitrary month edge. */
  anchorDay: string;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function todayMonthKey(): string {
  return monthKey(new Date());
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export function HabitsView() {
  const tasksQ = useTasks();
  const logsQ = useHabitLogs();
  const projectsQ = useProjects();
  const categoriesQ = useCategories();
  const tasks = tasksQ.data ?? [];
  const logs = logsQ.data ?? [];
  const projects = projectsQ.data ?? [];
  const categories = categoriesQ.data ?? [];
  const upsertLog = useUpsertHabitLog();
  const { openCompletion } = useApp();

  const [viewMonth, setViewMonth] = useState<string>(todayMonthKey);
  const today = useToday();

  const [year, monthNum] = viewMonth.split("-").map(Number);
  const monthIndex = monthNum - 1;
  const totalDays = daysInMonth(year, monthIndex);
  const monthDays = useMemo(() => {
    const out: string[] = [];
    for (let d = 1; d <= totalDays; d++) {
      out.push(`${year}-${String(monthNum).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    }
    return out;
  }, [year, monthNum, totalDays]);

  const habits: Habit[] = useMemo(() => {
    const byRoot = new Map<string, Task[]>();
    for (const t of tasks) {
      if (!t.isHabit) continue;
      if (t.deletedAt) continue;
      const rootId = t.recurrenceParentId ?? t.id;
      const list = byRoot.get(rootId) ?? [];
      list.push(t);
      byRoot.set(rootId, list);
    }
    const out: Habit[] = [];
    for (const [rootId, instances] of byRoot) {
      const sorted = [...instances].sort((a, b) =>
        (a.day ?? "") < (b.day ?? "") ? 1 : -1,
      );
      const representative = sorted[0];
      const rule = sorted.find((t) => t.recurrence)?.recurrence ?? null;
      if (!rule) continue;
      const todayActive = instances.find((t) => t.day === today && !t.done) ?? null;
      const todayDoneInstance = instances.find((t) => t.day === today && t.done);
      const todayLog = logs.find(
        (l) => l.taskId === rootId && l.day === today && l.done,
      );
      const todayDone = Boolean(todayDoneInstance || todayLog);
      const anchorDay =
        instances.find((t) => t.day && t.recurrence)?.day ??
        instances.find((t) => t.day)?.day ??
        today;
      out.push({ rootId, rule, representative, todayActive, todayDone, anchorDay });
    }
    return out.sort((a, b) =>
      a.representative.title.localeCompare(b.representative.title),
    );
  }, [tasks, logs, today]);

  /** For each habit, the set of days that count as completed — includes every
   *  day in the period that a done day covers. A completion on day D covers
   *  D up to (but not including) the next scheduled occurrence after D. So
   *  weekly habits paint the whole week green, daily-every-2-days paints
   *  both days, monthly habits paint the whole month, etc.
   *
   *  Coverage sources:
   *   - habit_log entries (done = true)
   *   - any completed task in the chain (even if isHabit was flipped later)
   *  Explicit "unchecks" come in as habit_log entries with done=false; we
   *  let those mask same-day coverage so the user can deselect. */
  const coveredByHabit = useMemo(() => {
    const out = new Map<string, Set<string>>();
    const habitRoots = new Set<string>();
    const habitRules = new Map<string, RecurrenceRule>();
    const habitAnchors = new Map<string, string>();
    for (const t of tasks) {
      if (!t.isHabit) continue;
      const root = t.recurrenceParentId ?? t.id;
      habitRoots.add(root);
      if (t.recurrence && !habitRules.has(root)) habitRules.set(root, t.recurrence);
      if (t.day && t.recurrence && !habitAnchors.has(root)) habitAnchors.set(root, t.day);
    }
    // Fallback anchor: any chain instance with a day, if none has a rule.
    for (const t of tasks) {
      if (!t.isHabit) continue;
      const root = t.recurrenceParentId ?? t.id;
      if (t.day && !habitAnchors.has(root)) habitAnchors.set(root, t.day);
    }

    /** Walk a known chain anchor to the largest expected day at or before
     *  doneDay — that's the start of the period that contains doneDay. */
    const findPeriodStart = (rule: RecurrenceRule, anchor: string, doneDay: string): string => {
      let cur = anchor;
      let guard = 0;
      if (cur > doneDay) {
        while (cur > doneDay && guard < 1000) {
          const prev = previousOccurrence(rule, cur);
          if (!prev || prev >= cur) break;
          cur = prev;
          guard++;
        }
      } else {
        while (guard < 1000) {
          const next = nextOccurrence(rule, cur);
          if (!next || next > doneDay) break;
          cur = next;
          guard++;
        }
      }
      return cur;
    };

    const addCoverage = (root: string, doneDay: string) => {
      const rule = habitRules.get(root);
      const set = out.get(root) ?? new Set<string>();
      set.add(doneDay);
      if (rule) {
        const anchor = habitAnchors.get(root);
        // Anchor on the chain's rhythm so the covered span matches the period
        // the user actually sees in the grid (not a "forward N days from the
        // click" span, which leaks into the next period for daily-every-N).
        const periodStart = anchor
          ? findPeriodStart(rule, anchor, doneDay)
          : doneDay;
        const next = nextOccurrence(rule, periodStart);
        if (next) {
          let cur = fromYmd(periodStart);
          const limit = fromYmd(next);
          let guard = 0;
          while (cur < limit && guard < 366) {
            set.add(ymd(cur));
            cur = addDays(cur, 1);
            guard++;
          }
        }
      }
      out.set(root, set);
    };

    for (const l of logs) {
      if (!l.done) continue;
      addCoverage(l.taskId, l.day);
    }
    for (const t of tasks) {
      if (!t.done || !t.day) continue;
      const root = t.recurrenceParentId ?? t.id;
      if (!habitRoots.has(root)) continue;
      addCoverage(root, t.day);
    }

    // Explicit unchecks: a habit_log with done=false on day D removes the
    // ENTIRE period that contains D from the covered set. Per-day removal
    // wouldn't undo coverage that was painted across the rest of the period
    // (e.g., for daily-every-21 where one click paints 21 days).
    for (const l of logs) {
      if (l.done) continue;
      const set = out.get(l.taskId);
      if (!set) continue;
      const rule = habitRules.get(l.taskId);
      const anchor = habitAnchors.get(l.taskId);
      if (!rule || !anchor) {
        set.delete(l.day);
        continue;
      }
      const periodStart = findPeriodStart(rule, anchor, l.day);
      const next = nextOccurrence(rule, periodStart);
      if (!next) {
        set.delete(l.day);
        continue;
      }
      let cur = fromYmd(periodStart);
      const limit = fromYmd(next);
      let g = 0;
      while (cur < limit && g < 366) {
        set.delete(ymd(cur));
        cur = addDays(cur, 1);
        g++;
      }
    }
    return out;
  }, [logs, tasks]);

  const monthStats = (habit: Habit) => {
    let exp = 0;
    let done = 0;
    for (const d of monthDays) {
      if (d > today) continue;
      if (!isExpectedDay(habit.rule, d)) continue;
      exp++;
      if (coveredByHabit.get(habit.rootId)?.has(d)) done++;
    }
    return { exp, done };
  };

  const goPrev = () => {
    const d = new Date(year, monthIndex - 1, 1);
    setViewMonth(monthKey(d));
  };
  const goNext = () => {
    const d = new Date(year, monthIndex + 1, 1);
    setViewMonth(monthKey(d));
  };
  const goToday = () => setViewMonth(todayMonthKey());

  const isCurrentMonth = viewMonth === todayMonthKey();

  const onCheck = (h: Habit) => {
    const covered = coveredByHabit.get(h.rootId)?.has(today) ?? false;
    // Write on the period's expected start day, not on `today`. This ensures
    // the upsert overwrites any done=false row that rollForward left for the
    // same day (same DB key), so the two writes never conflict.
    const periodStart = habitPeriodStart(h.rule, h.anchorDay, today);
    if (covered) {
      upsertLog.mutate({ taskId: h.rootId, day: periodStart, done: false });
      return;
    }
    if (h.todayActive) {
      openCompletion(h.todayActive.id);
    } else {
      upsertLog.mutate({ taskId: h.rootId, day: periodStart, done: true });
    }
  };

  /**
   * Toggle a past (or current) period segment by writing a single-day log entry.
   *
   * - done   → write done=false on segFirstDay (clears the whole period coverage)
   * - missed → write done=true  on segFirstDay (marks the whole period as done)
   * - future containing today → same as the circular check button (onCheck)
   *
   * Writing on segFirstDay is safe because the coverage logic resolves the full
   * period from any day within it via findPeriodStart + nextOccurrence. Even when
   * segFirstDay is clipped to the visible month window (i.e. the real period start
   * is before the first displayed day), the log entry still falls within the period
   * and the uncheck pass removes/adds the entire painted span correctly.
   *
   * A segment is only clickable when segFirstDay <= today (not a purely future period).
   */
  const onCheckSegment = (
    h: Habit,
    segPeriodStart: string,
    state: "done" | "missed" | "future",
    containsToday: boolean,
  ) => {
    if (containsToday) {
      onCheck(h);
    } else if (state === "done") {
      upsertLog.mutate({ taskId: h.rootId, day: segPeriodStart, done: false });
    } else if (state === "missed") {
      upsertLog.mutate({ taskId: h.rootId, day: segPeriodStart, done: true });
    }
  };

  const GAP = 3;
  const HABIT_LABEL_W = 180;
  const SUMMARY_W = 64;
  const ROW_MIN = 30;
  const ROW_MAX = 56;
  const gridCols = `${HABIT_LABEL_W}px repeat(${totalDays}, minmax(16px, 1fr)) ${SUMMARY_W}px`;

  return (
    <div
      style={{
        flex: "1 1 auto",
        minHeight: 0,
        padding: "18px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        overflow: "hidden",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 14,
          paddingBottom: 8,
          borderBottom: "1px solid var(--line)",
          flex: "0 0 auto",
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            background: "var(--accent-soft)",
            color: "var(--accent)",
            flex: "0 0 auto",
            display: "grid",
            placeItems: "center",
          }}
        >
          <IHabit size={20} stroke={2} />
        </div>
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: ".06em",
              color: "var(--fg-subtle)",
              fontWeight: 600,
            }}
          >
            Habits
          </div>
          <div
            style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.1 }}
          >
            {habits.length} habit{habits.length === 1 ? "" : "s"}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button className="icon-btn" onClick={goPrev} title="Previous month">
            <IChevL size={14} />
          </button>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              minWidth: 130,
              textAlign: "center",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {MONTH_NAMES[monthIndex]} {year}
          </div>
          <button className="icon-btn" onClick={goNext} title="Next month">
            <IChevR size={14} />
          </button>
          {!isCurrentMonth && (
            <button
              className="btn ghost"
              onClick={goToday}
              style={{ marginLeft: 4, fontSize: 11 }}
            >
              Today
            </button>
          )}
        </div>
      </header>

      {habits.length === 0 && (
        <div
          style={{
            padding: "40px 12px",
            textAlign: "center",
            color: "var(--fg-subtle)",
            fontSize: 13,
            border: "1px dashed var(--line)",
            borderRadius: 10,
          }}
        >
          No habits yet.
          <br />
          <span style={{ fontSize: 12 }}>
            Open a recurring task and check <strong>Track as habit</strong>.
          </span>
        </div>
      )}

      {habits.length > 0 && (
        <div
          style={{
            border: "1px solid var(--line)",
            borderRadius: 10,
            background: "var(--bg-elev)",
            padding: 14,
            flex: "1 1 auto",
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Header row: day numbers */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: gridCols,
              columnGap: GAP,
              alignItems: "end",
              paddingBottom: 6,
              borderBottom: "1px solid var(--line)",
              marginBottom: 6,
              flex: "0 0 auto",
            }}
          >
            <div />
            {monthDays.map((d) => {
              const dow = fromYmd(d).getDay();
              const dayNum = Number(d.slice(8, 10));
              const isToday = d === today;
              return (
                <div
                  key={d}
                  style={{
                    textAlign: "center",
                    fontSize: 9.5,
                    color: isToday ? "var(--accent)" : "var(--fg-subtle)",
                    fontWeight: isToday ? 700 : 500,
                    fontVariantNumeric: "tabular-nums",
                    lineHeight: 1.2,
                    minWidth: 0,
                  }}
                >
                  <div style={{ fontSize: 8.5, opacity: 0.7 }}>{DOW_MINI[dow]}</div>
                  <div>{dayNum}</div>
                </div>
              );
            })}
            <div
              style={{
                fontSize: 9.5,
                color: "var(--fg-subtle)",
                fontWeight: 600,
                textAlign: "right",
                textTransform: "uppercase",
                letterSpacing: ".05em",
              }}
            >
              Month
            </div>
          </div>

          <div
            style={{
              flex: "1 1 auto",
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              gap: 2,
              overflowY: "auto",
              overflowX: "hidden",
            }}
          >
          {habits.map((h) => {
            const cat = categoryFor(h.representative, categories, projects);
            const colors = cat
              ? colorsForCategory(cat)
              : { bg: "var(--bg-sunken)", fg: "var(--fg-muted)" };
            const { exp, done } = monthStats(h);
            const pct = exp > 0 ? Math.round((done / exp) * 100) : 0;
            const todayCovered = coveredByHabit.get(h.rootId)?.has(today) ?? false;

            return (
              <div
                key={h.rootId}
                style={{
                  display: "grid",
                  gridTemplateColumns: gridCols,
                  columnGap: GAP,
                  alignItems: "center",
                  flex: "1 1 0",
                  minHeight: ROW_MIN,
                  maxHeight: ROW_MAX,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    paddingRight: 8,
                    minWidth: 0,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => onCheck(h)}
                    title={todayCovered ? "Click to unmark today" : "Mark today done"}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      border: todayCovered
                        ? "2px solid var(--ok, #2bb673)"
                        : "2px solid var(--line-strong)",
                      background: todayCovered ? "var(--ok, #2bb673)" : "transparent",
                      color: "white",
                      display: "grid",
                      placeItems: "center",
                      cursor: "pointer",
                      flex: "0 0 auto",
                      padding: 0,
                    }}
                  >
                    {todayCovered && <ICheck size={11} stroke={2.6} />}
                  </button>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 2,
                      background: colors.bg,
                      flex: "0 0 auto",
                    }}
                  />
                  <div style={{ minWidth: 0, lineHeight: 1.15 }}>
                    <div
                      style={{
                        fontSize: 12.5,
                        fontWeight: 500,
                        color: "var(--fg)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                      title={h.representative.title}
                    >
                      {h.representative.title || "Untitled"}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: "var(--fg-subtle)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {formatRule(h.rule)}
                    </div>
                  </div>
                </div>

                {(() => {
                  const startWindow = monthDays[0];
                  const endWindow = monthDays[monthDays.length - 1];
                  const covered = coveredByHabit.get(h.rootId);

                  // Anchor the period grid on the chain's actual rhythm —
                  // walk back from a known expected day in the chain via
                  // previousOccurrence until we land at or before the month
                  // start. (Walking back via isExpectedDay alone misaligns
                  // daily-every-N rules, since every calendar day matches
                  // and the walk stops on an arbitrary month edge.)
                  let cur = h.anchorDay;
                  let backGuard = 0;
                  while (cur > startWindow && backGuard < 400) {
                    const prev = previousOccurrence(h.rule, cur);
                    if (!prev || prev >= cur) break;
                    cur = prev;
                    backGuard++;
                  }
                  // If the anchor was already after the window's end, advance
                  // forward via nextOccurrence to a period that intersects.
                  let fwdAlign = 0;
                  while (cur < startWindow && fwdAlign < 400) {
                    const next = nextOccurrence(h.rule, cur);
                    if (!next || next > endWindow) break;
                    // Stop when the next period would START past startWindow;
                    // we want cur to be the last expected day at or before
                    // startWindow so the first segment can extend leftward.
                    if (next > startWindow) break;
                    cur = next;
                    fwdAlign++;
                  }

                  const segments: {
                    startIdx: number;
                    length: number;
                    state: "done" | "missed" | "future";
                    firstDay: string;
                    lastDay: string;
                    periodStart: string;
                  }[] = [];

                  let fwd = 0;
                  while (cur <= endWindow && fwd < 100) {
                    const next = nextOccurrence(h.rule, cur);
                    const periodEnd = next
                      ? ymd(addDays(fromYmd(next), -1))
                      : endWindow;

                    let hasDone = false;
                    if (covered) {
                      let d = cur;
                      let g = 0;
                      while (d <= periodEnd && g < 400) {
                        if (covered.has(d)) { hasDone = true; break; }
                        d = ymd(addDays(fromYmd(d), 1));
                        g++;
                      }
                    }
                    const state: "done" | "missed" | "future" = hasDone
                      ? "done"
                      : periodEnd < today
                        ? "missed"
                        : "future";

                    const segStart = cur < startWindow ? startWindow : cur;
                    const segEnd = periodEnd > endWindow ? endWindow : periodEnd;
                    const startIdx = monthDays.indexOf(segStart);
                    const endIdx = monthDays.indexOf(segEnd);
                    if (startIdx >= 0 && endIdx >= 0) {
                      segments.push({
                        startIdx,
                        length: endIdx - startIdx + 1,
                        state,
                        firstDay: segStart,
                        lastDay: segEnd,
                        periodStart: cur,
                      });
                    }

                    if (!next) break;
                    cur = next;
                    fwd++;
                  }

                  return segments.map((seg) => {
                    const isFused = seg.length > 1;
                    const containsToday =
                      seg.firstDay <= today && today <= seg.lastDay;
                    const bg =
                      seg.state === "done"
                        ? "var(--ok, #2bb673)"
                        : seg.state === "missed"
                          ? "var(--bg-sunken)"
                          : "transparent";
                    const border =
                      seg.state === "future"
                        ? containsToday
                          ? "1.5px solid var(--accent)"
                          : "1px dashed var(--line)"
                        : "1px solid rgba(0,0,0,0.06)";

                    // A segment is clickable when its start is today or in the
                    // past (done/missed periods), or when it is the current
                    // period (future state but contains today).
                    const isClickable =
                      seg.state !== "future" || containsToday;

                    const titleText = isClickable
                      ? seg.state === "done"
                        ? isFused
                          ? `${seg.firstDay} → ${seg.lastDay} · Done — click to unmark`
                          : `${seg.firstDay} · Done — click to unmark`
                        : seg.state === "missed"
                          ? isFused
                            ? `${seg.firstDay} → ${seg.lastDay} · Missed — click to mark done`
                            : `${seg.firstDay} · Missed — click to mark done`
                          : containsToday
                            ? "Current period — click to mark done"
                            : isFused
                              ? `${seg.firstDay} → ${seg.lastDay} · ${seg.state}`
                              : `${seg.firstDay} · ${seg.state}`
                      : isFused
                        ? `${seg.firstDay} → ${seg.lastDay} · ${seg.state}`
                        : `${seg.firstDay} · ${seg.state}`;

                    const sharedStyle: React.CSSProperties = {
                      gridColumn: `${seg.startIdx + 2} / span ${seg.length}`,
                      height: "78%",
                      maxHeight: ROW_MAX - 8,
                      alignSelf: "center",
                      borderRadius: 4,
                      background: bg,
                      border,
                      boxSizing: "border-box",
                      minWidth: 0,
                    };

                    if (isClickable) {
                      return (
                        <button
                          key={seg.firstDay}
                          type="button"
                          title={titleText}
                          onClick={() =>
                            onCheckSegment(h, seg.periodStart, seg.state, containsToday)
                          }
                          style={{
                            ...sharedStyle,
                            cursor: "pointer",
                            padding: 0,
                          }}
                          className="habit-seg-btn"
                        />
                      );
                    }

                    return (
                      <div
                        key={seg.firstDay}
                        title={titleText}
                        style={sharedStyle}
                      />
                    );
                  });
                })()}

                <div
                  style={{
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                    fontSize: 11,
                    color: "var(--fg-muted)",
                  }}
                  title={`${done} of ${exp} expected days`}
                >
                  <span style={{ fontWeight: 600, color: "var(--fg)" }}>{done}</span>
                  <span style={{ color: "var(--fg-subtle)" }}>/{exp}</span>
                  <div style={{ fontSize: 9.5, color: "var(--fg-subtle)" }}>{pct}%</div>
                </div>
              </div>
            );
          })}

          </div>
          <div
            style={{
              marginTop: 10,
              paddingTop: 10,
              borderTop: "1px solid var(--line)",
              display: "flex",
              gap: 12,
              fontSize: 10.5,
              color: "var(--fg-subtle)",
              alignItems: "center",
              flexWrap: "wrap",
              flex: "0 0 auto",
            }}
          >
            <LegendSwatch color="var(--ok, #2bb673)" label="Done" />
            <LegendSwatch color="var(--bg-sunken)" label="Missed" border="1px solid rgba(0,0,0,0.06)" />
            <LegendSwatch color="transparent" label="Not scheduled / future" border="1px dashed var(--line)" />
          </div>
        </div>
      )}
    </div>
  );
}

function LegendSwatch({
  color,
  label,
  border,
}: {
  color: string;
  label: string;
  border?: string;
}) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span
        style={{
          width: 12,
          height: 12,
          borderRadius: 3,
          background: color,
          border: border ?? "1px solid rgba(0,0,0,0.06)",
        }}
      />
      {label}
    </span>
  );
}
