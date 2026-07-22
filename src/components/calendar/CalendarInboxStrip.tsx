import { useDraggable, useDroppable } from "@dnd-kit/core";
import { categoryFor } from "../../lib/categoryFor";
import { colorsForCategory } from "../../lib/categoryColor";
import { fmtDuration, priColor, priLabelEs } from "../../lib/format";
import { useApp } from "../../lib/store";
import { useCategories, useProjects, useTasks } from "../../lib/queries";
import type { Category, Project, Task } from "../../types";
import { IChevD, IChevU, IClock, IGrip, IInbox, IPlus } from "../icons";

function fluid(base: number): string {
  return `calc(var(--s, 2) * ${base}px)`;
}

interface Props {
  open: boolean;
  onToggleOpen: () => void;
  onAddNew: () => void;
  onOpen: (task: Task) => void;
}

export function CalendarInboxStrip({ open, onToggleOpen, onAddNew, onOpen }: Props) {
  const tasks = useTasks().data ?? [];
  const projects = useProjects().data ?? [];
  const categories = useCategories().data ?? [];
  const { filterCategoryId } = useApp();
  const { setNodeRef, isOver } = useDroppable({ id: "inbox" });

  const unscheduled = tasks.filter((t) => t.day === null && !t.done);
  const filtered = filterCategoryId
    ? unscheduled.filter((t) => categoryFor(t, categories, projects)?.id === filterCategoryId)
    : unscheduled;

  return (
    <div style={{ flexShrink: 0, background: "var(--bg-elev)", borderBottom: "1px solid var(--line)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: fluid(9), padding: `${fluid(12)} ${fluid(20)} ${fluid(12)}` }}>
        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: fluid(26), height: fluid(26), borderRadius: fluid(8), color: "var(--fg-muted)", background: "var(--bg-sunken)", flexShrink: 0 }}>
          <IInbox size={15} stroke={1.7} />
        </span>
        <span style={{ fontSize: fluid(14), fontWeight: 600, letterSpacing: "-0.01em" }}>Inbox</span>
        <span style={{ fontSize: fluid(11), fontWeight: 700, color: "var(--accent)", background: "var(--accent-soft)", padding: `1px ${fluid(8)}`, borderRadius: 999, fontVariantNumeric: "tabular-nums" }}>
          {unscheduled.length}
        </span>
        <span style={{ flex: 1 }} />
        <button
          onClick={onToggleOpen}
          title="Mostrar u ocultar el inbox"
          style={{ marginLeft: fluid(10), height: fluid(24), padding: `0 ${fluid(10)}`, borderRadius: fluid(7), border: "1px solid var(--line)", background: "var(--bg-elev)", color: "var(--fg-muted)", fontSize: fluid(11.5), fontWeight: 600, display: "inline-flex", alignItems: "center", gap: fluid(5), cursor: "pointer", flexShrink: 0 }}
        >
          {open ? <IChevU size={13} /> : <IChevD size={13} />}
          {open ? "Ocultar" : "Mostrar"}
        </button>
      </div>
      {open && (
        <div
          ref={setNodeRef}
          className="cal-scroll"
          style={{
            display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: fluid(8), padding: `${fluid(8)} ${fluid(20)} ${fluid(12)}`,
            transition: "background .15s",
            background: isOver ? "var(--accent-soft)" : "transparent",
            outline: isOver ? "2px dashed var(--accent)" : "none",
            outlineOffset: -4,
          }}
        >
          <button
            onClick={onAddNew}
            title="Agregar tarea sin día (N)"
            style={{
              minWidth: 0, overflow: "hidden", height: fluid(78), display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: fluid(2),
              border: "1px dashed var(--line-strong)", borderRadius: fluid(10), background: "var(--bg-sunken)", color: "var(--accent)", cursor: "pointer", fontFamily: "inherit", padding: `${fluid(8)} ${fluid(10)}`,
            }}
          >
            <IPlus size={18} />
            <span style={{ fontSize: fluid(12), fontWeight: 600 }}>Agregar tarea</span>
            <span style={{ fontSize: fluid(10), color: "var(--fg-subtle)" }}>Tocá N</span>
          </button>
          {filtered.map((t) => (
            <InboxCard key={t.id} task={t} projects={projects} categories={categories} onOpen={onOpen} />
          ))}
        </div>
      )}
    </div>
  );
}

function InboxCard({ task, projects, categories, onOpen }: { task: Task; projects: Project[]; categories: Category[]; onOpen: (task: Task) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id, data: { task } });
  const cat = categoryFor(task, categories, projects);
  const colors = cat ? colorsForCategory(cat) : { bg: "var(--bg-sunken)", fg: "var(--fg-muted)" };
  const proj = projects.find((p) => p.id === task.projectId);
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(task)}
      style={{
        minWidth: 0, overflow: "hidden", height: fluid(78), display: "flex", flexDirection: "column", gap: fluid(2),
        padding: `${fluid(7)} ${fluid(10)}`, border: "1px solid var(--line)", borderRadius: fluid(10), background: "var(--bg-elev)",
        boxShadow: "var(--shadow-sm)", cursor: "grab", borderLeft: `3px solid ${colors.bg}`,
        opacity: isDragging ? 0.4 : 1,
      }}
    >
      <div style={{ fontSize: fluid(9.5), lineHeight: 1.3, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--fg-subtle)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 0 }}>
        {proj ? proj.name : cat?.name ?? "Sin categoría"}
      </div>
      <div
        style={{
          fontSize: fluid(11.5), fontWeight: 500, lineHeight: 1.25, flex: "1 1 auto", minHeight: 0,
          maxHeight: fluid(11.5 * 1.25 * 2), overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
        }}
      >
        {task.title}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: fluid(6), fontSize: fluid(10.5), lineHeight: 1.3, color: "var(--fg-muted)", flexShrink: 0 }}>
        <span style={{ width: fluid(6), height: fluid(6), borderRadius: "50%", flexShrink: 0, background: priColor(task.priority) }} />
        <span>{priLabelEs(task.priority)}</span>
        <span style={{ color: "var(--line-strong)" }}>·</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
          <IClock size={10} /> {fmtDuration(task.duration)}
        </span>
        <span style={{ flex: 1 }} />
        <IGrip size={11} stroke={2.2} style={{ color: "var(--fg-subtle)" }} />
      </div>
    </div>
  );
}
