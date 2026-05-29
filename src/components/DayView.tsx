import { useDraggable, useDroppable } from "@dnd-kit/core";
import { DOW_SHORT, MONTH_NAME, fromYmd } from "../lib/date";
import { categoryFor, projectFor } from "../lib/categoryFor";
import { colorsForCategory } from "../lib/categoryColor";
import { fmtDuration, priLabel } from "../lib/format";
import { vars } from "../lib/style";
import { useApp } from "../lib/store";
import { useCategories, useProjects, useTasks } from "../lib/queries";
import { isNotFinished } from "../lib/taskState";
import type { Category, Project, Task } from "../types";
import { CategoryPie } from "./CategoryPie";
import { ICheck, IClock, IRecurring } from "./icons";

interface Props {
  onTaskClick: (task: Task) => void;
  onToggleDone: (task: Task) => void;
}

export function DayView({ onTaskClick, onToggleDone }: Props) {
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

  const { setNodeRef, isOver } = useDroppable({ id: `day:${viewDate}` });

  const vd = fromYmd(viewDate);
  const dayTasks = tasks.filter((t) => t.day === viewDate);
  const open = dayTasks.filter((t) => !t.done);
  const done = dayTasks.filter((t) => t.done);
  const totalMin = open.reduce((s, t) => s + (t.duration || 0), 0);

  const byProject: Record<string, Task[]> = {};
  open.forEach((t) => {
    const k = t.projectId ?? "_none";
    (byProject[k] = byProject[k] ?? []).push(t);
  });

  return (
    <div className="day-view">
      <div
        ref={setNodeRef}
        className={`day-view-main ${isOver ? "drop-target" : ""}`}
        data-day={viewDate}
        style={
          isOver
            ? {
                background: "var(--accent-soft)",
                outline: "2px solid var(--accent)",
                outlineOffset: "-12px",
              }
            : undefined
        }
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
          <div>
            <div
              style={{
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: ".06em",
                color: "var(--fg-subtle)",
                fontWeight: 600,
              }}
            >
              {DOW_SHORT[vd.getDay()]}
            </div>
            <div style={{ fontSize: 32, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1 }}>
              {MONTH_NAME[vd.getMonth()]} {vd.getDate()}
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ fontSize: 12, color: "var(--fg-muted)" }}>
            {open.length} open · {fmtDuration(totalMin)} total · {done.length} done
          </div>
        </div>

        {open.length === 0 && done.length === 0 && (
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
            Nothing scheduled.
            <br />
            <span style={{ fontSize: 12 }}>Drag a task from the strip above to plan this day.</span>
          </div>
        )}

        {Object.entries(byProject).map(([k, list]) => {
          const proj = k === "_none" ? null : projects.find((p) => p.id === k) ?? null;
          const projCat = proj
            ? categories.find((c) => c.id === proj.categoryId) ?? null
            : null;
          const dotBg = projCat ? colorsForCategory(projCat).bg : "var(--bg-sunken)";
          return (
            <div key={k} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 11,
                  color: "var(--fg-muted)",
                  textTransform: "uppercase",
                  letterSpacing: ".05em",
                  fontWeight: 600,
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: 2, background: dotBg }} />
                {proj ? proj.name : "No project"}
                <span style={{ color: "var(--fg-subtle)" }}>· {list.length}</span>
              </div>
              {list.map((t) => (
                <DayRow
                  key={t.id}
                  task={t}
                  onClick={onTaskClick}
                  onToggle={onToggleDone}
                  categories={categories}
                  projects={projects}
                />
              ))}
            </div>
          );
        })}

        {done.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            <div
              style={{
                fontSize: 11,
                color: "var(--fg-subtle)",
                textTransform: "uppercase",
                letterSpacing: ".05em",
                fontWeight: 600,
              }}
            >
              Done · {done.length}
            </div>
            {done.map((t) => (
              <DayRow
                key={t.id}
                task={t}
                onClick={onTaskClick}
                onToggle={onToggleDone}
                categories={categories}
                projects={projects}
              />
            ))}
          </div>
        )}
      </div>

      <aside className="day-view-side">
        <div
          style={{
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: ".05em",
            color: "var(--fg-subtle)",
            fontWeight: 600,
            marginBottom: 10,
          }}
        >
          At a glance
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
          <Stat label="Tasks" value={String(open.length)} />
          <Stat label="Focus time" value={fmtDuration(totalMin)} />
          <Stat label="Done" value={String(done.length)} />
          <Stat label="High priority" value={String(open.filter((t) => t.priority === "high").length)} />
        </div>

        <CategoryPie tasks={[...open, ...done]} projects={projects} categories={categories} />
      </aside>
    </div>
  );
}

function DayRow({
  task,
  onClick,
  onToggle,
  categories,
  projects,
}: {
  task: Task;
  onClick: (t: Task) => void;
  onToggle: (t: Task) => void;
  categories: Category[];
  projects: Project[];
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    data: { task },
  });
  const cat = categoryFor(task, categories, projects);
  const colors = cat
    ? colorsForCategory(cat)
    : { bg: "var(--bg-sunken)", fg: "var(--fg-muted)" };
  void projectFor;
  const notFinished = isNotFinished(task);
  return (
    <div
      ref={setNodeRef}
      className={`day-task-row ${task.done ? "done" : ""} ${isDragging ? "dragging" : ""} ${notFinished ? "not-finished" : ""}`}
      style={vars({ "--cat-bg": colors.bg })}
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest(".check")) onClick(task);
      }}
      {...attributes}
      {...listeners}
    >
      <div className="stripe" />
      <div
        className="check"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onToggle(task);
        }}
      >
        {task.done && <ICheck size={11} stroke={2.4} />}
      </div>
      <div className="body">
        <div className="title">{task.title}</div>
        {!task.done && (
          <div className="meta">
            {notFinished && (
              <>
                <span className="not-finished-badge">not finished</span>
                <span style={{ color: "var(--line-strong)" }}>·</span>
              </>
            )}
            <span
              className={`pri-bars ${task.priority === "high" ? "high" : task.priority === "med" ? "med" : "low"}`}
            >
              <span /><span /><span />
            </span>
            <span>{priLabel(task.priority)}</span>
            <span style={{ color: "var(--line-strong)" }}>·</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
              <IClock size={11} /> {fmtDuration(task.duration)}
            </span>
            {task.recurring && (
              <>
                <span style={{ color: "var(--line-strong)" }}>·</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                  <IRecurring size={11} /> repeats
                </span>
              </>
            )}
            {task.subtasks.length > 0 && (
              <>
                <span style={{ color: "var(--line-strong)" }}>·</span>
                <span>
                  {task.subtasks.filter((s) => s.done).length}/{task.subtasks.length} subtasks
                </span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: "var(--bg-elev)",
        border: "1px solid var(--line)",
        borderRadius: 8,
        padding: "10px 12px",
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: "var(--fg-subtle)",
          textTransform: "uppercase",
          letterSpacing: ".05em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 20,
          fontWeight: 600,
          letterSpacing: "-0.01em",
          marginTop: 2,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
    </div>
  );
}
