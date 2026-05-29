import { useEffect, useRef, useState, type MouseEvent } from "react";
import { categoryFor } from "../lib/categoryFor";
import { colorsForCategory } from "../lib/categoryColor";
import { fmtDuration, priLabel } from "../lib/format";
import {
  useCategories,
  useCreateTask,
  useDeleteTask,
  usePatchTask,
  useProjects,
} from "../lib/queries";
import { useApp } from "../lib/store";
import { vars } from "../lib/style";
import type { Priority, RecurrenceRule, Subtask, Task } from "../types";
import { RecurrencePicker } from "./RecurrencePicker";
import { ICheck, IPlus, ITrash, IX } from "./icons";

const DURATION_PRESETS = [15, 30, 45, 60, 90, 120];

interface DraftFields {
  title: string;
  projectId: string | null;
  categoryId: string | null;
  priority: Priority;
  duration: number;
  day: string | null;
  recurrence: RecurrenceRule | null;
  notes: string;
  subtasks: Subtask[];
  done: boolean;
  isHabit: boolean;
}

function fromTask(t: Task): DraftFields {
  return {
    title: t.title,
    projectId: t.projectId,
    categoryId: t.categoryId,
    priority: t.priority,
    duration: t.duration,
    day: t.day,
    recurrence: t.recurrence,
    notes: t.notes,
    subtasks: t.subtasks,
    done: t.done,
    isHabit: t.isHabit,
  };
}

function fromPrefill(p: Partial<Task>): DraftFields {
  return {
    title: p.title ?? "",
    projectId: p.projectId ?? null,
    categoryId: p.categoryId ?? null,
    priority: p.priority ?? "med",
    duration: p.duration ?? 30,
    day: p.day ?? null,
    recurrence: p.recurrence ?? null,
    notes: p.notes ?? "",
    subtasks: p.subtasks ?? [],
    done: false,
    isHabit: p.isHabit ?? false,
  };
}

interface Props {
  mode: "edit" | "create";
  task?: Task;
  prefill?: Partial<Task>;
  onClose: () => void;
}

export function TaskEditor({ mode, task, prefill, onClose }: Props) {
  const projectsQ = useProjects();
  const categoriesQ = useCategories();
  const projects = projectsQ.data ?? [];
  const categories = categoriesQ.data ?? [];
  const patchTask = usePatchTask();
  const createTask = useCreateTask();
  const deleteTask = useDeleteTask();
  const { openCategoryManager } = useApp();

  const [draft, setDraft] = useState<DraftFields>(() =>
    mode === "edit" && task ? fromTask(task) : fromPrefill(prefill ?? {}),
  );
  const subtaskCounter = useRef(0);

  useEffect(() => {
    if (mode === "edit" && task) setDraft(fromTask(task));
  }, [mode, task]);

  const set = (patch: Partial<DraftFields>) => setDraft((d) => ({ ...d, ...patch }));

  const save = () => {
    const isHabit = draft.recurrence !== null && draft.isHabit;
    if (mode === "edit" && task) {
      patchTask.mutate({
        id: task.id,
        patch: {
          title: draft.title,
          projectId: draft.projectId,
          categoryId: draft.categoryId,
          priority: draft.priority,
          duration: draft.duration,
          day: draft.day,
          recurring: draft.recurrence !== null,
          recurrence: draft.recurrence,
          notes: draft.notes,
          subtasks: draft.subtasks,
          done: draft.done,
          isHabit,
        },
      });
    } else {
      createTask.mutate({
        title: draft.title,
        projectId: draft.projectId,
        categoryId: draft.categoryId,
        priority: draft.priority,
        duration: draft.duration,
        day: draft.day,
        due: null,
        recurring: draft.recurrence !== null,
        recurrence: draft.recurrence,
        recurrenceParentId: null,
        notes: draft.notes,
        subtasks: draft.subtasks,
        isHabit,
      });
    }
    onClose();
  };

  const remove = () => {
    if (mode === "edit" && task) {
      deleteTask.mutate(task.id);
    }
    onClose();
  };

  const onTitleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      save();
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onBackdropMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) save();
  };

  const resolvedCat = categoryFor(
    { categoryId: draft.categoryId, projectId: draft.projectId },
    categories,
    projects,
  );
  const activeCategoryId = draft.categoryId ?? resolvedCat?.id ?? null;
  const visibleCategories = categories.filter((c) => !c.archived);

  return (
    <div className="modal-backdrop" onMouseDown={onBackdropMouseDown}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className={`modal-head ${draft.done ? "done" : ""}`}>
          <div className="check" onClick={() => set({ done: !draft.done })}>
            {draft.done && <ICheck size={11} stroke={2.4} />}
          </div>
          <input
            className="title-input"
            value={draft.title}
            onChange={(e) => set({ title: e.target.value })}
            onKeyDown={onTitleKey}
            autoFocus
            placeholder="Task title…"
          />
          <button className="icon-btn" onClick={save} title="Close">
            <IX size={14} />
          </button>
        </div>

        <div className="modal-body">
          <div className="field">
            <label
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                paddingRight: 4,
              }}
            >
              <span>Category</span>
              <button
                type="button"
                onClick={openCategoryManager}
                style={{
                  fontSize: 10.5,
                  color: "var(--fg-subtle)",
                  textTransform: "none",
                  letterSpacing: 0,
                  fontWeight: 500,
                  padding: 0,
                  background: "none",
                  border: 0,
                  cursor: "pointer",
                }}
              >
                Manage
              </button>
            </label>
            <div className="control">
              {visibleCategories.length === 0 && (
                <span style={{ fontSize: 12, color: "var(--fg-subtle)" }}>
                  No categories yet —{" "}
                  <button
                    type="button"
                    onClick={openCategoryManager}
                    style={{
                      background: "none",
                      border: 0,
                      padding: 0,
                      color: "var(--accent)",
                      cursor: "pointer",
                      font: "inherit",
                    }}
                  >
                    add one
                  </button>
                </span>
              )}
              {visibleCategories.map((c) => {
                const active = activeCategoryId === c.id;
                const colors = colorsForCategory(c);
                return (
                  <span
                    key={c.id}
                    className={`pill-select ${active ? "active" : ""}`}
                    style={
                      active
                        ? { background: colors.bg, color: colors.fg, borderColor: "transparent" }
                        : undefined
                    }
                    onClick={() => set({ categoryId: c.id })}
                  >
                    <span
                      className="swatch"
                      style={{ background: colors.bg, border: "1px solid rgba(0,0,0,0.06)" }}
                    />
                    {c.name}
                  </span>
                );
              })}
            </div>
          </div>

          <div className="field">
            <label>Project</label>
            <div className="control">
              <span
                className={`pill-select ${!draft.projectId ? "active" : ""}`}
                onClick={() => set({ projectId: null })}
              >
                None
              </span>
              {projects.map((p) => {
                const pcat = categories.find((c) => c.id === p.categoryId);
                const colors = pcat ? colorsForCategory(pcat) : null;
                const active = draft.projectId === p.id;
                return (
                  <span
                    key={p.id}
                    className={`pill-select ${active ? "active" : ""}`}
                    style={
                      active && colors
                        ? vars(
                            { "--cat-bg": colors.bg, "--cat-fg": colors.fg },
                            { background: colors.bg, color: colors.fg },
                          )
                        : undefined
                    }
                    onClick={() => set({ projectId: p.id })}
                  >
                    <span
                      className="swatch"
                      style={{
                        background: colors?.bg ?? "var(--bg-sunken)",
                        border: "1px solid rgba(0,0,0,0.06)",
                      }}
                    />
                    {p.name}
                  </span>
                );
              })}
            </div>
          </div>

          <div className="field">
            <label>Priority</label>
            <div className="control">
              {(["high", "med", "low"] as const).map((p) => (
                <span
                  key={p}
                  className={`pill-select ${draft.priority === p ? "active" : ""}`}
                  onClick={() => set({ priority: p })}
                >
                  <span className={`pri-bars ${p}`}>
                    <span /><span /><span />
                  </span>
                  {priLabel(p)}
                </span>
              ))}
            </div>
          </div>

          <div className="field">
            <label>Duration</label>
            <div className="control">
              {DURATION_PRESETS.map((m) => (
                <span
                  key={m}
                  className={`pill-select ${draft.duration === m ? "active" : ""}`}
                  onClick={() => set({ duration: m })}
                >
                  {fmtDuration(m)}
                </span>
              ))}
              <span
                className={`pill-select ${!DURATION_PRESETS.includes(draft.duration) ? "active" : ""}`}
                style={{ padding: 0 }}
              >
                <input
                  type="number"
                  min="1"
                  step="5"
                  value={!DURATION_PRESETS.includes(draft.duration) ? draft.duration : ""}
                  placeholder="Other"
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (!isNaN(v) && v > 0) set({ duration: v });
                  }}
                  style={{
                    width: 70,
                    border: 0,
                    outline: 0,
                    background: "transparent",
                    padding: "4px 9px",
                    fontSize: 12,
                    fontFamily: "inherit",
                    fontVariantNumeric: "tabular-nums",
                  }}
                />
                <span style={{ fontSize: 11, color: "var(--fg-muted)", paddingRight: 9 }}>
                  min
                </span>
              </span>
            </div>
          </div>

          <div className="field">
            <label>Scheduled</label>
            <div className="control">
              <input
                type="date"
                className="input"
                style={{ width: "auto" }}
                value={draft.day ?? ""}
                onChange={(e) => set({ day: e.target.value || null })}
              />
              {draft.day && (
                <button className="btn ghost" onClick={() => set({ day: null })}>
                  Move to inbox
                </button>
              )}
            </div>
          </div>

          <div className="field">
            <label>Repeats</label>
            <RecurrencePicker
              value={draft.recurrence}
              onChange={(recurrence) => set({ recurrence })}
            />
          </div>

          <div className="field">
            <label>Habit</label>
            <div className="control">
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 12,
                  color: "var(--fg)",
                  cursor: "pointer",
                  userSelect: "none",
                }}
                title="Track this task as a habit (auto-sets daily repeat if none)"
              >
                <input
                  type="checkbox"
                  checked={draft.isHabit}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    if (checked && !draft.recurrence) {
                      set({
                        isHabit: true,
                        recurrence: { kind: "daily", interval: 1 },
                      });
                    } else {
                      set({ isHabit: checked });
                    }
                  }}
                  style={{ margin: 0 }}
                />
                Track as habit
              </label>
              <span style={{ fontSize: 11, color: "var(--fg-subtle)" }}>
                {draft.isHabit
                  ? "Logged on the Habits view."
                  : "Enables daily repeat if none set."}
              </span>
            </div>
          </div>

          <div className="field">
            <label>Notes</label>
            <textarea
              className="input"
              placeholder="Add details…"
              value={draft.notes}
              onChange={(e) => set({ notes: e.target.value })}
            />
          </div>

          <div className="field">
            <label>Subtasks</label>
            <div
              className="control"
              style={{ flexDirection: "column", alignItems: "stretch", gap: 0, width: "100%" }}
            >
              <div className="subtask-list">
                {draft.subtasks.map((s, i) => (
                  <div key={s.id} className={`subtask-row ${s.done ? "done" : ""}`}>
                    <div
                      className="check"
                      onClick={() => {
                        const next = draft.subtasks.slice();
                        next[i] = { ...next[i], done: !next[i].done };
                        set({ subtasks: next });
                      }}
                    >
                      {s.done && <ICheck size={9} stroke={2.6} />}
                    </div>
                    <input
                      value={s.title}
                      onChange={(e) => {
                        const next = draft.subtasks.slice();
                        next[i] = { ...next[i], title: e.target.value };
                        set({ subtasks: next });
                      }}
                    />
                    <button
                      className="icon-btn"
                      style={{ width: 20, height: 20 }}
                      onClick={() =>
                        set({ subtasks: draft.subtasks.filter((_, j) => j !== i) })
                      }
                    >
                      <IX size={11} />
                    </button>
                  </div>
                ))}
              </div>
              <div
                className="subtask-add"
                onClick={() =>
                  set({
                    subtasks: [
                      ...draft.subtasks,
                      { id: `new_${Date.now()}_${++subtaskCounter.current}`, title: "", done: false },
                    ],
                  })
                }
              >
                <IPlus size={12} /> Add subtask
              </div>
            </div>
          </div>
        </div>
        <div className="modal-foot">
          {mode === "edit" ? (
            <button className="btn ghost danger" onClick={remove}>
              <ITrash size={12} /> Delete
            </button>
          ) : (
            <span />
          )}
          <div className="actions">
            <button className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn primary" onClick={save}>
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
