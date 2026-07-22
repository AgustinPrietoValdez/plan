import { useMemo } from "react";
import { categoryFor } from "../../lib/categoryFor";
import { colorsForCategory } from "../../lib/categoryColor";
import { addDays, DOW_MINI_ES, fromYmd, ymd } from "../../lib/date";
import { useToday } from "../../lib/useToday";
import { formatRule, isExpectedDay, nextOccurrence, previousOccurrence } from "../../lib/recurrence";
import { useCategories, useHabitLogs, useProjects, useTasks, useUpsertHabitLog } from "../../lib/queries";
import { useApp } from "../../lib/store";
import { useFrameScale } from "../../lib/uiScale";
import type { RecurrenceRule, Task } from "../../types";
import { ICheck } from "../icons";

function fluid(base: number): string {
  return `calc(var(--s, 2) * ${base}px)`;
}

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
  anchorDay: string;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

interface Props {
  viewMonth: string;
}

export function CalendarHabitsView({ viewMonth }: Props) {
  const tasks = useTasks().data ?? [];
  const logs = useHabitLogs().data ?? [];
  const projects = useProjects().data ?? [];
  const categories = useCategories().data ?? [];
  const upsertLog = useUpsertHabitLog();
  const { openCompletion } = useApp();
  const today = useToday();
  const s = useFrameScale();

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
      const sorted = [...instances].sort((a, b) => (a.day ?? "") < (b.day ?? "") ? 1 : -1);
      const representative = sorted[0];
      const rule = sorted.find((t) => t.recurrence)?.recurrence ?? null;
      if (!rule) continue;
      const todayActive = instances.find((t) => t.day === today && !t.done) ?? null;
      const todayDoneInstance = instances.find((t) => t.day === today && t.done);
      const todayLog = logs.find((l) => l.taskId === rootId && l.day === today && l.done);
      const todayDone = Boolean(todayDoneInstance || todayLog);
      const anchorDay =
        instances.find((t) => t.day && t.recurrence)?.day ??
        instances.find((t) => t.day)?.day ??
        today;
      out.push({ rootId, rule, representative, todayActive, todayDone, anchorDay });
    }
    return out.sort((a, b) => a.representative.title.localeCompare(b.representative.title));
  }, [tasks, logs, today]);

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
    for (const t of tasks) {
      if (!t.isHabit) continue;
      const root = t.recurrenceParentId ?? t.id;
      if (t.day && !habitAnchors.has(root)) habitAnchors.set(root, t.day);
    }

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
        const periodStart = anchor ? findPeriodStart(rule, anchor, doneDay) : doneDay;
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

  const onCheck = (h: Habit) => {
    const covered = coveredByHabit.get(h.rootId)?.has(today) ?? false;
    const periodStart = habitPeriodStart(h.rule, h.anchorDay, today);
    if (covered) {
      upsertLog.mutateAsync({ taskId: h.rootId, day: periodStart, done: false }).catch((err) =>
        window.alert(err instanceof Error ? err.message : "No se pudo guardar el hábito"),
      );
      return;
    }
    if (h.todayActive) {
      openCompletion(h.todayActive.id);
    } else {
      upsertLog.mutateAsync({ taskId: h.rootId, day: periodStart, done: true }).catch((err) =>
        window.alert(err instanceof Error ? err.message : "No se pudo guardar el hábito"),
      );
    }
  };

  const onCheckSegment = (
    h: Habit,
    segPeriodStart: string,
    state: "done" | "missed" | "future",
    containsToday: boolean,
  ) => {
    if (containsToday) {
      onCheck(h);
    } else if (state === "done") {
      upsertLog.mutateAsync({ taskId: h.rootId, day: segPeriodStart, done: false }).catch((err) =>
        window.alert(err instanceof Error ? err.message : "No se pudo guardar el hábito"),
      );
    } else if (state === "missed") {
      upsertLog.mutateAsync({ taskId: h.rootId, day: segPeriodStart, done: true }).catch((err) =>
        window.alert(err instanceof Error ? err.message : "No se pudo guardar el hábito"),
      );
    }
  };

  // These drive grid track sizing (used in raw arithmetic below), so they're
  // scaled with the numeric `s` factor rather than the `fluid()` CSS-calc
  // helper — otherwise they stay pinned at their 1× base value while every
  // surrounding measurement (fonts, gaps, the label/summary columns) scales
  // up, and the rows end up visibly squeezed. Values match the design
  // handoff's own mockup numbers (44px row, 20px check, 3px gaps) — not the
  // tighter 30/56 range the old pre-redesign HabitsView used.
  const GAP = 3 * s;
  const LABEL_W = fluid(168);
  const SUMMARY_W = fluid(56);
  const ROW_H = 44 * s;
  const CHECK_SIZE = 20 * s;
  const gridCols = `${LABEL_W} repeat(${totalDays}, minmax(0, 1fr)) ${SUMMARY_W}`;

  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", overflow: "hidden", padding: `${fluid(12)} ${fluid(20)} ${fluid(14)}` }}>
      {habits.length === 0 && (
        <div style={{ padding: `${fluid(40)} ${fluid(12)}`, textAlign: "center", color: "var(--fg-subtle)", fontSize: fluid(13), border: "1px dashed var(--line)", borderRadius: fluid(10) }}>
          Todavía no hay hábitos.
          <br />
          <span style={{ fontSize: fluid(12) }}>Abrí una tarea recurrente y marcá <strong>Seguir como hábito</strong>.</span>
        </div>
      )}

      {habits.length > 0 && (
        <div style={{ border: "1px solid var(--line)", borderRadius: fluid(14), background: "var(--bg-elev)", boxShadow: "var(--shadow-sm)", padding: fluid(14), flex: "0 1 auto", maxHeight: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: gridCols, columnGap: GAP, alignItems: "end", paddingBottom: fluid(6), borderBottom: "1px solid var(--line)", marginBottom: fluid(6), flex: "0 0 auto" }}>
            <div />
            {monthDays.map((d) => {
              const dow = fromYmd(d).getDay();
              const dayNum = Number(d.slice(8, 10));
              const isToday = d === today;
              return (
                <div key={d} style={{ textAlign: "center", fontSize: fluid(9.5), color: isToday ? "var(--accent)" : "var(--fg-subtle)", fontWeight: isToday ? 700 : 500, fontVariantNumeric: "tabular-nums", lineHeight: 1.2, minWidth: 0 }}>
                  <div style={{ fontSize: fluid(8.5), opacity: 0.7 }}>{DOW_MINI_ES[dow]}</div>
                  <div>{dayNum}</div>
                </div>
              );
            })}
            <div style={{ fontSize: fluid(9.5), color: "var(--fg-subtle)", fontWeight: 600, textAlign: "right", textTransform: "uppercase", letterSpacing: ".05em" }}>Mes</div>
          </div>

          <div className="cal-scroll" style={{ flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column", gap: GAP, overflowY: "auto", overflowX: "hidden" }}>
            {habits.map((h) => {
              const cat = categoryFor(h.representative, categories, projects);
              const colors = cat ? colorsForCategory(cat) : { bg: "var(--bg-sunken)", fg: "var(--fg-muted)" };
              const { exp, done } = monthStats(h);
              const pct = exp > 0 ? Math.round((done / exp) * 100) : 0;
              const todayCovered = coveredByHabit.get(h.rootId)?.has(today) ?? false;

              return (
                <div key={h.rootId} style={{ display: "grid", gridTemplateColumns: gridCols, columnGap: GAP, alignItems: "center", flexShrink: 0, minHeight: ROW_H }}>
                  <div style={{ display: "flex", alignItems: "center", gap: fluid(8), paddingRight: fluid(8), minWidth: 0 }}>
                    <button
                      type="button"
                      onClick={() => onCheck(h)}
                      title={todayCovered ? "Click para desmarcar hoy" : "Marcar hoy como hecho"}
                      style={{
                        width: CHECK_SIZE, height: CHECK_SIZE, borderRadius: "50%",
                        border: todayCovered ? "2px solid var(--ok)" : "2px solid var(--line-strong)",
                        background: todayCovered ? "var(--ok)" : "transparent", color: "#fff",
                        display: "grid", placeItems: "center", cursor: "pointer", flex: "0 0 auto", padding: 0,
                      }}
                    >
                      {todayCovered && <ICheck size={11} stroke={2.6} />}
                    </button>
                    <span style={{ width: fluid(8), height: fluid(8), borderRadius: 2, background: colors.bg, flex: "0 0 auto" }} />
                    <div style={{ minWidth: 0, lineHeight: 1.15 }}>
                      <div style={{ fontSize: fluid(12.5), fontWeight: 500, color: "var(--fg)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={h.representative.title}>
                        {h.representative.title || "Sin título"}
                      </div>
                      <div style={{ fontSize: fluid(10), color: "var(--fg-subtle)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {formatRule(h.rule)}
                      </div>
                    </div>
                  </div>

                  {(() => {
                    const startWindow = monthDays[0];
                    const endWindow = monthDays[monthDays.length - 1];
                    const covered = coveredByHabit.get(h.rootId);

                    let cur = h.anchorDay;
                    let backGuard = 0;
                    while (cur > startWindow && backGuard < 400) {
                      const prev = previousOccurrence(h.rule, cur);
                      if (!prev || prev >= cur) break;
                      cur = prev;
                      backGuard++;
                    }
                    let fwdAlign = 0;
                    while (cur < startWindow && fwdAlign < 400) {
                      const next = nextOccurrence(h.rule, cur);
                      if (!next || next > endWindow) break;
                      if (next > startWindow) break;
                      cur = next;
                      fwdAlign++;
                    }

                    const segments: { startIdx: number; length: number; state: "done" | "missed" | "future"; firstDay: string; lastDay: string; periodStart: string }[] = [];

                    let fwd = 0;
                    while (cur <= endWindow && fwd < 100) {
                      const next = nextOccurrence(h.rule, cur);
                      const periodEnd = next ? ymd(addDays(fromYmd(next), -1)) : endWindow;

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
                      const state: "done" | "missed" | "future" = hasDone ? "done" : periodEnd < today ? "missed" : "future";

                      const segStart = cur < startWindow ? startWindow : cur;
                      const segEnd = periodEnd > endWindow ? endWindow : periodEnd;
                      const startIdx = monthDays.indexOf(segStart);
                      const endIdx = monthDays.indexOf(segEnd);
                      if (startIdx >= 0 && endIdx >= 0) {
                        segments.push({ startIdx, length: endIdx - startIdx + 1, state, firstDay: segStart, lastDay: segEnd, periodStart: cur });
                      }
                      if (!next) break;
                      cur = next;
                      fwd++;
                    }

                    return segments.map((seg) => {
                      const isFused = seg.length > 1;
                      const containsToday = seg.firstDay <= today && today <= seg.lastDay;
                      const bg = seg.state === "done" ? "var(--ok)" : seg.state === "missed" ? "var(--bg-sunken)" : "transparent";
                      const border = seg.state === "future" ? (containsToday ? "1.5px solid var(--accent)" : "1px dashed var(--line)") : "1px solid rgba(0,0,0,0.06)";
                      const isClickable = seg.state !== "future" || containsToday;
                      const titleText = isClickable
                        ? seg.state === "done"
                          ? (isFused ? `${seg.firstDay} → ${seg.lastDay} · Hecho — click para desmarcar` : `${seg.firstDay} · Hecho — click para desmarcar`)
                          : seg.state === "missed"
                            ? (isFused ? `${seg.firstDay} → ${seg.lastDay} · Sin hacer — click para marcar hecho` : `${seg.firstDay} · Sin hacer — click para marcar hecho`)
                            : containsToday ? "Período actual — click para marcar hecho" : (isFused ? `${seg.firstDay} → ${seg.lastDay} · ${seg.state}` : `${seg.firstDay} · ${seg.state}`)
                        : (isFused ? `${seg.firstDay} → ${seg.lastDay} · ${seg.state}` : `${seg.firstDay} · ${seg.state}`);

                      const sharedStyle = {
                        gridColumn: `${seg.startIdx + 2} / span ${seg.length}`,
                        height: "72%", minHeight: 14 * s, alignSelf: "center" as const,
                        borderRadius: 4, background: bg, border, boxSizing: "border-box" as const, minWidth: 0,
                      };

                      if (isClickable) {
                        return (
                          <button
                            key={seg.firstDay}
                            type="button"
                            title={titleText}
                            onClick={() => onCheckSegment(h, seg.periodStart, seg.state, containsToday)}
                            style={{ ...sharedStyle, cursor: "pointer", padding: 0 }}
                            className="habit-seg-btn"
                          />
                        );
                      }
                      return <div key={seg.firstDay} title={titleText} style={sharedStyle} />;
                    });
                  })()}

                  <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: fluid(11), color: "var(--fg-muted)" }} title={`${done} de ${exp} días esperados`}>
                    <span style={{ fontWeight: 600, color: "var(--fg)" }}>{done}</span>
                    <span style={{ color: "var(--fg-subtle)" }}>/{exp}</span>
                    <div style={{ fontSize: fluid(9.5), color: "var(--fg-subtle)" }}>{pct}%</div>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: fluid(10), paddingTop: fluid(10), borderTop: "1px solid var(--line)", display: "flex", gap: fluid(12), fontSize: fluid(10.5), color: "var(--fg-subtle)", alignItems: "center", flexWrap: "wrap", flex: "0 0 auto" }}>
            <LegendSwatch color="var(--ok)" label="Hecho" />
            <LegendSwatch color="var(--bg-sunken)" label="Sin hacer" border="1px solid rgba(0,0,0,0.06)" />
            <LegendSwatch color="transparent" label="No programado / futuro" border="1px dashed var(--line)" />
          </div>
        </div>
      )}
    </div>
  );
}

function LegendSwatch({ color, label, border }: { color: string; label: string; border?: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: fluid(5) }}>
      <span style={{ width: fluid(12), height: fluid(12), borderRadius: 3, background: color, border: border ?? "1px solid rgba(0,0,0,0.06)" }} />
      {label}
    </span>
  );
}
