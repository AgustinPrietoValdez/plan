import { useDraggable } from "@dnd-kit/core";
import { useMemo } from "react";
import { DOW_LONG_ES, MONTH_SHORT_ES, addDays, fromYmd, startOfMonth, startOfWeek, todayYmd, ymd } from "../../lib/date";
import { categoryFor } from "../../lib/categoryFor";
import { colorsForCategory } from "../../lib/categoryColor";
import { priColor } from "../../lib/format";
import { useApp } from "../../lib/store";
import { useCategories, useEvents, useProjects, useTasks } from "../../lib/queries";
import type { CalendarEvent, Category, Project, Task } from "../../types";
import { CalDroppableCell } from "./CalDroppableCell";
import { IPlus } from "../icons";

const MAX_VISIBLE = 3;

function fluid(base: number): string {
  return `calc(var(--s, 2) * ${base}px)`;
}

interface Props {
  onTaskClick: (task: Task) => void;
  onDayClick: (day: string) => void;
  onToggleDone: (task: Task) => void;
  onEventClick: (event: CalendarEvent) => void;
}

export function CalendarMonthView({ onTaskClick, onDayClick, onToggleDone, onEventClick }: Props) {
  const allTasks = useTasks().data ?? [];
  const projects = useProjects().data ?? [];
  const categories = useCategories().data ?? [];
  const allEvents = useEvents().data ?? [];
  const { viewDate, filterCategoryId } = useApp();

  const tasks = filterCategoryId
    ? allTasks.filter((t) => categoryFor(t, categories, projects)?.id === filterCategoryId)
    : allTasks;

  const anchor = fromYmd(viewDate);
  const viewMonth = anchor.getMonth();
  const today = todayYmd();

  // Only the weeks the month actually needs (4–6), not a fixed 6-row grid —
  // otherwise short months (e.g. a Sunday-starting 28-day February) render a
  // trailing all-next-month week of empty-looking cells.
  const cells = useMemo(() => {
    const first = startOfMonth(anchor);
    const start = startOfWeek(first);
    const daysInMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
    const weeks = Math.ceil((first.getDay() + daysInMonth) / 7);
    return Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewDate]);

  const tasksByDay = useMemo(() => {
    const m: Record<string, Task[]> = {};
    tasks.forEach((t) => { if (t.day) (m[t.day] = m[t.day] ?? []).push(t); });
    return m;
  }, [tasks]);
  const eventsByDay = useMemo(() => {
    const m: Record<string, CalendarEvent[]> = {};
    allEvents.filter((e) => !e.deletedAt).forEach((e) => { (m[e.day] = m[e.day] ?? []).push(e); });
    return m;
  }, [allEvents]);

  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", overflow: "hidden", padding: `${fluid(8)} ${fluid(20)} ${fluid(12)}` }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", marginBottom: fluid(4) }}>
        {DOW_LONG_ES.map((d) => (
          <div key={d} style={{ fontSize: fluid(11), fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--fg-subtle)", paddingLeft: fluid(4) }}>
            {d.slice(0, 3)}
          </div>
        ))}
      </div>
      <div className="cal-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "grid", gridTemplateColumns: "repeat(7,1fr)", gridAutoRows: `minmax(${fluid(96)}, 1fr)`, gap: fluid(8) }}>
        {cells.map((d, i) => {
          const dayKey = ymd(d);
          const otherMonth = d.getMonth() !== viewMonth;
          const isToday = dayKey === today;
          const isWeekend = d.getDay() === 0 || d.getDay() === 6;
          const dayEvs = (eventsByDay[dayKey] ?? []).slice().sort((a, b) => (a.startTime ?? "") < (b.startTime ?? "") ? -1 : 1);
          const dayTasks = tasksByDay[dayKey] ?? [];
          const total = dayEvs.length + dayTasks.length;
          const cap = total > MAX_VISIBLE ? MAX_VISIBLE - 1 : MAX_VISIBLE;
          const evShown = dayEvs.slice(0, Math.min(dayEvs.length, cap));
          const taskSlots = Math.max(0, cap - evShown.length);
          const tShown = dayTasks.slice(0, taskSlots);
          const more = total - evShown.length - tShown.length;

          const baseStyle = {
            display: "flex", flexDirection: "column", padding: `${fluid(8)} ${fluid(8)} ${fluid(6)}`, borderRadius: fluid(12),
            border: `1px solid ${isToday ? "color-mix(in oklch, var(--accent) 40%, var(--line))" : "var(--line)"}`,
            background: isToday ? "var(--accent-soft)" : otherMonth ? "var(--bg-sunken)" : "var(--bg-elev)",
            boxShadow: otherMonth ? "none" : "var(--shadow-sm)", overflow: "hidden", cursor: "pointer",
            opacity: otherMonth ? 0.7 : 1,
          } as const;
          const overStyle = { outline: "2px dashed var(--accent)", outlineOffset: -3, background: "var(--accent-soft)" };

          return (
            <CalDroppableCell key={i} dayKey={dayKey} style={baseStyle} overStyle={overStyle} onClick={() => onDayClick(dayKey)}>
              <div style={{ display: "flex", alignItems: "center", gap: fluid(5), marginBottom: fluid(5), flexShrink: 0 }}>
                <span
                  style={{
                    fontSize: fluid(13), fontWeight: 600, fontVariantNumeric: "tabular-nums",
                    color: isToday ? "#fff" : isWeekend && !otherMonth ? "var(--fg-muted)" : "var(--fg)",
                    width: isToday ? fluid(22) : "auto", height: isToday ? fluid(22) : "auto",
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    borderRadius: isToday ? "50%" : 0, background: isToday ? "var(--accent)" : "transparent",
                  }}
                >
                  {d.getDate()}
                </span>
                {d.getDate() === 1 && (
                  <span style={{ fontSize: fluid(9.5), fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--fg-subtle)" }}>
                    {MONTH_SHORT_ES[d.getMonth()]}
                  </span>
                )}
                <span style={{ flex: 1 }} />
                <button
                  onClick={(e) => { e.stopPropagation(); onDayClick(dayKey); }}
                  title="Agregar tarea este día"
                  style={{ width: fluid(16), height: fluid(16), borderRadius: fluid(5), border: "none", background: "none", color: "var(--fg-subtle)", opacity: 0.55, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                >
                  <IPlus size={11} />
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: fluid(3), overflow: "hidden", flex: 1, minHeight: 0 }}>
                {evShown.map((ev) => (
                  <div
                    key={ev.id}
                    onClick={(e) => { e.stopPropagation(); onEventClick(ev); }}
                    style={{ display: "flex", alignItems: "center", gap: fluid(5), padding: `${fluid(2)} ${fluid(6)}`, borderRadius: fluid(5), background: "var(--accent-soft)", borderLeft: "2px solid var(--accent)", flexShrink: 0 }}
                  >
                    <span style={{ fontSize: fluid(9.5), fontWeight: 700, color: "var(--accent)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", flexShrink: 0 }}>{ev.startTime ?? "·"}</span>
                    <span style={{ fontSize: fluid(10.5), fontWeight: 500, color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{ev.title}</span>
                  </div>
                ))}
                {tShown.map((t) => (
                  <MonthTaskChip key={t.id} task={t} categories={categories} projects={projects} onTaskClick={onTaskClick} onToggleDone={onToggleDone} />
                ))}
                {more > 0 && (
                  <div style={{ fontSize: fluid(10), color: "var(--fg-subtle)", fontWeight: 600, paddingLeft: fluid(4), flexShrink: 0 }}>+{more} más</div>
                )}
              </div>
            </CalDroppableCell>
          );
        })}
      </div>
    </div>
  );
}

function MonthTaskChip({
  task, categories, projects, onTaskClick, onToggleDone,
}: {
  task: Task; categories: Category[]; projects: Project[];
  onTaskClick: (t: Task) => void; onToggleDone: (t: Task) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id, data: { task } });
  const cat = categoryFor(task, categories, projects);
  const colors = cat ? colorsForCategory(cat) : { bg: "var(--bg-sunken)", fg: "var(--fg-muted)" };
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={(e) => { e.stopPropagation(); onTaskClick(task); }}
      style={{
        display: "flex", alignItems: "center", gap: fluid(5), padding: `${fluid(2)} ${fluid(6)}`, borderRadius: fluid(5),
        flexShrink: 0, cursor: "grab", background: colors.bg, color: colors.fg, opacity: isDragging ? 0.4 : 1,
      }}
    >
      <span style={{ width: fluid(6), height: fluid(6), borderRadius: "50%", flexShrink: 0, background: priColor(task.priority) }} />
      <span
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onToggleDone(task); }}
        style={{
          width: fluid(12), height: fluid(12), borderRadius: fluid(4), flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
          border: `1.4px solid ${task.done ? "var(--ok)" : `color-mix(in oklch, ${colors.fg} 45%, transparent)`}`,
          background: task.done ? "var(--ok)" : "transparent",
        }}
      >
        {task.done && (
          <svg width={7} height={7} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12l4.5 4.5L19 7" />
          </svg>
        )}
      </span>
      <span style={{ fontSize: fluid(10.5), fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: task.done ? "line-through" : undefined, opacity: task.done ? 0.6 : 1 }}>
        {task.title}
      </span>
    </div>
  );
}
