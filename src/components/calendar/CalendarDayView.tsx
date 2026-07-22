import { useDraggable, useDroppable } from "@dnd-kit/core";
import { categoryFor } from "../../lib/categoryFor";
import { colorsForCategory } from "../../lib/categoryColor";
import { priColor, priLabelEs } from "../../lib/format";
import { useApp } from "../../lib/store";
import { useCategories, useEvents, useProjects, useTasks } from "../../lib/queries";
import type { Category, CalendarEvent, Project, Task } from "../../types";
import { ICal } from "../icons";

function fluid(base: number): string {
  return `calc(var(--s, 2) * ${base}px)`;
}

interface Props {
  onTaskClick: (task: Task) => void;
  onToggleDone: (task: Task) => void;
  onEventClick: (event: CalendarEvent) => void;
}

export function CalendarDayView({ onTaskClick, onToggleDone, onEventClick }: Props) {
  const allTasks = useTasks().data ?? [];
  const projects = useProjects().data ?? [];
  const categories = useCategories().data ?? [];
  const allEvents = useEvents().data ?? [];
  const { viewDate, filterCategoryId } = useApp();
  const { setNodeRef, isOver } = useDroppable({ id: `day:${viewDate}` });

  const tasks = filterCategoryId
    ? allTasks.filter((t) => categoryFor(t, categories, projects)?.id === filterCategoryId)
    : allTasks;

  const dayEvents = allEvents
    .filter((e) => !e.deletedAt && e.day === viewDate)
    .sort((a, b) => (a.startTime ?? "00:00") < (b.startTime ?? "00:00") ? -1 : 1);
  const dayTasks = tasks.filter((t) => t.day === viewDate);
  const open = dayTasks.filter((t) => !t.done);
  const done = dayTasks.filter((t) => t.done);
  const ordered = [...open, ...done];
  const highCount = open.filter((t) => t.priority === "high").length;

  const byCat: Record<string, { cat: Category; count: number }> = {};
  dayTasks.forEach((t) => {
    const cat = categoryFor(t, categories, projects);
    if (!cat) return;
    if (!byCat[cat.id]) byCat[cat.id] = { cat, count: 0 };
    byCat[cat.id].count += 1;
  });
  const breakdown = Object.values(byCat);
  const maxCat = Math.max(1, ...breakdown.map((b) => b.count));

  return (
    <div
      style={{
        position: "absolute", inset: 0, display: "grid", gridTemplateColumns: `1fr ${fluid(300)}`, gap: fluid(16),
        overflow: "hidden", padding: `${fluid(16)} ${fluid(20)} ${fluid(18)}`,
      }}
    >
      <div
        ref={setNodeRef}
        style={{
          minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column",
          background: isOver ? "var(--accent-soft)" : undefined,
          outline: isOver ? "2px solid var(--accent)" : undefined,
          outlineOffset: isOver ? -12 : undefined,
          borderRadius: isOver ? fluid(12) : undefined,
        }}
      >
        <div className="cal-noscroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column" }}>
          <div style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--bg)", fontSize: fluid(11), fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--fg-muted)", padding: `${fluid(6)} 0` }}>
            Eventos · {dayEvents.length}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: fluid(8), paddingBottom: fluid(14) }}>
            {dayEvents.map((ev) => (
              <div
                key={ev.id}
                onClick={() => onEventClick(ev)}
                style={{ display: "flex", alignItems: "flex-start", gap: fluid(10), padding: `${fluid(10)} ${fluid(12)}`, borderRadius: fluid(10), background: "var(--accent-soft)", border: "1px solid color-mix(in oklch, var(--accent) 20%, var(--line))", cursor: "pointer" }}
              >
                <ICal size={15} stroke={1.7} style={{ color: "var(--accent)", flexShrink: 0, marginTop: 2 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: fluid(13.5), fontWeight: 600 }}>{ev.title}</div>
                  <div style={{ fontSize: fluid(11.5), color: "var(--accent)", marginTop: 2 }}>
                    {ev.endTime ? `${ev.startTime} – ${ev.endTime}` : ev.startTime}{ev.location ? ` · ${ev.location}` : ""}
                  </div>
                </div>
              </div>
            ))}
            {dayEvents.length === 0 && <Empty text="Sin eventos para este día." />}
          </div>

          <div style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--bg)", fontSize: fluid(11), fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--fg-muted)", padding: `${fluid(6)} 0` }}>
            Tareas · {dayTasks.length}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: fluid(8) }}>
            {ordered.map((t) => (
              <DayTaskRow key={t.id} task={t} categories={categories} projects={projects} onTaskClick={onTaskClick} onToggleDone={onToggleDone} />
            ))}
            {dayTasks.length === 0 && <Empty text="Nada planeado. Arrastrá una tarea del Inbox." />}
          </div>
        </div>
      </div>

      <aside style={{ minHeight: 0, overflow: "hidden", background: "var(--bg-elev)", border: "1px solid var(--line)", borderRadius: fluid(14), padding: fluid(15), boxShadow: "var(--shadow-sm)", alignSelf: "start", maxHeight: "100%" }}>
        <div style={{ fontSize: fluid(11), textTransform: "uppercase", letterSpacing: ".05em", color: "var(--fg-subtle)", fontWeight: 600, marginBottom: fluid(10) }}>
          Resumen del día
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: fluid(8), marginBottom: fluid(14) }}>
          <DayStat label="Tareas" value={open.length} tone="var(--accent)" />
          <DayStat label="Hechas" value={done.length} tone="var(--ok)" />
          <DayStat label="Eventos" value={dayEvents.length} tone="var(--violet)" />
          <DayStat label="Alta prior." value={highCount} tone="var(--danger)" />
        </div>
        <div style={{ fontSize: fluid(11), textTransform: "uppercase", letterSpacing: ".05em", color: "var(--fg-subtle)", fontWeight: 600, marginBottom: fluid(10) }}>
          Por categoría
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: fluid(9) }}>
          {breakdown.map(({ cat, count }) => {
            const dot = colorsForCategory(cat).bg;
            return (
              <div key={cat.id}>
                <div style={{ display: "flex", alignItems: "center", gap: fluid(8), marginBottom: fluid(4) }}>
                  <span style={{ width: fluid(9), height: fluid(9), borderRadius: "50%", background: dot, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: fluid(12), fontWeight: 500 }}>{cat.name}</span>
                  <span style={{ fontSize: fluid(11), color: "var(--fg-subtle)", fontVariantNumeric: "tabular-nums" }}>{count}</span>
                </div>
                <div style={{ height: fluid(6), borderRadius: 999, background: "var(--bg-sunken)", overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 999, background: dot, width: `${Math.round((count / maxCat) * 100)}%` }} />
                </div>
              </div>
            );
          })}
          {breakdown.length === 0 && <Empty text="Sin tareas categorizadas hoy." />}
        </div>
      </aside>
    </div>
  );
}

function DayStat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div style={{ background: "var(--bg-sunken)", border: "1px solid var(--line)", borderRadius: fluid(9), padding: `${fluid(11)} ${fluid(12)}` }}>
      <div style={{ fontSize: fluid(10.5), color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: ".05em" }}>{label}</div>
      <div style={{ fontSize: fluid(21), fontWeight: 600, letterSpacing: "-0.01em", marginTop: 2, fontVariantNumeric: "tabular-nums", color: tone }}>{value}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div style={{ fontSize: fluid(11.5), color: "var(--fg-subtle)", padding: `${fluid(6)} 0` }}>{text}</div>;
}

function DayTaskRow({
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
        display: "flex", alignItems: "center", gap: fluid(11), padding: `${fluid(11)} ${fluid(13)}`, border: "1px solid var(--line)",
        borderRadius: fluid(10), background: "var(--bg-elev)", boxShadow: "var(--shadow-sm)", borderLeft: `3px solid ${colors.bg}`,
        cursor: "pointer", opacity: isDragging ? 0.4 : 1,
      }}
    >
      <span
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onToggleDone(task); }}
        style={{
          width: fluid(18), height: fluid(18), borderRadius: fluid(5), flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
          border: `1.5px solid ${task.done ? "var(--ok)" : "var(--line-strong)"}`, background: task.done ? "var(--ok)" : "transparent",
        }}
      >
        {task.done && (
          <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12l4.5 4.5L19 7" />
          </svg>
        )}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: fluid(14), fontWeight: 500, textDecoration: task.done ? "line-through" : undefined, color: task.done ? "var(--fg-subtle)" : "var(--fg)" }}>
          {task.title}
        </div>
        <div style={{ fontSize: fluid(11.5), color: "var(--fg-muted)", marginTop: 3, display: "flex", alignItems: "center", gap: fluid(7) }}>
          <span style={{ color: priColor(task.priority), fontWeight: 600 }}>
            {priLabelEs(task.priority)}
          </span>
          <span style={{ color: "var(--line-strong)" }}>·</span>
          <span>{cat?.name ?? "Sin categoría"}</span>
          {task.recurring && (
            <>
              <span style={{ color: "var(--line-strong)" }}>·</span>
              <span>se repite</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
