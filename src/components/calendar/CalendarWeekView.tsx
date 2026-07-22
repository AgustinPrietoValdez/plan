import { useDraggable } from "@dnd-kit/core";
import { useMemo, type CSSProperties } from "react";
import { DOW_LONG_ES, addDays, fromYmd, startOfWeek, todayYmd, ymd } from "../../lib/date";
import { categoryFor, projectFor } from "../../lib/categoryFor";
import { colorsForCategory } from "../../lib/categoryColor";
import { fmtDuration, priLabelEs } from "../../lib/format";
import { useApp } from "../../lib/store";
import { useCategories, useEvents, useProjects, useTasks } from "../../lib/queries";
import type { CalendarEvent, Category, Project, Task } from "../../types";
import { CalDroppableCell } from "./CalDroppableCell";

function fluid(base: number): string {
  return `calc(var(--s, 2) * ${base}px)`;
}

interface Props {
  onTaskClick: (task: Task) => void;
  onToggleDone: (task: Task) => void;
  onEventClick: (event: CalendarEvent) => void;
}

export function CalendarWeekView({ onTaskClick, onToggleDone, onEventClick }: Props) {
  const allTasks = useTasks().data ?? [];
  const projects = useProjects().data ?? [];
  const categories = useCategories().data ?? [];
  const allEvents = useEvents().data ?? [];
  const { viewDate, filterCategoryId } = useApp();

  const tasks = filterCategoryId
    ? allTasks.filter((t) => categoryFor(t, categories, projects)?.id === filterCategoryId)
    : allTasks;

  const start = startOfWeek(fromYmd(viewDate));
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const today = todayYmd();

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
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", overflow: "hidden", padding: `${fluid(14)} ${fluid(20)} ${fluid(18)}` }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", marginBottom: fluid(8), gap: fluid(8) }}>
        {days.map((d, i) => {
          const isToday = ymd(d) === today;
          const tone = isToday ? "var(--accent)" : "var(--fg)";
          return (
            <div key={i} style={{ display: "flex", alignItems: "baseline", gap: fluid(7), paddingLeft: fluid(2) }}>
              <span style={{ fontSize: fluid(11), fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: tone }}>{DOW_LONG_ES[d.getDay()].slice(0, 3)}</span>
              <span style={{ fontSize: fluid(15), fontWeight: 600, color: tone }}>{d.getDate()}</span>
            </div>
          );
        })}
      </div>
      <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: fluid(8) }}>
        {days.map((d, i) => {
          const dayKey = ymd(d);
          const isToday = dayKey === today;
          const dayEvs = (eventsByDay[dayKey] ?? []).slice().sort((a, b) => (a.startTime ?? "") < (b.startTime ?? "") ? -1 : 1);
          const dayTasks = tasksByDay[dayKey] ?? [];
          const empty = dayEvs.length === 0 && dayTasks.length === 0;

          const baseStyle: CSSProperties = {
            display: "flex", flexDirection: "column", gap: fluid(5), padding: `${fluid(10)} ${fluid(10)} ${fluid(12)}`, borderRadius: fluid(12),
            border: `1px solid ${isToday ? "color-mix(in oklch, var(--accent) 40%, var(--line))" : "var(--line)"}`,
            background: isToday ? "var(--accent-soft)" : "var(--bg-elev)",
            boxShadow: "var(--shadow-sm)", overflowY: "auto", minHeight: 0,
          };
          const overStyle = { outline: "2px dashed var(--accent)", outlineOffset: -3, background: "var(--accent-soft)" };

          return (
            <CalDroppableCell key={i} dayKey={dayKey} style={baseStyle} overStyle={overStyle}>
              <div className="cal-scroll" style={{ display: "flex", flexDirection: "column", gap: fluid(5) }}>
                {dayEvs.map((ev) => (
                  <div
                    key={ev.id}
                    onClick={() => onEventClick(ev)}
                    style={{ display: "flex", flexDirection: "column", gap: fluid(2), padding: `${fluid(6)} ${fluid(8)}`, borderRadius: fluid(7), background: "var(--accent-soft)", borderLeft: "2px solid var(--accent)", flexShrink: 0, cursor: "pointer" }}
                  >
                    <span style={{ fontSize: fluid(11.5), fontWeight: 600, color: "var(--fg)" }}>{ev.title}</span>
                    <span style={{ fontSize: fluid(10), fontWeight: 600, color: "var(--accent)", fontVariantNumeric: "tabular-nums", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {ev.endTime ? `${ev.startTime} – ${ev.endTime}` : ev.startTime}
                    </span>
                  </div>
                ))}
                {dayTasks.map((t) => (
                  <WeekTaskCard key={t.id} task={t} categories={categories} projects={projects} onTaskClick={onTaskClick} onToggleDone={onToggleDone} />
                ))}
                {empty && <div style={{ fontSize: fluid(11.5), color: "var(--fg-subtle)", padding: `${fluid(4)} ${fluid(2)}` }}>—</div>}
              </div>
            </CalDroppableCell>
          );
        })}
      </div>
    </div>
  );
}

function WeekTaskCard({
  task, categories, projects, onTaskClick, onToggleDone,
}: {
  task: Task; categories: Category[]; projects: Project[];
  onTaskClick: (t: Task) => void; onToggleDone: (t: Task) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id, data: { task } });
  const cat = categoryFor(task, categories, projects);
  const colors = cat ? colorsForCategory(cat) : { bg: "var(--bg-sunken)", fg: "var(--fg-muted)" };
  const proj = projectFor(task, projects);
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={(e) => { e.stopPropagation(); onTaskClick(task); }}
      style={{
        display: "flex", flexDirection: "column", gap: fluid(3), padding: `${fluid(6)} ${fluid(8)}`, borderRadius: fluid(7),
        flexShrink: 0, cursor: "grab", background: colors.bg, color: colors.fg, opacity: isDragging ? 0.4 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: fluid(5) }}>
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
        <span style={{ fontSize: fluid(11.5), fontWeight: 500, lineHeight: 1.25, textDecoration: task.done ? "line-through" : undefined, opacity: task.done ? 0.6 : 1 }}>
          {task.title}
        </span>
      </div>
      <div style={{ fontSize: fluid(10), opacity: 0.75, display: "flex", gap: fluid(5), alignItems: "center", paddingLeft: fluid(17) }}>
        {proj && <span>{proj.name}</span>}
        {!proj && cat && <span>{cat.name}</span>}
        <span>·</span>
        <span>{priLabelEs(task.priority)}</span>
        <span>·</span>
        <span>{fmtDuration(task.duration)}</span>
      </div>
    </div>
  );
}
