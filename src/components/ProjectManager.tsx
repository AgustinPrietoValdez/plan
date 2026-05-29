import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { colorsForCategory } from "../lib/categoryColor";
import {
  useCategories,
  useCreateProject,
  useDeleteProject,
  usePatchProject,
  useProjects,
  useTasks,
} from "../lib/queries";
import { IPlus, ITrash, IX } from "./icons";

interface Props {
  onClose: () => void;
}

export function ProjectManager({ onClose }: Props) {
  const projectsQ = useProjects();
  const categoriesQ = useCategories();
  const tasksQ = useTasks();
  const createProject = useCreateProject();
  const patchProject = usePatchProject();
  const deleteProject = useDeleteProject();

  const projects = useMemo(
    () => (projectsQ.data ?? []).filter((p) => !p.archived),
    [projectsQ.data],
  );
  const categories = useMemo(
    () => (categoriesQ.data ?? []).filter((c) => !c.archived),
    [categoriesQ.data],
  );
  const tasks = tasksQ.data ?? [];

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onBackdropMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const startRename = (id: string, current: string) => {
    setEditingId(id);
    setDraftName(current);
  };

  const commitRename = () => {
    if (!editingId) return;
    const trimmed = draftName.trim();
    if (trimmed.length > 0) {
      patchProject.mutate({ id: editingId, patch: { name: trimmed } });
    }
    setEditingId(null);
    setDraftName("");
  };

  const onAdd = () => {
    if (categories.length === 0) {
      alert("Create a category first.");
      return;
    }
    createProject.mutate({
      name: "Untitled project",
      categoryId: categories[0].id,
    });
  };

  const onConfirmDelete = (id: string) => {
    deleteProject.mutate(id);
    setConfirmDeleteId(null);
  };

  const usageCount = (id: string) =>
    tasks.filter((t) => t.projectId === id && !t.done).length;

  return (
    <div className="modal-backdrop" onMouseDown={onBackdropMouseDown}>
      <div className="modal" style={{ width: 540 }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span style={{ flex: 1, fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" }}>
            Projects
          </span>
          <button className="icon-btn" onClick={onClose} title="Close">
            <IX size={14} />
          </button>
        </div>

        <div className="modal-body">
          {projects.length === 0 && (
            <div
              style={{
                padding: "20px 12px",
                textAlign: "center",
                fontSize: 12.5,
                color: "var(--fg-subtle)",
                border: "1px dashed var(--line)",
                borderRadius: 8,
              }}
            >
              No projects yet. Click "Add project" to create one.
            </div>
          )}

          {projects.map((p) => {
            const cat = categories.find((c) => c.id === p.categoryId);
            const colors = cat
              ? colorsForCategory(cat)
              : { bg: "var(--bg-sunken)", fg: "var(--fg-muted)" };
            const inUse = usageCount(p.id);
            const editing = editingId === p.id;
            const confirming = confirmDeleteId === p.id;
            return (
              <div
                key={p.id}
                style={{
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                  padding: "10px 12px",
                  background: "var(--bg-elev)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 6,
                      background: colors.bg,
                      flex: "0 0 auto",
                    }}
                  />
                  {editing ? (
                    <input
                      autoFocus
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename();
                        else if (e.key === "Escape") {
                          setEditingId(null);
                          setDraftName("");
                        }
                      }}
                      style={{
                        flex: 1,
                        border: "1px solid var(--accent)",
                        borderRadius: 6,
                        padding: "4px 8px",
                        fontSize: 13,
                        fontWeight: 500,
                        outline: 0,
                        background: "var(--bg-elev)",
                      }}
                    />
                  ) : (
                    <button
                      onClick={() => startRename(p.id, p.name)}
                      style={{
                        flex: 1,
                        textAlign: "left",
                        fontSize: 13,
                        fontWeight: 500,
                        color: "var(--fg)",
                        padding: "4px 0",
                        background: "none",
                        border: 0,
                      }}
                      title="Click to rename"
                    >
                      {p.name}
                    </button>
                  )}
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--fg-subtle)",
                      fontVariantNumeric: "tabular-nums",
                      minWidth: 40,
                      textAlign: "right",
                    }}
                  >
                    {inUse} {inUse === 1 ? "task" : "tasks"}
                  </span>
                  {confirming ? (
                    <>
                      <button
                        className="btn ghost"
                        onClick={() => setConfirmDeleteId(null)}
                        style={{ padding: "4px 8px", fontSize: 11.5 }}
                      >
                        Cancel
                      </button>
                      <button
                        className="btn"
                        onClick={() => onConfirmDelete(p.id)}
                        style={{
                          padding: "4px 8px",
                          fontSize: 11.5,
                          color: "var(--danger)",
                          borderColor: "var(--danger)",
                        }}
                      >
                        Confirm
                      </button>
                    </>
                  ) : (
                    <button
                      className="icon-btn"
                      title="Delete project"
                      onClick={() => setConfirmDeleteId(p.id)}
                      style={{ color: "var(--fg-subtle)" }}
                    >
                      <ITrash size={13} />
                    </button>
                  )}
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  <span
                    style={{
                      fontSize: 10.5,
                      color: "var(--fg-muted)",
                      textTransform: "uppercase",
                      letterSpacing: ".05em",
                      fontWeight: 600,
                      paddingTop: 5,
                      marginRight: 4,
                    }}
                  >
                    Category:
                  </span>
                  {categories.map((c) => {
                    const swatch = colorsForCategory(c);
                    const active = c.id === p.categoryId;
                    return (
                      <span
                        key={c.id}
                        className={`pill-select ${active ? "active" : ""}`}
                        style={
                          active
                            ? {
                                background: swatch.bg,
                                color: swatch.fg,
                                borderColor: "transparent",
                              }
                            : undefined
                        }
                        onClick={() =>
                          patchProject.mutate({ id: p.id, patch: { categoryId: c.id } })
                        }
                      >
                        <span
                          className="swatch"
                          style={{ background: swatch.bg, border: "1px solid rgba(0,0,0,0.06)" }}
                        />
                        {c.name}
                      </span>
                    );
                  })}
                </div>

                {confirming && inUse > 0 && (
                  <div
                    style={{
                      fontSize: 11.5,
                      color: "var(--fg-muted)",
                      padding: "4px 0",
                    }}
                  >
                    {inUse} task{inUse === 1 ? "" : "s"} use this project. They'll keep their data
                    but lose the project association.
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="modal-foot">
          <button className="btn" onClick={onAdd}>
            <IPlus size={12} /> Add project
          </button>
          <div className="actions">
            <button className="btn primary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
