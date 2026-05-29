import { useDraggable } from "@dnd-kit/core";
import type { MouseEvent } from "react";
import { categoryFor, projectFor } from "../lib/categoryFor";
import { colorsForCategory } from "../lib/categoryColor";
import { fmtDuration, priLabel } from "../lib/format";
import { vars } from "../lib/style";
import { isNotFinished } from "../lib/taskState";
import type { Category, Project, Task } from "../types";
import { ICheck, IClock, IGrip, IRecurring } from "./icons";

interface Props {
  task: Task;
  projects: Project[];
  categories: Category[];
  onOpen: (task: Task) => void;
  onToggleDone: (task: Task) => void;
}

export function TaskCard({ task, projects, categories, onOpen, onToggleDone }: Props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    data: { task },
  });

  const cat = categoryFor(task, categories, projects);
  const colors = cat
    ? colorsForCategory(cat)
    : { bg: "var(--bg-sunken)", fg: "var(--fg-muted)" };
  const proj = projectFor(task, projects);
  const subDone = task.subtasks.filter((s) => s.done).length;
  const subTotal = task.subtasks.length;

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest(".check")) return;
    onOpen(task);
  };

  const notFinished = isNotFinished(task);
  const className = [
    "task-card",
    task.done ? "done" : "",
    isDragging ? "dragging" : "",
    task.day ? "scheduled" : "",
    notFinished ? "not-finished" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={setNodeRef}
      className={className}
      style={vars({ "--cat-bg": colors.bg, "--cat-fg": colors.fg })}
      onClick={onClick}
      {...attributes}
      {...listeners}
    >
      <div className="stripe" />
      <div className="row1">
        <span className="proj">{proj ? proj.name : cat?.name ?? "Uncategorized"}</span>
        {task.recurring && (
          <>
            <span className="dot" />
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
              <IRecurring size={11} stroke={2} />
              recurring
            </span>
          </>
        )}
        {notFinished && (
          <>
            <span className="dot" />
            <span className="not-finished-badge">not finished</span>
          </>
        )}
        {task.day && !notFinished && (
          <>
            <span className="dot" />
            <span>scheduled</span>
          </>
        )}
      </div>
      <div className="title">{task.title}</div>
      <div className="meta">
        <span className="pri" title={`Priority: ${priLabel(task.priority)}`}>
          <span
            className={`pri-bars ${task.priority === "high" ? "high" : task.priority === "med" ? "med" : "low"}`}
          >
            <span /><span /><span />
          </span>
          {priLabel(task.priority)}
        </span>
        <span className="sep">·</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
          <IClock size={11} stroke={1.8} /> {fmtDuration(task.duration)}
        </span>
        {subTotal > 0 && (
          <>
            <span className="sep">·</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, minWidth: 60 }}>
              <span style={{ fontVariantNumeric: "tabular-nums", fontSize: 10.5 }}>
                {subDone}/{subTotal}
              </span>
              <span className="subtask-bar">
                <i style={{ width: `${subTotal ? (subDone / subTotal) * 100 : 0}%` }} />
              </span>
            </span>
          </>
        )}
      </div>
      <div className="footer">
        <div
          className="check"
          onClick={(e) => {
            e.stopPropagation();
            onToggleDone(task);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          title={task.done ? "Mark incomplete" : "Mark complete"}
        >
          {task.done && <ICheck size={9} stroke={2.6} />}
        </div>
        <span style={{ flex: 1, fontSize: 11, color: "var(--fg-subtle)" }}>
          {task.day ? "" : "Drag to a day →"}
        </span>
        <IGrip size={12} stroke={2} />
      </div>
    </div>
  );
}
