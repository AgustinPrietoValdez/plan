import { useState } from "react";
import {
  useAutomations,
  useCreateAutomation,
  useDeleteAutomation,
  usePatchAutomation,
  useProjects,
} from "../lib/queries";
import type { Automation } from "../types";
import type { AutomationCreate } from "../lib/repo";
import { IBolt, IPlus, ITrash, IX } from "./icons";

type EditorMode = { open: false } | { open: true; automation: Automation | null };

const KIND_PRESETS = ["email-search", "custom"];

const defaultForm = (): FormState => ({
  name: "",
  projectId: "",
  kind: "custom",
  kindCustom: "",
  config: "{}",
  trigger: "manual",
  schedule: "",
  enabled: true,
  notes: "",
});

interface FormState {
  name: string;
  projectId: string;
  kind: string;
  kindCustom: string;
  config: string;
  trigger: "manual" | "scheduled";
  schedule: string;
  enabled: boolean;
  notes: string;
}

function formFromAutomation(a: Automation): FormState {
  const isPreset = KIND_PRESETS.includes(a.kind);
  return {
    name: a.name,
    projectId: a.projectId ?? "",
    kind: isPreset ? a.kind : "custom",
    kindCustom: isPreset ? "" : a.kind,
    config: JSON.stringify(a.config, null, 2),
    trigger: a.trigger,
    schedule: a.schedule ?? "",
    enabled: a.enabled,
    notes: a.notes,
  };
}

function resolveKind(form: FormState): string {
  if (form.kind === "custom" && form.kindCustom.trim()) return form.kindCustom.trim();
  return form.kind;
}

function parseConfig(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) return parsed;
    return null;
  } catch {
    return null;
  }
}

export function AutomationsView() {
  const automationsQ = useAutomations();
  const projectsQ = useProjects();
  const createMut = useCreateAutomation();
  const patchMut = usePatchAutomation();
  const deleteMut = useDeleteAutomation();

  const automations = automationsQ.data ?? [];
  const projects = projectsQ.data ?? [];

  const [editor, setEditor] = useState<EditorMode>({ open: false });
  const [form, setForm] = useState<FormState>(defaultForm());
  const [configError, setConfigError] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  function openCreate() {
    setForm(defaultForm());
    setConfigError(false);
    setEditor({ open: true, automation: null });
  }

  function openEdit(a: Automation) {
    setForm(formFromAutomation(a));
    setConfigError(false);
    setEditor({ open: true, automation: a });
  }

  function closeEditor() {
    setEditor({ open: false });
  }

  function handleField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key === "config") setConfigError(false);
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    const config = parseConfig(form.config);
    if (config === null) { setConfigError(true); return; }

    const payload: AutomationCreate = {
      name: form.name.trim(),
      kind: resolveKind(form),
      projectId: form.projectId || null,
      config,
      trigger: form.trigger,
      schedule: form.schedule.trim() || null,
      enabled: form.enabled,
      notes: form.notes.trim(),
    };

    if (editor.open && editor.automation) {
      await patchMut.mutateAsync({ id: editor.automation.id, patch: payload });
    } else {
      await createMut.mutateAsync(payload);
    }
    closeEditor();
  }

  async function handleDelete(id: string) {
    await deleteMut.mutateAsync(id);
    setDeleteConfirm(null);
  }

  async function toggleEnabled(a: Automation) {
    await patchMut.mutateAsync({ id: a.id, patch: { enabled: !a.enabled } });
  }

  const grouped = groupByProject(automations, projects);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "14px 20px 10px",
          borderBottom: "1px solid var(--line)",
          flexShrink: 0,
        }}
      >
        <IBolt size={16} />
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, flex: 1 }}>Automatizaciones</h2>
        <button className="btn primary" onClick={openCreate} style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <IPlus size={13} /> Nueva
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px 20px" }}>
        {automations.length === 0 ? (
          <EmptyState onNew={openCreate} />
        ) : (
          grouped.map(({ label, items }) => (
            <div key={label} style={{ marginBottom: 20 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "var(--fg-subtle)",
                  marginBottom: 6,
                }}
              >
                {label}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {items.map((a) => (
                  <AutomationRow
                    key={a.id}
                    automation={a}
                    onEdit={() => openEdit(a)}
                    onToggle={() => void toggleEnabled(a)}
                    onDeleteRequest={() => setDeleteConfirm(a.id)}
                    deleting={deleteMut.isPending && deleteConfirm === a.id}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {editor.open && (
        <AutomationModal
          form={form}
          isEdit={editor.automation !== null}
          projects={projects}
          configError={configError}
          saving={createMut.isPending || patchMut.isPending}
          onChange={handleField}
          onSave={() => void handleSave()}
          onClose={closeEditor}
        />
      )}

      {deleteConfirm && (
        <ConfirmDeleteModal
          onConfirm={() => void handleDelete(deleteConfirm)}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  );
}

// ---------- sub-components ----------

interface RowProps {
  automation: Automation;
  onEdit: () => void;
  onToggle: () => void;
  onDeleteRequest: () => void;
  deleting: boolean;
}

function AutomationRow({ automation: a, onEdit, onToggle, onDeleteRequest }: RowProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 12px",
        borderRadius: 8,
        background: "var(--bg-elev)",
        border: "1px solid var(--line)",
        opacity: a.enabled ? 1 : 0.5,
      }}
    >
      <button
        onClick={onToggle}
        title={a.enabled ? "Desactivar" : "Activar"}
        style={{
          width: 32,
          height: 18,
          borderRadius: 9,
          border: "none",
          background: a.enabled ? "var(--accent)" : "var(--bg-sunken)",
          cursor: "pointer",
          position: "relative",
          flexShrink: 0,
          transition: "background 0.15s",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: a.enabled ? 16 : 2,
            width: 14,
            height: 14,
            borderRadius: "50%",
            background: "white",
            transition: "left 0.15s",
          }}
        />
      </button>
      <span style={{ fontWeight: 500, fontSize: 13, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {a.name}
      </span>
      <KindBadge kind={a.kind} />
      {a.trigger === "scheduled" && a.schedule && (
        <span style={{ fontSize: 11, color: "var(--fg-muted)", whiteSpace: "nowrap" }}>🕐 {a.schedule}</span>
      )}
      <button className="icon-btn" onClick={onEdit} title="Editar">
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      </button>
      <button className="icon-btn" onClick={onDeleteRequest} title="Eliminar" style={{ color: "var(--danger)" }}>
        <ITrash size={14} />
      </button>
    </div>
  );
}

function KindBadge({ kind }: { kind: string }) {
  const color = kind === "email-search" ? "var(--c-blue-fg)" : "var(--fg-subtle)";
  return (
    <span
      style={{
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: "0.04em",
        padding: "2px 7px",
        borderRadius: 5,
        background: "var(--bg-sunken)",
        color,
        flexShrink: 0,
        whiteSpace: "nowrap",
      }}
    >
      {kind}
    </span>
  );
}

interface ModalProps {
  form: FormState;
  isEdit: boolean;
  projects: { id: string; name: string; archived: boolean }[];
  configError: boolean;
  saving: boolean;
  onChange: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  onSave: () => void;
  onClose: () => void;
}

function AutomationModal({ form, isEdit, projects, configError, saving, onChange, onSave, onClose }: ModalProps) {
  const activeProjects = projects.filter((p) => !p.archived);
  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 200,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: "var(--bg)", borderRadius: 12, padding: 24, width: 480, maxWidth: "90vw",
          maxHeight: "85vh", overflowY: "auto", boxShadow: "0 8px 40px rgba(0,0,0,0.35)",
          display: "flex", flexDirection: "column", gap: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
            {isEdit ? "Editar automatización" : "Nueva automatización"}
          </h3>
          <button className="icon-btn" onClick={onClose}><IX size={14} /></button>
        </div>

        <Field label="Nombre *">
          <input
            className="input"
            value={form.name}
            onChange={(e) => onChange("name", e.target.value)}
            placeholder="ej. Buscar ofertas laborales"
            autoFocus
          />
        </Field>

        <Field label="Proyecto">
          <select className="input" value={form.projectId} onChange={(e) => onChange("projectId", e.target.value)}>
            <option value="">Global (sin proyecto)</option>
            {activeProjects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </Field>

        <Field label="Tipo">
          <select className="input" value={form.kind} onChange={(e) => onChange("kind", e.target.value as FormState["kind"])}>
            <option value="email-search">email-search</option>
            <option value="custom">custom (o definir abajo)</option>
          </select>
          {form.kind === "custom" && (
            <input
              className="input"
              style={{ marginTop: 6 }}
              value={form.kindCustom}
              onChange={(e) => onChange("kindCustom", e.target.value)}
              placeholder="nombre del tipo personalizado"
            />
          )}
        </Field>

        <Field label="Config (JSON)">
          <textarea
            className="input"
            value={form.config}
            onChange={(e) => onChange("config", e.target.value)}
            rows={4}
            style={{ fontFamily: "var(--font-mono)", fontSize: 12, resize: "vertical" }}
            placeholder="{}"
          />
          {configError && (
            <span style={{ fontSize: 11, color: "var(--danger)", marginTop: 2 }}>JSON inválido</span>
          )}
        </Field>

        <Field label="Trigger">
          <select className="input" value={form.trigger} onChange={(e) => onChange("trigger", e.target.value as "manual" | "scheduled")}>
            <option value="manual">Manual</option>
            <option value="scheduled">Programado</option>
          </select>
        </Field>

        {form.trigger === "scheduled" && (
          <Field label="Schedule (cron o descripción)">
            <input
              className="input"
              value={form.schedule}
              onChange={(e) => onChange("schedule", e.target.value)}
              placeholder="ej. 0 9 * * 1 o 'cada lunes a las 9'"
            />
          </Field>
        )}

        <Field label="Notas">
          <textarea
            className="input"
            value={form.notes}
            onChange={(e) => onChange("notes", e.target.value)}
            rows={2}
            placeholder="Descripción, instrucciones, refs…"
            style={{ resize: "vertical" }}
          />
        </Field>

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => onChange("enabled", e.target.checked)}
          />
          Habilitada
        </label>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 4 }}>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" onClick={onSave} disabled={saving || !form.name.trim()}>
            {saving ? "Guardando…" : isEdit ? "Guardar" : "Crear"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDeleteModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 300,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div style={{ background: "var(--bg)", borderRadius: 10, padding: 24, width: 320, boxShadow: "0 4px 24px rgba(0,0,0,0.3)" }}>
        <p style={{ margin: "0 0 16px", fontSize: 14 }}>¿Eliminar esta automatización?</p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn" onClick={onCancel}>Cancelar</button>
          <button className="btn ghost" style={{ color: "var(--danger)" }} onClick={onConfirm}>Eliminar</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontSize: 12, fontWeight: 500, color: "var(--fg-muted)" }}>{label}</label>
      {children}
    </div>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--fg-muted)" }}>
      <IBolt size={32} style={{ opacity: 0.3, marginBottom: 12 }} />
      <p style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 500, color: "var(--fg)" }}>Sin automatizaciones todavía</p>
      <p style={{ margin: "0 0 20px", fontSize: 13, maxWidth: 340, marginInline: "auto" }}>
        Las automatizaciones te permiten definir acciones recurrentes (buscar mails, crear tareas, etc.)
        que se ejecutan cuando vos lo pedís o según un horario.
      </p>
      <button className="btn primary" onClick={onNew}>Crear la primera</button>
    </div>
  );
}

function groupByProject(
  automations: Automation[],
  projects: { id: string; name: string }[],
): { label: string; items: Automation[] }[] {
  const projectMap = new Map(projects.map((p) => [p.id, p.name]));
  const groups = new Map<string, Automation[]>();

  for (const a of automations) {
    const key = a.projectId ?? "__global__";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(a);
  }

  const result: { label: string; items: Automation[] }[] = [];
  const global = groups.get("__global__");
  if (global) result.push({ label: "Global", items: global });

  for (const [key, items] of groups.entries()) {
    if (key === "__global__") continue;
    result.push({ label: projectMap.get(key) ?? key, items });
  }

  return result;
}
