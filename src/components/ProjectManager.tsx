import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { colorsForCategory } from "../lib/categoryColor";
import {
  useCategories,
  useCreateProject,
  useDeleteProject,
  usePatchProject,
  useProjects,
  useTasks,
} from "../lib/queries";
import { scaffoldProjectGuide } from "../lib/obsidian";
import type { Milestone } from "../types";
import { IPlus, ITrash, IX } from "./icons";

// Mirror the desktop/mobile check from main.tsx (Obsidian scaffolding is
// desktop-only; on mobile there is no vault).
const isMobile =
  /android/i.test(navigator.userAgent) ||
  new URLSearchParams(window.location.search).has("mobile");

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

  // Create form
  const [creating, setCreating] = useState(false);
  const [creatingSaving, setCreatingSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newCategoryId, setNewCategoryId] = useState<string>("");
  const [newObjetivo, setNewObjetivo] = useState("");
  const [newMilestones, setNewMilestones] = useState<Milestone[]>([]);
  const milestoneCounter = useRef(0);

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

  const openCreate = () => {
    if (categories.length === 0) {
      alert("Crea una categoría primero.");
      return;
    }
    setNewName("");
    setNewObjetivo("");
    setNewMilestones([]);
    setNewCategoryId(categories[0].id);
    setCreateError(null);
    setCreating(true);
  };

  const cancelCreate = () => {
    setCreating(false);
    setNewName("");
    setNewObjetivo("");
    setNewMilestones([]);
    setCreateError(null);
  };

  const submitCreate = async () => {
    const name = newName.trim();
    if (name.length === 0 || !newCategoryId || creatingSaving) return;
    const milestones = newMilestones
      .map((m) => ({ ...m, title: m.title.trim(), description: m.description.trim() }))
      .filter((m) => m.title.length > 0);
    const objetivo = newObjetivo.trim();

    setCreatingSaving(true);
    setCreateError(null);
    const timeout = new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error("Timeout — reintentá si sigue pasando")), 10_000)
    );
    try {
      await Promise.race([
        createProject.mutateAsync({ name, categoryId: newCategoryId, objetivo, milestones }),
        timeout,
      ]);
    } catch (e) {
      setCreatingSaving(false);
      setCreateError(e instanceof Error ? e.message : "No se pudo crear el proyecto");
      return;
    }

    // Desktop only: scaffold the Obsidian guide. A missing vault / Android
    // never blocks project creation, so swallow any error.
    if (!isMobile) {
      try {
        await scaffoldProjectGuide({ name, objetivo, estado: "activo", milestones });
      } catch (err) {
        console.warn("[scaffoldProjectGuide] skipped:", err);
      }
    }

    setCreatingSaving(false);
    cancelCreate();
  };

  const onConfirmDelete = (id: string) => {
    deleteProject.mutate(id);
    setConfirmDeleteId(null);
  };

  const usageCount = (id: string) =>
    tasks.filter((t) => t.projectId === id && !t.done).length;

  return (
    <div className="modal-backdrop" onMouseDown={onBackdropMouseDown}>
      <div className="modal" style={{ width: "calc(var(--home-s, 1) * 540px)" }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span style={{ flex: 1, fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" }}>
            Projects
          </span>
          <button className="icon-btn" onClick={onClose} title="Close">
            <IX size={14} />
          </button>
        </div>

        <div className="modal-body">
          {creating && (
            <div
              style={{
                border: "1px solid var(--accent)",
                borderRadius: 8,
                padding: "12px",
                background: "var(--bg-elev)",
                display: "flex",
                flexDirection: "column",
                gap: 10,
                marginBottom: 4,
              }}
            >
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>Nuevo proyecto</div>
              <input
                autoFocus
                className="input"
                placeholder="Nombre del proyecto"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {categories.map((c) => {
                  const swatch = colorsForCategory(c);
                  const active = c.id === newCategoryId;
                  return (
                    <span
                      key={c.id}
                      className={`pill-select ${active ? "active" : ""}`}
                      style={
                        active
                          ? { background: swatch.bg, color: swatch.fg, borderColor: "transparent" }
                          : undefined
                      }
                      onClick={() => setNewCategoryId(c.id)}
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
              <textarea
                className="input"
                placeholder="Objetivo del proyecto (que se busca lograr)"
                value={newObjetivo}
                onChange={(e) => setNewObjetivo(e.target.value)}
                rows={2}
                style={{ resize: "vertical", minHeight: 48 }}
              />
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span
                  style={{
                    fontSize: 10.5,
                    color: "var(--fg-muted)",
                    textTransform: "uppercase",
                    letterSpacing: ".05em",
                    fontWeight: 600,
                  }}
                >
                  Hitos
                </span>
                {newMilestones.map((m, i) => (
                  <div key={m.id} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input
                      className="input"
                      placeholder="Titulo del hito"
                      value={m.title}
                      onChange={(e) => {
                        const next = newMilestones.slice();
                        next[i] = { ...next[i], title: e.target.value };
                        setNewMilestones(next);
                      }}
                      style={{ flex: 1 }}
                    />
                    <button
                      className="icon-btn"
                      style={{ width: 24, height: 24 }}
                      onClick={() => setNewMilestones(newMilestones.filter((_, j) => j !== i))}
                    >
                      <IX size={11} />
                    </button>
                  </div>
                ))}
                <button
                  className="btn ghost"
                  style={{ alignSelf: "flex-start", padding: "4px 8px", fontSize: 11.5 }}
                  onClick={() =>
                    setNewMilestones([
                      ...newMilestones,
                      {
                        id: `new_${Date.now()}_${++milestoneCounter.current}`,
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
              {createError && (
                <div style={{ fontSize: 12, color: "var(--danger)" }}>{createError}</div>
              )}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button className="btn ghost" onClick={cancelCreate} disabled={creatingSaving}>
                  Cancelar
                </button>
                <button
                  className="btn primary"
                  onClick={() => void submitCreate()}
                  disabled={newName.trim().length === 0 || creatingSaving}
                >
                  {creatingSaving ? "Creando…" : "Crear proyecto"}
                </button>
              </div>
            </div>
          )}

          {projects.length === 0 && !creating && (
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
          <button className="btn" onClick={openCreate} disabled={creating}>
            <IPlus size={12} /> Nuevo proyecto
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
