import { useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { categoryFor } from "../lib/categoryFor";
import { colorsForCategory } from "../lib/categoryColor";
import { fromYmd, todayYmd } from "../lib/date";
import { fmtDuration, priLabel } from "../lib/format";
import { vars } from "../lib/style";
import { useApp } from "../lib/store";
import { useCategories, usePatchProject, useProjects, useTasks } from "../lib/queries";
import type { Category, Milestone, Project, ProjectEstado, Task } from "../types";
import { ICheck, IClock, IPlus, IRecurring, IX } from "./icons";

interface Props {
  onTaskClick: (task: Task) => void;
  onToggleDone: (task: Task) => void;
  onAddNew: (prefill: Partial<Task>) => void;
}

const ESTADOS: { value: ProjectEstado; label: string }[] = [
  { value: "activo", label: "Activo" },
  { value: "pausado", label: "Pausado" },
  { value: "terminado", label: "Terminado" },
];

const ESTADO_COLOR: Record<ProjectEstado, string> = {
  activo: "var(--ok, var(--accent))",
  pausado: "var(--fg-subtle)",
  terminado: "var(--accent)",
};

/**
 * Project progress. Milestone-based (done/total hitos) when there are
 * milestones; otherwise falls back to % of project tasks done. `kind` lets the
 * UI show a "sin hitos" hint when no milestones exist.
 */
function computeProgress(
  project: Project,
  projectTasks: Task[],
): { pct: number; doneN: number; totalN: number; kind: "hitos" | "tasks" | "empty" } {
  const total = project.milestones.length;
  if (total > 0) {
    const done = project.milestones.filter((m) => m.done).length;
    return { pct: done / total, doneN: done, totalN: total, kind: "hitos" };
  }
  if (projectTasks.length > 0) {
    const done = projectTasks.filter((t) => t.done).length;
    return { pct: done / projectTasks.length, doneN: done, totalN: projectTasks.length, kind: "tasks" };
  }
  return { pct: 0, doneN: 0, totalN: 0, kind: "empty" };
}

function ProgressBar({ pct, color }: { pct: number; color?: string }) {
  return (
    <div
      style={{
        height: 6,
        borderRadius: 999,
        background: "var(--bg-sunken)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${Math.round(pct * 100)}%`,
          height: "100%",
          background: color ?? "var(--accent)",
          transition: "width 0.2s",
        }}
      />
    </div>
  );
}

function EstadoBadge({ estado }: { estado: ProjectEstado }) {
  const label = ESTADOS.find((e) => e.value === estado)?.label ?? estado;
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: ".04em",
        padding: "2px 7px",
        borderRadius: 999,
        color: ESTADO_COLOR[estado],
        border: `1px solid ${ESTADO_COLOR[estado]}`,
      }}
    >
      {label}
    </span>
  );
}

export function ProjectView({ onTaskClick, onToggleDone, onAddNew }: Props) {
  const { viewProjectId, setViewProject, openProjectManager } = useApp();
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
    const visible = projects.filter((p) => !p.archived);
    return (
      <div className="day-view-main">
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            paddingBottom: 10,
            borderBottom: "1px solid var(--line)",
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em" }}>Proyectos</div>
            <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 2 }}>
              {visible.length} {visible.length === 1 ? "proyecto" : "proyectos"}
            </div>
          </div>
          <button className="btn" onClick={openProjectManager}>
            <IPlus size={12} /> Nuevo proyecto
          </button>
        </header>

        {visible.length === 0 ? (
          <div
            style={{
              padding: "40px 24px",
              textAlign: "center",
              color: "var(--fg-subtle)",
              fontSize: 13,
              border: "1px dashed var(--line)",
              borderRadius: 10,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--fg-muted)", marginBottom: 6 }}>
              Aún no hay proyectos
            </div>
            Crea uno con el botón "Nuevo proyecto".
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
              gap: 12,
            }}
          >
            {visible.map((p) => {
              const cat = categories.find((c) => c.id === p.categoryId) ?? null;
              const colors = cat
                ? colorsForCategory(cat)
                : { bg: "var(--bg-sunken)", fg: "var(--fg-muted)" };
              const pTasks = tasks.filter((t) => t.projectId === p.id);
              const prog = computeProgress(p, pTasks);
              return (
                <button
                  key={p.id}
                  onClick={() => setViewProject(p.id)}
                  style={{
                    textAlign: "left",
                    border: "1px solid var(--line)",
                    borderRadius: 10,
                    padding: "12px 14px",
                    background: "var(--bg-elev)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: 4,
                        background: colors.bg,
                        flex: "0 0 auto",
                      }}
                    />
                    <span
                      style={{
                        flex: 1,
                        fontSize: 13.5,
                        fontWeight: 600,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {p.name}
                    </span>
                    <EstadoBadge estado={p.estado} />
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--fg-muted)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      minHeight: 16,
                    }}
                  >
                    {p.objetivo || "Sin objetivo definido"}
                  </div>
                  <ProgressBar pct={prog.pct} color={colors.bg} />
                  <div style={{ fontSize: 11, color: "var(--fg-subtle)", fontVariantNumeric: "tabular-nums" }}>
                    {prog.kind === "hitos"
                      ? `${prog.doneN}/${prog.totalN} hitos`
                      : prog.kind === "tasks"
                        ? `${prog.doneN}/${prog.totalN} tareas · sin hitos`
                        : "sin hitos"}
                  </div>
                </button>
              );
            })}
          </div>
        )}
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
        <button className="btn ghost" onClick={() => setViewProject(null)}>
          Volver
        </button>
      </header>

      <ProjectDetailHeader project={project} projectTasks={projectTasks} accent={colors.bg} />

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

function ProjectDetailHeader({
  project,
  projectTasks,
  accent,
}: {
  project: Project;
  projectTasks: Task[];
  accent: string;
}) {
  const patchProject = usePatchProject();
  const [objetivoDraft, setObjetivoDraft] = useState(project.objetivo);
  const milestoneCounter = useState(() => ({ n: 0 }))[0];

  // Keep the draft in sync if the project changes underneath (e.g. switching
  // projects or a sync pull).
  const [lastProjectId, setLastProjectId] = useState(project.id);
  if (lastProjectId !== project.id) {
    setLastProjectId(project.id);
    setObjetivoDraft(project.objetivo);
  }

  const prog = computeProgress(project, projectTasks);

  const saveMilestones = (next: Milestone[]) => {
    patchProject.mutate({ id: project.id, patch: { milestones: next } });
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: "12px 0",
        borderBottom: "1px solid var(--line)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span
          style={{
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: ".05em",
            fontWeight: 600,
            color: "var(--fg-muted)",
          }}
        >
          Estado
        </span>
        {ESTADOS.map((e) => {
          const active = project.estado === e.value;
          return (
            <span
              key={e.value}
              className={`pill-select ${active ? "active" : ""}`}
              style={
                active
                  ? { background: accent, color: "var(--fg)", borderColor: "transparent" }
                  : undefined
              }
              onClick={() => patchProject.mutate({ id: project.id, patch: { estado: e.value } })}
            >
              {e.label}
            </span>
          );
        })}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span
          style={{
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: ".05em",
            fontWeight: 600,
            color: "var(--fg-muted)",
          }}
        >
          Objetivo
        </span>
        <textarea
          className="input"
          value={objetivoDraft}
          placeholder="Que se busca lograr con este proyecto"
          onChange={(e) => setObjetivoDraft(e.target.value)}
          onBlur={() => {
            if (objetivoDraft !== project.objetivo) {
              patchProject.mutate({ id: project.id, patch: { objetivo: objetivoDraft } });
            }
          }}
          rows={2}
          style={{ resize: "vertical", minHeight: 44 }}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: ".05em",
              fontWeight: 600,
              color: "var(--fg-muted)",
            }}
          >
            Hitos
          </span>
          <span style={{ fontSize: 11, color: "var(--fg-subtle)", fontVariantNumeric: "tabular-nums" }}>
            {prog.kind === "hitos"
              ? `${prog.doneN}/${prog.totalN}`
              : prog.kind === "tasks"
                ? `${prog.doneN}/${prog.totalN} tareas (sin hitos)`
                : "sin hitos"}
          </span>
        </div>
        <ProgressBar pct={prog.pct} color={accent} />
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
          {project.milestones.map((m, i) => (
            <div key={m.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div
                className="check"
                style={{ flex: "0 0 auto" }}
                onClick={() => {
                  const next = project.milestones.slice();
                  next[i] = { ...next[i], done: !next[i].done };
                  saveMilestones(next);
                }}
              >
                {m.done && <ICheck size={9} stroke={2.6} />}
              </div>
              <input
                className="input"
                defaultValue={m.title}
                placeholder="Titulo del hito"
                onBlur={(e) => {
                  if (e.target.value === m.title) return;
                  const next = project.milestones.slice();
                  next[i] = { ...next[i], title: e.target.value };
                  saveMilestones(next);
                }}
                style={{
                  flex: 1,
                  textDecoration: m.done ? "line-through" : undefined,
                  opacity: m.done ? 0.6 : 1,
                }}
              />
              <button
                className="icon-btn"
                style={{ width: 24, height: 24 }}
                onClick={() => saveMilestones(project.milestones.filter((_, j) => j !== i))}
              >
                <IX size={11} />
              </button>
            </div>
          ))}
          <button
            className="btn ghost"
            style={{ alignSelf: "flex-start", padding: "4px 8px", fontSize: 11.5 }}
            onClick={() =>
              saveMilestones([
                ...project.milestones,
                {
                  id: `new_${Date.now()}_${++milestoneCounter.n}`,
                  title: "",
                  description: "",
                  done: false,
                },
              ])
            }
          >
            <IPlus size={11} /> Agregar hito
          </button>
        </div>
      </div>
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
