import { useDraggable } from "@dnd-kit/core";
import { useMemo } from "react";
import {
  DOW_SHORT,
  MONTH_SHORT,
  fromYmd,
  getMonthGrid,
  todayYmd,
  ymd,
} from "../lib/date";
import { categoryFor } from "../lib/categoryFor";
import { colorsForCategory } from "../lib/categoryColor";
import { priColor } from "../lib/format";
import { vars } from "../lib/style";
import { useApp } from "../lib/store";
import { useCategories, useEvents, useProjects, useTasks } from "../lib/queries";
import { isNotFinished } from "../lib/taskState";
import type { CalendarEvent, Category, Project, Task } from "../types";
import { DroppableDayCell } from "./dnd/DroppableDayCell";
import { EventChip } from "./EventEditor";
import { ICheck, IPlus } from "./icons";

const MAX_VISIBLE = 4;

interface Props {
  onTaskClick: (task: Task) => void;
  onDayClick: (day: string) => void;
  onToggleDone: (task: Task) => void;
  onEventClick: (event: CalendarEvent) => void;
}

export function MonthView({ onTaskClick, onDayClick, onToggleDone, onEventClick }: Props) {
  const tasksQ = useTasks();
  const projectsQ = useProjects();
  const categoriesQ = useCategories();
  const eventsQ = useEvents();
  const allTasks = tasksQ.data ?? [];
  const projects = projectsQ.data ?? [];
  const categories = categoriesQ.data ?? [];
  const allEvents = eventsQ.data ?? [];
  const { viewDate, filterCategoryId } = useApp();

  const tasks = filterCategoryId
    ? allTasks.filter((t) => categoryFor(t, categories, projects)?.id === filterCategoryId)
    : allTasks;

  const cells = getMonthGrid(fromYmd(viewDate));
  const tasksByDay = useMemo(() => {
    const m: Record<string, Task[]> = {};
    tasks.forEach((t) => {
      if (t.day) (m[t.day] = m[t.day] ?? []).push(t);
    });
    return m;
  }, [tasks]);

  const eventsByDay = useMemo(() => {
    const m: Record<string, CalendarEvent[]> = {};
    allEvents.filter((e) => !e.deletedAt).forEach((e) => {
      (m[e.day] = m[e.day] ?? []).push(e);
    });
    return m;
  }, [allEvents]);

  const today = todayYmd();
  const viewMonth = fromYmd(viewDate).getMonth();

  return (
    <div className="calendar">
      <div className="month-dow">
        {DOW_SHORT.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="month-grid">
        {cells.map((d, i) => {
          const dayKey = ymd(d);
          const dayTasks = tasksByDay[dayKey] ?? [];
          const otherMonth = d.getMonth() !== viewMonth;
          const isToday = dayKey === today;
          const isWeekend = d.getDay() === 0 || d.getDay() === 6;
          const showFirstOfMonth = d.getDate() === 1;
          const dayEvs = (eventsByDay[dayKey] ?? []).sort(
            (a, b) => (a.startTime ?? "") < (b.startTime ?? "") ? -1 : 1,
          );
          const totalItems = dayEvs.length + dayTasks.length;
          const evVisible = dayEvs.slice(0, Math.min(dayEvs.length, MAX_VISIBLE));
          const taskSlots = Math.max(0, MAX_VISIBLE - evVisible.length);
          const visible = dayTasks.slice(0, taskSlots);
          const hidden = totalItems - evVisible.length - visible.length;

          const cellClass = [
            "day-cell",
            otherMonth ? "other-month" : "",
            isToday ? "today" : "",
            isWeekend ? "weekend" : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <DroppableDayCell key={i} dayKey={dayKey} className={cellClass}>
              <div className="day-head">
                <div className="day-num-wrap">
                  <span className="day-num">{d.getDate()}</span>
                  {showFirstOfMonth && (
                    <span className="tag-month">{MONTH_SHORT[d.getMonth()]}</span>
                  )}
                </div>
                <button
                  className="add-here"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDayClick(dayKey);
                  }}
                  title="Add task on this day"
                >
                  <IPlus size={11} />
                </button>
              </div>
              <div className="day-tasks">
                {evVisible.map((ev) => (
                  <EventChip key={ev.id} event={ev} onClick={onEventClick} />
                ))}
                {visible.map((t) => (
                  <MonthDayTask
                    key={t.id}
                    task={t}
                    categories={categories}
                    projects={projects}
                    onTaskClick={onTaskClick}
                    onToggleDone={onToggleDone}
                  />
                ))}
                {hidden > 0 && <div className="day-more">+{hidden} more</div>}
              </div>
            </DroppableDayCell>
          );
        })}
      </div>
    </div>
  );
}

function MonthDayTask({
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
  const className = [
    "day-task",
    task.done ? "done" : "",
    task.recurring ? "recurring" : "",
    isDragging ? "dragging" : "",
    isNotFinished(task) ? "not-finished" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div
      ref={setNodeRef}
      className={className}
      style={vars({ "--cat-bg": colors.bg, "--cat-fg": colors.fg })}
      onClick={(e) => {
        e.stopPropagation();
        if (!(e.target as HTMLElement).closest(".check")) onTaskClick(task);
      }}
      {...attributes}
      {...listeners}
    >
      <span className="pri-dot" style={{ background: priColor(task.priority) }} />
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
      <span className="label">{task.title}</span>
    </div>
  );
}
