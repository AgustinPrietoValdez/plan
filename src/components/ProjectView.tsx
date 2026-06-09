import { useDraggable } from "@dnd-kit/core";
import { categoryFor } from "../lib/categoryFor";
import { colorsForCategory } from "../lib/categoryColor";
import { fromYmd, todayYmd } from "../lib/date";
import { fmtDuration, priLabel } from "../lib/format";
import { vars } from "../lib/style";
import { useApp } from "../lib/store";
import { useCategories, useProjects, useTasks } from "../lib/queries";
import type { Category, Project, Task } from "../types";
import { ICheck, IClock, IRecurring } from "./icons";

interface Props {
  onTaskClick: (task: Task) => void;
  onToggleDone: (task: Task) => void;
  onAddNew: (prefill: Partial<Task>) => void;
}

export function ProjectView({ onTaskClick, onToggleDone, onAddNew }: Props) {
  const { viewProjectId, openProjectManager } = useApp();
  const tasksQ = useTasks();
  const projectsQ = useProjects();
  const categoriesQ = useCategories();
  const tasks = tasksQ.data ?? [];
  const projects = projectsQ.data ?? [];
  const categories = categoriesQ.data ?? [];

  const project = viewProjectId
    ? projects.find((p) => p.id === viewProjectId) ?? null
    : null;

  if (!project) {
    return (
      <div className="day-view-main" style={{ alignItems: "center", justifyContent: "center" }}>
        <div
          style={{
            padding: "40px 24px",
            textAlign: "center",
            color: "var(--fg-subtle)",
            fontSize: 13,
            border: "1px dashed var(--line)",
            borderRadius: 10,
            maxWidth: 420,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 500, color: "var(--fg-muted)", marginBottom: 6 }}>
            No project selected
          </div>
          Click a project in the sidebar to see its tasks, or{" "}
          <button
            onClick={openProjectManager}
            style={{
              background: "none",
              border: 0,
              padding: 0,
              color: "var(--accent)",
              cursor: "pointer",
              font: "inherit",
            }}
          >
            create a new one
          </button>
          .
        </div>
      </div>
    );
  }

  const cat = categories.find((c) => c.id === project.categoryId) ?? null;
  const colors = cat
    ? colorsForCategory(cat)
    : { bg: "var(--bg-sunken)", fg: "var(--fg-muted)" };

  const projectTasks = tasks.filter((t) => t.projectId === project.id);
  const open = projectTasks.filter((t) => !t.done);
  const done = projectTasks.filter((t) => t.done);
  const today = todayYmd();

  const inbox = open.filter((t) => t.day === null);
  // Habits never go overdue: a skipped habit day just lapses (recorded in the
  // habit tracker), it is not a red leftover. Only real tasks go overdue.
  const overdue = open.filter((t) => t.day !== null && t.day < today && !t.isHabit);
  const todayTasks = open.filter((t) => t.day === today);
  const upcoming = open
    .filter((t) => t.day !== null && t.day > today)
    .sort((a, b) => (a.day! < b.day! ? -1 : 1));

  const totalEst = open.reduce((s, t) => s + (t.duration || 0), 0);
  const totalActual = done.reduce(
    (s, t) => s + (t.actualDuration ?? t.duration ?? 0),
    0,
  );

  return (
    <div className="day-view-main">
      <header
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 14,
          paddingBottom: 8,
          borderBottom: "1px solid var(--line)",
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            background: colors.bg,
            color: colors.fg,
            flex: "0 0 auto",
            display: "grid",
            placeItems: "center",
            fontWeight: 700,
            fontSize: 18,
            letterSpacing: "-0.02em",
          }}
        >
          {project.name.slice(0, 1).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: ".06em",
              color: "var(--fg-subtle)",
              fontWeight: 600,
            }}
          >
            Project · {cat?.name ?? "Uncategorized"}
          </div>
          <div
            style={{
              fontSize: 24,
              fontWeight: 600,
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
            }}
          >
            {project.name}
          </div>
          <div
            style={{
              marginTop: 6,
              fontSize: 12,
              color: "var(--fg-muted)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {open.length} open · {fmtDuration(totalEst)} planned · {done.length} done
            {totalActual > 0 ? ` · ${fmtDuration(totalActual)} logged` : ""}
          </div>
        </div>
        <button
          className="btn"
          onClick={() => onAddNew({ projectId: project.id, categoryId: project.categoryId })}
        >
          New task
        </button>
        <button className="btn ghost" onClick={openProjectManager}>
          Edit
        </button>
      </header>

      {projectTasks.length === 0 && (
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
          No tasks in this project yet.
          <br />
          <span style={{ fontSize: 12 }}>Click "New task" to get started.</span>
        </div>
      )}

      <Section
        label={`Overdue · ${overdue.length}`}
        tone="danger"
        tasks={overdue}
        categories={categories}
        projects={projects}
        onTaskClick={onTaskClick}
        onToggleDone={onToggleDone}
        showDate
      />
      <Section
        label={`Today · ${todayTasks.length}`}
        tasks={todayTasks}
        categories={categories}
        projects={projects}
        onTaskClick={onTaskClick}
        onToggleDone={onToggleDone}
      />
      <Section
        label={`Upcoming · ${upcoming.length}`}
        tasks={upcoming}
        categories={categories}
        projects={projects}
        onTaskClick={onTaskClick}
        onToggleDone={onToggleDone}
        showDate
      />
      <Section
        label={`Inbox · ${inbox.length}`}
        tasks={inbox}
        categories={categories}
        projects={projects}
        onTaskClick={onTaskClick}
        onToggleDone={onToggleDone}
      />
      <Section
        label={`Done · ${done.length}`}
        tasks={done}
        categories={categories}
        projects={projects}
        onTaskClick={onTaskClick}
        onToggleDone={onToggleDone}
        showDate
      />
    </div>
  );
}

function Section({
  label,
  tone,
  tasks,
  categories,
  projects,
  onTaskClick,
  onToggleDone,
  showDate,
}: {
  label: string;
  tone?: "danger";
  tasks: Task[];
  categories: Category[];
  projects: Project[];
  onTaskClick: (t: Task) => void;
  onToggleDone: (t: Task) => void;
  showDate?: boolean;
}) {
  if (tasks.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: ".05em",
          fontWeight: 600,
          color: tone === "danger" ? "var(--danger)" : "var(--fg-muted)",
        }}
      >
        {label}
      </div>
      {tasks.map((t) => (
        <ProjectRow
          key={t.id}
          task={t}
          categories={categories}
          projects={projects}
          onClick={onTaskClick}
          onToggle={onToggleDone}
          showDate={showDate}
        />
      ))}
    </div>
  );
}

function ProjectRow({
  task,
  categories,
  projects,
  onClick,
  onToggle,
  showDate,
}: {
  task: Task;
  categories: Category[];
  projects: Project[];
  onClick: (t: Task) => void;
  onToggle: (t: Task) => void;
  showDate?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    data: { task },
  });
  const cat = categoryFor(task, categories, projects);
  const colors = cat
    ? colorsForCategory(cat)
    : { bg: "var(--bg-sunken)", fg: "var(--fg-muted)" };
  return (
    <div
      ref={setNodeRef}
      className={`day-task-row ${task.done ? "done" : ""} ${isDragging ? "dragging" : ""}`}
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
        <div className="meta">
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
          {showDate && task.day && (
            <>
              <span style={{ color: "var(--line-strong)" }}>·</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>
                {formatShortDate(task.day)}
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
      </div>
    </div>
  );
}

function formatShortDate(ymd: string): string {
  const d = fromYmd(ymd);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
