import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import {
  DOW_LONG_ES,
  MONTH_LONG_ES,
  MONTH_SHORT_ES,
  addDays,
  fromYmd,
  startOfWeek,
  todayYmd,
  ymd,
} from "../../lib/date";
import { useFrameScale } from "../../lib/uiScale";
import { useApp, type View } from "../../lib/store";
import { useProjects, useTasks } from "../../lib/queries";
import type { CalendarEvent, Task } from "../../types";
import { ProjectView } from "../ProjectView";
import { CalendarContextPanel } from "./CalendarContextPanel";
import { CalendarInboxStrip } from "./CalendarInboxStrip";
import { CalendarMonthView } from "./CalendarMonthView";
import { CalendarWeekView } from "./CalendarWeekView";
import { CalendarDayView } from "./CalendarDayView";
import { CalendarHabitsView } from "./CalendarHabitsView";
import { CalendarRecurringView } from "./CalendarRecurringView";
import { ICal, IChevL, IChevR, IColumns, IFilter, IHabit, IList, IPlus, IRecurring, ISun } from "../icons";

function fluid(base: number): string {
  return `calc(var(--s, 2) * ${base}px)`;
}

const TABS: { view: View; label: string; icon: (size: number) => React.ReactNode }[] = [
  { view: "day", label: "Día", icon: (s) => <ISun size={s} stroke={1.7} /> },
  { view: "week", label: "Semana", icon: (s) => <IColumns size={s} stroke={1.7} /> },
  { view: "month", label: "Mes", icon: (s) => <ICal size={s} stroke={1.7} /> },
  { view: "project", label: "Proyecto", icon: (s) => <IList size={s} stroke={1.7} /> },
  { view: "habits", label: "Hábitos", icon: (s) => <IHabit size={s} stroke={1.7} /> },
  { view: "recurring", label: "Recurrentes", icon: (s) => <IRecurring size={s} stroke={1.7} /> },
];

function todayMonthKey(): string {
  return todayYmd().slice(0, 7);
}

interface Props {
  onTaskClick: (task: Task) => void;
  onDayClick: (day: string) => void;
  onToggleDone: (task: Task) => void;
  onEventClick: (event: CalendarEvent) => void;
  onAddNew: () => void;
  onAddNewWithPrefill: (prefill: Partial<Task>) => void;
}

export function CalendarView({ onTaskClick, onDayClick, onToggleDone, onEventClick, onAddNew, onAddNewWithPrefill }: Props) {
  const s = useFrameScale();
  const { view, setView, viewDate, setViewDate, setSelectedDay, viewProjectId, openProjectManager } = useApp();
  const [inboxOpen, setInboxOpen] = useState(true);
  const [habitsMonth, setHabitsMonth] = useState(todayMonthKey);
  const projects = useProjects().data ?? [];
  const tasks = useTasks().data ?? [];

  const habitCount = useMemo(() => {
    const roots = new Set<string>();
    for (const t of tasks) {
      if (!t.isHabit || t.deletedAt || !t.recurrence) continue;
      roots.add(t.recurrenceParentId ?? t.id);
    }
    return roots.size;
  }, [tasks]);

  const showNav = view === "day" || view === "week" || view === "month" || view === "habits";
  const showFilter = view === "day" || view === "week" || view === "month";
  const showAdd = view === "day" || view === "week" || view === "month" || view === "habits" || view === "project" || view === "recurring";
  const showInbox = view === "day" || view === "week" || view === "month";
  const addLabel = view === "habits" ? "Agregar hábito" : view === "project" ? "Agregar proyecto" : "Agregar tarea";

  const vd = fromYmd(viewDate);

  const shift = (dir: 1 | -1) => {
    if (view === "habits") {
      const [y, m] = habitsMonth.split("-").map(Number);
      let year = y;
      let month = m - 1 + dir;
      while (month > 11) { month -= 12; year += 1; }
      while (month < 0) { month += 12; year -= 1; }
      setHabitsMonth(`${year}-${String(month + 1).padStart(2, "0")}`);
      return;
    }
    const d = new Date(vd);
    if (view === "month") d.setMonth(d.getMonth() + dir);
    else if (view === "week") d.setDate(d.getDate() + dir * 7);
    else d.setDate(d.getDate() + dir);
    setViewDate(ymd(d));
  };
  const goToday = () => {
    if (view === "habits") {
      setHabitsMonth(todayMonthKey());
      return;
    }
    const t = todayYmd();
    setViewDate(t);
    setSelectedDay(t);
  };

  let headerTitle = "";
  let headerSub = "";
  if (view === "month") {
    headerTitle = `${MONTH_LONG_ES[vd.getMonth()].replace(/^./, (c) => c.toUpperCase())} ${vd.getFullYear()}`;
    headerSub = "Tus tareas y eventos, mes a mes";
  } else if (view === "week") {
    const ws = startOfWeek(vd);
    const we = addDays(ws, 6);
    const sameMonth = ws.getMonth() === we.getMonth();
    headerTitle = `${ws.getDate()} ${MONTH_SHORT_ES[ws.getMonth()]} – ${sameMonth ? "" : MONTH_SHORT_ES[we.getMonth()] + " "}${we.getDate()} ${we.getFullYear()}`;
    headerSub = "Semana de un vistazo";
  } else if (view === "day") {
    headerTitle = `${DOW_LONG_ES[vd.getDay()]}, ${vd.getDate()} de ${MONTH_LONG_ES[vd.getMonth()]}`;
    headerSub = viewDate === todayYmd() ? "Hoy" : "Plan del día";
  } else if (view === "habits") {
    const [hy, hm] = habitsMonth.split("-").map(Number);
    headerTitle = `${habitCount} hábito${habitCount === 1 ? "" : "s"}`;
    headerSub = `Seguimiento · ${MONTH_LONG_ES[hm - 1].replace(/^./, (c) => c.toUpperCase())} ${hy}`;
  } else if (view === "recurring") {
    headerTitle = "Recurrentes";
    headerSub = "Tareas que se repiten según una regla";
  } else {
    const project = viewProjectId ? projects.find((p) => p.id === viewProjectId) : null;
    headerTitle = project ? project.name : "Proyectos";
    headerSub = project ? "" : "Elegí uno de la lista o creá uno nuevo";
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden", ["--s" as string]: s } as CSSProperties}>
      <div style={{ padding: `${fluid(20)} ${fluid(20)} 0`, borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: fluid(12), marginBottom: fluid(10) }}>
          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: fluid(38), height: fluid(38), borderRadius: fluid(9), color: "var(--accent)", background: "color-mix(in oklch, var(--accent) 15%, var(--bg))", flexShrink: 0, fontSize: fluid(19) }}>
            📅
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: fluid(22), fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.15 }}>{headerTitle}</h2>
            <div style={{ fontSize: fluid(13), color: "var(--fg-muted)", marginTop: 2 }}>{headerSub}</div>
          </div>
          {(showNav || showFilter || showAdd) && (
            <div style={{ display: "flex", alignItems: "center", gap: fluid(6) }}>
              {showNav && (
                <>
                  <button onClick={() => shift(-1)} title="Anterior" style={navBtnStyle()}>
                    <IChevL size={15} />
                  </button>
                  <button onClick={() => shift(1)} title="Siguiente" style={navBtnStyle()}>
                    <IChevR size={15} />
                  </button>
                  <button onClick={goToday} style={pillBtnStyle()}>Hoy</button>
                </>
              )}
              {showFilter && (
                <button style={pillBtnStyle(true)}>
                  <IFilter size={13} /> Filtrar
                </button>
              )}
              {showAdd && (
                <button
                  onClick={() => {
                    if (view === "project") openProjectManager();
                    else onAddNewWithPrefill(view === "day" ? { day: viewDate } : view === "habits" ? { isHabit: true } : {});
                  }}
                  style={{ height: fluid(30), padding: `0 ${fluid(13)}`, borderRadius: fluid(8), border: "none", background: "var(--accent)", color: "#fff", fontSize: fluid(12.5), fontWeight: 600, display: "inline-flex", alignItems: "center", gap: fluid(5), cursor: "pointer" }}
                >
                  <IPlus size={14} /> {addLabel}
                </button>
              )}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 2, alignItems: "flex-end" }}>
          {TABS.map((t) => {
            const active = t.view === view;
            return (
              <div
                key={t.view}
                onClick={() => setView(t.view)}
                style={{
                  padding: `${fluid(9)} ${fluid(16)}`, borderRadius: `${fluid(9)} ${fluid(9)} 0 0`, fontSize: fluid(13), fontWeight: 600,
                  cursor: "pointer", display: "inline-flex", alignItems: "center", gap: fluid(7), marginBottom: -1,
                  border: `1px solid ${active ? "var(--line)" : "transparent"}`, borderBottom: "none",
                  background: active ? "var(--bg-sunken)" : "transparent",
                  color: active ? "var(--fg)" : "var(--fg-muted)",
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: fluid(15), height: fluid(15) }}>
                  {t.icon(14)}
                </span>
                {t.label}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>
        <CalendarContextPanel />

        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {showInbox && (
            <CalendarInboxStrip open={inboxOpen} onToggleOpen={() => setInboxOpen((o) => !o)} onAddNew={onAddNew} onOpen={onTaskClick} />
          )}

          <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
            {view === "month" && (
              <CalendarMonthView onTaskClick={onTaskClick} onDayClick={onDayClick} onToggleDone={onToggleDone} onEventClick={onEventClick} />
            )}
            {view === "week" && (
              <CalendarWeekView onTaskClick={onTaskClick} onToggleDone={onToggleDone} onEventClick={onEventClick} />
            )}
            {view === "day" && (
              <CalendarDayView onTaskClick={onTaskClick} onToggleDone={onToggleDone} onEventClick={onEventClick} />
            )}
            {view === "project" && (
              // ProjectView isn't ported to the fluid()/--s frame system (its
              // spec wasn't detailed in the handoff) — it still lays out in
              // raw 1x px. `zoom` scales its whole subtree (fonts, padding,
              // borders included) so it doesn't read as tiny next to the
              // fluid-scaled chrome around it.
              <div style={{ position: "absolute", inset: 0, overflow: "auto" }} className="cal-scroll">
                <div style={{ zoom: s, padding: 20 } as CSSProperties}>
                  <ProjectView onTaskClick={onTaskClick} onToggleDone={onToggleDone} onAddNew={onAddNewWithPrefill} />
                </div>
              </div>
            )}
            {view === "habits" && <CalendarHabitsView viewMonth={habitsMonth} />}
            {view === "recurring" && <CalendarRecurringView />}
          </div>
        </div>
      </div>
    </div>
  );
}

function navBtnStyle(): CSSProperties {
  return { width: fluid(30), height: fluid(30), borderRadius: fluid(8), border: "1px solid var(--line)", background: "var(--bg-elev)", color: "var(--fg-muted)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" };
}

function pillBtnStyle(withIcon = false): CSSProperties {
  return {
    height: fluid(30), padding: `0 ${fluid(withIcon ? 12 : 13)}`, borderRadius: fluid(8), border: "1px solid var(--line)", background: "var(--bg-elev)",
    color: "var(--fg)", fontSize: fluid(12.5), fontWeight: withIcon ? 500 : 600, cursor: "pointer",
    display: withIcon ? "inline-flex" : undefined, alignItems: withIcon ? "center" : undefined, gap: withIcon ? fluid(5) : undefined,
  };
}
