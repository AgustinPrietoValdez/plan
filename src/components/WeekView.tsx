import { useDraggable } from "@dnd-kit/core";
import { useMemo } from "react";
import {
  DOW_SHORT,
  addDays,
  fromYmd,
  startOfWeek,
  todayYmd,
  ymd,
} from "../lib/date";
import { categoryFor, projectFor } from "../lib/categoryFor";
import { colorsForCategory } from "../lib/categoryColor";
import { fmtDuration } from "../lib/format";
import { vars } from "../lib/style";
import { useApp } from "../lib/store";
import { useCategories, useProjects, useTasks } from "../lib/queries";
import { isNotFinished } from "../lib/taskState";
import type { Category, Project, Task } from "../types";
import { DroppableDayCell } from "./dnd/DroppableDayCell";
import { ICheck } from "./icons";

interface Props {
  onTaskClick: (task: Task) => void;
  onToggleDone: (task: Task) => void;
}

export function WeekView({ onTaskClick, onToggleDone }: Props) {
  const tasksQ = useTasks();
  const projectsQ = useProjects();
  const categoriesQ = useCategories();
  const allTasks = tasksQ.data ?? [];
  const projects = projectsQ.data ?? [];
  const categories = categoriesQ.data ?? [];
  const { viewDate, filterCategoryId } = useApp();

  const tasks = filterCategoryId
    ? allTasks.filter((t) => categoryFor(t, categories, projects)?.id === filterCategoryId)
    : allTasks;

  const start = startOfWeek(fromYmd(viewDate));
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));

  const tasksByDay = useMemo(() => {
    const m: Record<string, Task[]> = {};
    tasks.forEach((t) => {
      if (t.day) (m[t.day] = m[t.day] ?? []).push(t);
    });
    return m;
  }, [tasks]);

  const today = todayYmd();

  return (
    <div className="calendar">
      <div className="month-dow" style={{ gridTemplateColumns: "repeat(7,1fr)" }}>
        {days.map((d, i) => {
          const isToday = ymd(d) === today;
          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 8,
                color: isToday ? "var(--accent)" : undefined,
              }}
            >
              {DOW_SHORT[d.getDay()]}
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: isToday ? "var(--accent)" : "var(--fg)",
                  textTransform: "none",
                  letterSpacing: 0,
                }}
              >
                {d.getDate()}
              </span>
            </div>
          );
        })}
      </div>
      <div className="month-grid" style={{ gridAutoRows: "1fr" }}>
        {days.map((d, i) => {
          const dayKey = ymd(d);
          const dayTasks = tasksByDay[dayKey] ?? [];
          const isToday = dayKey === today;
          const className = ["day-cell", isToday ? "today" : ""].filter(Boolean).join(" ");
          return (
            <DroppableDayCell
              key={i}
              dayKey={dayKey}
              className={className}
              style={{ padding: "10px 10px 12px" }}
            >
              <div className="day-tasks" style={{ gap: 5 }}>
                {dayTasks.length === 0 && (
                  <div style={{ fontSize: 11.5, color: "var(--fg-subtle)", padding: "4px 0" }}>—</div>
                )}
                {dayTasks.map((t) => (
                  <WeekDayTask
                    key={t.id}
                    task={t}
                    categories={categories}
                    projects={projects}
                    onTaskClick={onTaskClick}
                    onToggleDone={onToggleDone}
                  />
                ))}
              </div>
            </DroppableDayCell>
          );
        })}
      </div>
    </div>
  );
}

function WeekDayTask({
  task,
  categories,
  projects,
  onTaskClick,
  onToggleDone,
}: {
  task: Task;
  categories: Category[];
  projects: Project[];
  onTaskClick: (t: Task) => void;
  onToggleDone: (t: Task) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    data: { task },
  });
  const cat = categoryFor(task, categories, projects);
  const colors = cat
    ? colorsForCategory(cat)
    : { bg: "var(--bg-sunken)", fg: "var(--fg-muted)" };
  const proj = projectFor(task, projects);
  const className = [
    "day-task",
    task.done ? "done" : "",
    isDragging ? "dragging" : "",
    isNotFinished(task) ? "not-finished" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div
      ref={setNodeRef}
      className={className}
      style={vars(
        { "--cat-bg": colors.bg, "--cat-fg": colors.fg },
        {
          padding: "5px 8px",
          flexDirection: "column",
          alignItems: "flex-start",
          whiteSpace: "normal",
          gap: 3,
        },
      )}
      onClick={(e) => {
        e.stopPropagation();
        if (!(e.target as HTMLElement).closest(".check")) onTaskClick(task);
      }}
      {...attributes}
      {...listeners}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 5, width: "100%" }}>
        <span
          className="check"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onToggleDone(task);
          }}
        >
          {task.done && <ICheck size={7} stroke={3} />}
        </span>
        <span
          className="label"
          style={{ whiteSpace: "normal", fontWeight: 500, fontSize: 12 }}
        >
          {task.title}
        </span>
      </div>
      <div
        style={{
          fontSize: 10.5,
          opacity: 0.75,
          display: "flex",
          gap: 6,
          alignItems: "center",
        }}
      >
        {proj && <span>{proj.name}</span>}
        {proj && <span>·</span>}
        <span>{fmtDuration(task.duration)}</span>
      </div>
    </div>
  );
}
