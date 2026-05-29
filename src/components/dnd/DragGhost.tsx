import { categoryFor, projectFor } from "../../lib/categoryFor";
import { colorsForCategory } from "../../lib/categoryColor";
import type { Category, Project, Task } from "../../types";

interface Props {
  task: Task;
  projects: Project[];
  categories: Category[];
}

export function DragGhost({ task, projects, categories }: Props) {
  const cat = categoryFor(task, categories, projects);
  const colors = cat
    ? colorsForCategory(cat)
    : { bg: "var(--line)", fg: "var(--fg-muted)" };
  const proj = projectFor(task, projects);
  return (
    <div
      style={{
        background: "var(--bg-elev)",
        border: "1px solid var(--line-strong)",
        borderRadius: 8,
        padding: "8px 10px",
        borderLeft: `3px solid ${colors.bg}`,
        fontSize: 12.5,
        fontWeight: 500,
        boxShadow: "var(--shadow-lg)",
        transform: "rotate(-1.5deg)",
        width: 220,
        cursor: "grabbing",
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: colors.fg,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: ".05em",
          marginBottom: 2,
        }}
      >
        {proj ? proj.name : cat?.name ?? "Uncategorized"}
      </div>
      <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {task.title}
      </div>
    </div>
  );
}
