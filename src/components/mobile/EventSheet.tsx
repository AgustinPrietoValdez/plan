import { useEffect, useMemo, useState } from "react";
import { useCreateEvent, useEvents, usePatchEvent } from "../../lib/queries";
import { todayYmd } from "../../lib/date";

/** Modo del sheet de evento.
 *
 *  `edit` existe por el WIDGET de Android: tocarlo abre la app pidiendo un
 *  evento puntual (`MobileRoute.openEventId`). 1c consume esa ruta y abre este
 *  mismo sheet en modo edición — no hay una segunda pantalla de evento. */
export type EventSheetMode =
  | { kind: "create"; day?: string }
  | { kind: "edit"; eventId: string };

/** Bottom-sheet MOBILE de evento (crear + editar).
 *
 *  NO es un port de `EventEditor.tsx`: ese es un modal de escritorio, en inglés,
 *  con `.btn` de ~26px de alto — la mitad del mínimo táctil de 44px que pide el
 *  handoff — y con `DateInput` (teclado propio pensado para mouse). Acá todo
 *  control mide ≥44px y los `input` van en 16px, que es lo que evita el zoom
 *  automático de Android al enfocar.
 *
 *  Mutaciones por los hooks de `queries.ts` ⇒ patrón OUTBOX intacto
 *  (`repo.createEvent` / `repo.patchEvent` hacen el INSERT/UPDATE + el registro
 *  en `outbox` con `updated_at`/`version` bumpeados).
 *
 *  Alcance deliberadamente chico (decisión del handoff: "lo mínimo para crear un
 *  evento bien"):
 *    · TODO(1c · decide el usuario): NO hay campo de invitados en el modelo
 *      (`CalendarEvent` = id/title/day/startTime/endTime/location/
 *      notifyMinutesBefore/notes/categoryId/projectId). El "con Sofi" del
 *      diseño no se puede guardar y no se inventa acá.
 *    · TODO(1c · decide el usuario): `notifyMinutesBefore` no se edita. En modo
 *      edición NO se toca, así que el aviso configurado desde escritorio se
 *      conserva; en creación queda en el default del repo.
 *    · TODO(1c · decide el usuario): sin borrar evento. El diseño no lo pide y
 *      un destructivo no se agrega por cuenta propia.
 */
export function EventSheet({ mode, onClose }: { mode: EventSheetMode; onClose: () => void }) {
  const eventsQ = useEvents();
  const createEvent = useCreateEvent();
  const patchEvent = usePatchEvent();

  const existing = useMemo(
    () => (mode.kind === "edit" ? (eventsQ.data ?? []).find((e) => e.id === mode.eventId) : undefined),
    [mode, eventsQ.data],
  );

  const [title, setTitle] = useState("");
  const [day, setDay] = useState(mode.kind === "create" ? mode.day ?? todayYmd() : todayYmd());
  // "Todo el día" NO es un flag del modelo: en este esquema equivale a
  // `startTime === null` (ver `CalendarDayView`/`HomeView`, que ordenan esos
  // eventos con un fallback vacío). Acá es solo estado de UI.
  const [allDay, setAllDay] = useState(false);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // El evento a editar puede llegar DESPUÉS del primer render (la query recién
  // resuelve, o el widget abrió la app antes de que sincronice). Por eso el
  // formulario se hidrata por efecto y no en el useState inicial.
  const loadedId = existing?.id;
  useEffect(() => {
    if (!existing) return;
    setTitle(existing.title);
    setDay(existing.day);
    setAllDay(existing.startTime === null);
    setStartTime(existing.startTime ?? "09:00");
    setEndTime(existing.endTime ?? "");
    setLocation(existing.location);
    setNotes(existing.notes);
    // Solo al cambiar de evento: si dependiera del objeto entero, cualquier
    // invalidación de la query pisaría lo que el usuario está tipeando.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedId]);

  const editingButMissing = mode.kind === "edit" && !existing && !eventsQ.isLoading;

  const save = async () => {
    const t = title.trim();
    if (!t) {
      setError("Poné un título.");
      return;
    }
    if (!day) {
      setError("Falta el día.");
      return;
    }
    const start = allDay ? null : startTime || null;
    const end = allDay || !endTime ? null : endTime;
    if (!allDay && !start) {
      setError("Falta la hora de inicio (o marcá «todo el día»).");
      return;
    }
    if (start && end && end <= start) {
      setError("La hora de fin tiene que ser posterior a la de inicio.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (mode.kind === "edit") {
        await patchEvent.mutateAsync({
          id: mode.eventId,
          patch: { title: t, day, startTime: start, endTime: end, location, notes },
        });
      } else {
        await createEvent.mutateAsync({
          title: t,
          day,
          startTime: start,
          endTime: end,
          location,
          notes,
        });
      }
      onClose();
    } catch (err) {
      setSaving(false);
      setError(err instanceof Error ? err.message : "No se pudo guardar el evento.");
    }
  };

  return (
    <div className="m-sheet-backdrop" onClick={onClose}>
      <div className="m-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="m-sheet-head">
          <span>{mode.kind === "edit" ? "Evento" : "Nuevo evento"}</span>
          <button className="m-sheet-close" type="button" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        {editingButMissing ? (
          <p className="m-empty">Ese evento ya no está.</p>
        ) : (
          <div className="m-plan-form">
            {error && <div className="m-plan-error">{error}</div>}

            <div className="m-plan-field">
              <label className="m-plan-field-label" htmlFor="m-ev-title">
                Título
              </label>
              <input
                id="m-ev-title"
                className="m-plan-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Reunión"
                autoComplete="off"
              />
            </div>

            <div className="m-plan-field">
              <label className="m-plan-field-label" htmlFor="m-ev-day">
                Día
              </label>
              <input
                id="m-ev-day"
                className="m-plan-input"
                type="date"
                value={day}
                onChange={(e) => setDay(e.target.value)}
              />
            </div>

            <div className="m-plan-chips">
              <button
                type="button"
                className={`m-plan-chip${allDay ? " is-active" : ""}`}
                onClick={() => setAllDay((v) => !v)}
              >
                Todo el día
              </button>
            </div>

            <div className="m-plan-row">
              <div className="m-plan-field">
                <label className="m-plan-field-label" htmlFor="m-ev-start">
                  Empieza
                </label>
                <input
                  id="m-ev-start"
                  className="m-plan-input"
                  type="time"
                  value={startTime}
                  disabled={allDay}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
              <div className="m-plan-field">
                <label className="m-plan-field-label" htmlFor="m-ev-end">
                  Termina
                </label>
                <input
                  id="m-ev-end"
                  className="m-plan-input"
                  type="time"
                  value={endTime}
                  disabled={allDay}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            </div>

            <div className="m-plan-field">
              <label className="m-plan-field-label" htmlFor="m-ev-loc">
                Lugar
              </label>
              <input
                id="m-ev-loc"
                className="m-plan-input"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Google Meet"
                autoComplete="off"
              />
            </div>

            <div className="m-plan-field">
              <label className="m-plan-field-label" htmlFor="m-ev-notes">
                Notas
              </label>
              <textarea
                id="m-ev-notes"
                className="m-plan-input"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <div className="m-plan-actions">
              <button className="m-plan-btn" type="button" onClick={onClose}>
                Cancelar
              </button>
              <button
                className="m-plan-btn m-plan-btn--primary"
                type="button"
                disabled={saving}
                onClick={() => void save()}
              >
                {mode.kind === "edit" ? "Guardar" : "Crear"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
