import { useState } from "react";
import { useEvents, useCreateEvent, usePatchEvent, useDeleteEvent, useCategories, useProjects } from "../lib/queries";
import { useApp } from "../lib/store";
import { colorsForCategory } from "../lib/categoryColor";
import { todayYmd } from "../lib/date";
import { vars } from "../lib/style";
import { IX, ITrash, ICal } from "./icons";

const NOTIFY_OPTIONS = [
  { label: "No notification", value: null },
  { label: "5 min before", value: 5 },
  { label: "10 min before", value: 10 },
  { label: "15 min before", value: 15 },
  { label: "30 min before", value: 30 },
  { label: "1 hour before", value: 60 },
  { label: "2 hours before", value: 120 },
];

interface CreateProps {
  mode: "create";
  prefill: { day?: string };
  onClose: () => void;
  onSwitchToTask?: () => void;
}

interface EditProps {
  mode: "edit";
  eventId: string;
  onClose: () => void;
}

type Props = CreateProps | EditProps;

export function EventEditor(props: Props) {
  const eventsQ = useEvents();
  const categoriesQ = useCategories();
  const projectsQ = useProjects();
  const createEvent = useCreateEvent();
  const patchEvent = usePatchEvent();
  const deleteEvent = useDeleteEvent();
  const { openCategoryManager } = useApp();

  const categories = categoriesQ.data ?? [];
  const projects = projectsQ.data ?? [];
  const visibleCategories = categories.filter((c) => !c.archived);

  const existing =
    props.mode === "edit"
      ? (eventsQ.data ?? []).find((e) => e.id === props.eventId) ?? null
      : null;

  const today = todayYmd();

  const [title, setTitle] = useState(existing?.title ?? "");
  const [day, setDay] = useState(
    existing?.day ?? (props.mode === "create" ? (props.prefill.day ?? today) : today),
  );
  const [allDay, setAllDay] = useState(!existing?.startTime);
  const [startTime, setStartTime] = useState(existing?.startTime ?? "");
  const [endTime, setEndTime] = useState(existing?.endTime ?? "");
  const [location, setLocation] = useState(existing?.location ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [notify, setNotify] = useState<number | null>(existing?.notifyMinutesBefore ?? null);
  const [categoryId, setCategoryId] = useState<string | null>(existing?.categoryId ?? null);
  const [projectId, setProjectId] = useState<string | null>(existing?.projectId ?? null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isBusy = createEvent.isPending || patchEvent.isPending || deleteEvent.isPending || saving;

  const withTimeout = <T,>(p: Promise<T>): Promise<T> =>
    Promise.race([
      p,
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("Timeout — reintentá si sigue pasando")), 10_000)),
    ]);

  const handleSave = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    setError(null);
    const payload = {
      title: title.trim(),
      day,
      startTime: allDay ? null : (startTime || null),
      endTime: allDay ? null : (endTime || null),
      location: location.trim(),
      notes: notes.trim(),
      notifyMinutesBefore: notify,
      categoryId,
      projectId,
    };
    try {
      if (props.mode === "create") {
        await withTimeout(createEvent.mutateAsync(payload));
      } else {
        await withTimeout(patchEvent.mutateAsync({ id: props.eventId, patch: payload }));
      }
      props.onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      if (props.mode === "edit") {
        await withTimeout(deleteEvent.mutateAsync(props.eventId));
      }
      props.onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo borrar");
      setSaving(false);
    }
  };

  const resolvedCatId = categoryId
    ?? (projectId ? (projects.find((p) => p.id === projectId)?.categoryId ?? null) : null);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => { if (e.target === e.currentTarget) props.onClose(); }}
    >
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        {props.mode === "create" && (props as CreateProps).onSwitchToTask && (
          <div style={{ display: "flex", gap: 4, padding: "10px 14px 0" }}>
            <button className="chip" style={{ cursor: "pointer" }} onClick={(props as CreateProps).onSwitchToTask}>
              Tarea
            </button>
            <button className="chip active" style={{ cursor: "default" }}>
              Evento
            </button>
          </div>
        )}

        <div className="modal-head">
          <div style={{
            width: 18, height: 18, borderRadius: 5,
            background: "var(--accent-soft)", color: "var(--accent)",
            display: "grid", placeItems: "center", flex: "0 0 auto",
          }}>
            <ICal size={11} stroke={2} />
          </div>
          <input
            className="title-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") props.onClose(); }}
            autoFocus
            placeholder="Nombre del evento…"
          />
          <button className="icon-btn" onClick={props.onClose} title="Cerrar">
            <IX size={14} />
          </button>
        </div>

        <div className="modal-body">
          <div className="field">
            <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingRight: 4 }}>
              <span>Categoría</span>
              <button
                type="button"
                onClick={openCategoryManager}
                style={{ fontSize: 10.5, color: "var(--fg-subtle)", fontWeight: 500, padding: 0, background: "none", border: 0, cursor: "pointer" }}
              >
                Manage
              </button>
            </label>
            <div className="control">
              {visibleCategories.length === 0 && (
                <span style={{ fontSize: 12, color: "var(--fg-subtle)" }}>
                  Sin categorías —{" "}
                  <button type="button" onClick={openCategoryManager} style={{ background: "none", border: 0, padding: 0, color: "var(--accent)", cursor: "pointer", font: "inherit" }}>
                    agregar
                  </button>
                </span>
              )}
              {visibleCategories.map((c) => {
                const active = resolvedCatId === c.id;
                const colors = colorsForCategory(c);
                return (
                  <span
                    key={c.id}
                    className={`pill-select ${active ? "active" : ""}`}
                    style={active ? { background: colors.bg, color: colors.fg, borderColor: "transparent" } : undefined}
                    onClick={() => setCategoryId(categoryId === c.id ? null : c.id)}
                  >
                    <span className="swatch" style={{ background: colors.bg, border: "1px solid rgba(0,0,0,0.06)" }} />
                    {c.name}
                  </span>
                );
              })}
            </div>
          </div>

          <div className="field">
            <label>Proyecto</label>
            <div className="control">
              <span className={`pill-select ${!projectId ? "active" : ""}`} onClick={() => setProjectId(null)}>
                None
              </span>
              {projects.map((p) => {
                const pcat = categories.find((c) => c.id === p.categoryId);
                const colors = pcat ? colorsForCategory(pcat) : null;
                const active = projectId === p.id;
                return (
                  <span
                    key={p.id}
                    className={`pill-select ${active ? "active" : ""}`}
                    style={active && colors ? vars({ "--cat-bg": colors.bg, "--cat-fg": colors.fg }, { background: colors.bg, color: colors.fg }) : undefined}
                    onClick={() => setProjectId(p.id)}
                  >
                    <span className="swatch" style={{ background: colors?.bg ?? "var(--bg-sunken)", border: "1px solid rgba(0,0,0,0.06)" }} />
                    {p.name}
                  </span>
                );
              })}
            </div>
          </div>

          <div className="field">
            <label>Fecha</label>
            <div className="control">
              <input
                type="date"
                className="input"
                style={{ width: "auto" }}
                value={day}
                onChange={(e) => setDay(e.target.value)}
              />
            </div>
          </div>

          <div className="field">
            <label>Horario</label>
            <div className="control">
              <span
                className={`pill-select ${allDay ? "active" : ""}`}
                onClick={() => setAllDay(true)}
              >
                Todo el día
              </span>
              <span
                className={`pill-select ${!allDay ? "active" : ""}`}
                onClick={() => setAllDay(false)}
              >
                Con hora
              </span>
              {!allDay && (
                <>
                  <input
                    type="time"
                    className="input"
                    style={{ width: "auto" }}
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    placeholder="inicio"
                  />
                  <input
                    type="time"
                    className="input"
                    style={{ width: "auto" }}
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    placeholder="fin"
                  />
                </>
              )}
            </div>
          </div>

          <div className="field">
            <label>Lugar</label>
            <input
              className="input"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Opcional"
            />
          </div>

          <div className="field">
            <label>Notificar</label>
            <div className="control">
              <select
                className="input"
                style={{ width: "auto" }}
                value={notify ?? "null"}
                onChange={(e) => setNotify(e.target.value === "null" ? null : Number(e.target.value))}
              >
                {NOTIFY_OPTIONS.map((o) => (
                  <option key={String(o.value)} value={o.value ?? "null"}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label>Notas</label>
            <textarea
              className="input"
              placeholder="Detalles opcionales…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          {error && (
            <div style={{ fontSize: 12, color: "var(--danger)" }}>{error}</div>
          )}
        </div>

        <div className="modal-foot">
          {props.mode === "edit" ? (
            <button
              className={`btn ghost danger`}
              onClick={handleDelete}
              disabled={isBusy}
            >
              <ITrash size={12} />
              {confirmDelete ? "Confirmar" : "Borrar"}
            </button>
          ) : (
            <span />
          )}
          <div className="actions">
            <button className="btn ghost" onClick={props.onClose} disabled={isBusy}>
              Cancelar
            </button>
            <button className="btn primary" onClick={handleSave} disabled={isBusy || !title.trim()}>
              {props.mode === "create" ? "Crear" : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Small chip used in WeekView/MonthView cells */
export function EventChip({
  event,
  onClick,
}: {
  event: import("../types").CalendarEvent;
  onClick: (e: import("../types").CalendarEvent) => void;
}) {
  return (
    <div
      className="event-chip"
      onClick={(ev) => { ev.stopPropagation(); onClick(event); }}
      title={[event.title, event.startTime, event.location].filter(Boolean).join(" · ")}
    >
      <ICal size={9} stroke={2} />
      <span className="label">
        {event.startTime && <span style={{ opacity: 0.75, marginRight: 3 }}>{event.startTime}</span>}
        {event.title}
      </span>
    </div>
  );
}
