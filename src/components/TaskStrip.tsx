import { useDndContext, useDroppable } from "@dnd-kit/core";
import { categoryFor } from "../lib/categoryFor";
import { colorsForCategory } from "../lib/categoryColor";
import { useApp } from "../lib/store";
import { useCategories, useProjects, useTasks } from "../lib/queries";
import type { Task } from "../types";
import { IGrip, IInbox, IPlus } from "./icons";
import { TaskCard } from "./TaskCard";

const STRIP_FILTER_LIMIT = 5;

interface Props {
  onAddNew: () => void;
  onOpen: (task: Task) => void;
  onToggleDone: (task: Task) => void;
}

export function TaskStrip({ onAddNew, onOpen, onToggleDone }: Props) {
  const tasksQ = useTasks();
  const projectsQ = useProjects();
  const categoriesQ = useCategories();
  const tasks = tasksQ.data ?? [];
  const projects = projectsQ.data ?? [];
  const categories = categoriesQ.data ?? [];

  const { filterCategoryId, setFilterCategory } = useApp();

  const { setNodeRef, isOver } = useDroppable({ id: "inbox" });

  const dnd = useDndContext();
  const activeTask = dnd.active?.data.current?.task as Task | undefined;
  const draggingScheduled = activeTask !== undefined && activeTask.day !== null;

  const visibleFilters = categories
    .filter((c) => !c.archived)
    .slice(0, STRIP_FILTER_LIMIT);

  const unscheduled = tasks.filter((t) => t.day === null && !t.done);
  const filtered = filterCategoryId
    ? unscheduled.filter((t) => categoryFor(t, categories, projects)?.id === filterCategoryId)
    : unscheduled;

  return (
    <div
      ref={setNodeRef}
      className={`task-strip ${draggingScheduled ? "task-strip-droppable" : ""}`}
      data-day={draggingScheduled ? "__inbox__" : undefined}
      style={isOver ? { outline: "2px dashed var(--accent)" } : undefined}
    >
      <div className="task-strip-head">
        <h2>Inbox</h2>
        <span className="count-pill">{unscheduled.length}</span>
        <div className="filters" style={{ marginLeft: 12 }}>
          <span
            className={`chip ${!filterCategoryId ? "active" : ""}`}
            onClick={() => setFilterCategory(null)}
          >
            All
          </span>
          {visibleFilters.map((c) => {
            const colors = colorsForCategory(c);
            return (
              <span
                key={c.id}
                className={`chip ${filterCategoryId === c.id ? "active" : ""}`}
                onClick={() => setFilterCategory(filterCategoryId === c.id ? null : c.id)}
              >
                <span className="swatch" style={{ background: colors.bg }} />
                {c.name}
              </span>
            );
          })}
        </div>
        <div className="hint">
          {draggingScheduled ? (
            <>
              <IInbox size={12} /> Drop anywhere on this strip to unschedule
            </>
          ) : (
            <>
              <IGrip size={12} /> Drag onto a day to schedule
            </>
          )}
        </div>
      </div>
      <div className="task-rail">
        {draggingScheduled ? (
          <div className="rail-inbox-drop">
            <span className="rail-inbox-icon">
              <IInbox size={20} stroke={2} />
            </span>
            <span className="rail-inbox-label">Drop here to send back to inbox</span>
          </div>
        ) : (
          <button className="rail-add" onClick={onAddNew} title="Add a new task">
            <span className="rail-add-icon">
              <IPlus size={16} stroke={2} />
            </span>
            <span className="rail-add-label">New task</span>
            <span className="rail-add-hint">Press N</span>
          </button>
        )}
        {filtered.length === 0 && (
          <div className="rail-empty">
            <div style={{ fontWeight: 500, color: "var(--fg-muted)" }}>Inbox zero</div>
            <div>
              No unscheduled tasks
              {filterCategoryId
                ? ` in ${categories.find((c) => c.id === filterCategoryId)?.name ?? ""}`
                : ""}
              .
            </div>
          </div>
        )}
        {filtered.map((t) => (
          <TaskCard
            key={t.id}
            task={t}
            projects={projects}
            categories={categories}
            onOpen={onOpen}
            onToggleDone={onToggleDone}
          />
        ))}
      </div>
    </div>
  );
}
