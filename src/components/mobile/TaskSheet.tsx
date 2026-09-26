import { useState } from "react";
import { colorsForHue } from "../../lib/categoryColor";
import { todayYmd } from "../../lib/date";
import { useCategories, useCreateTask } from "../../lib/queries";

/** Duraciones ofrecidas como chips. `0` = "sin estimar" (es el default del
 *  modelo y lo que hace que la tarea no sume en "minutos restantes"). */
const DURATIONS = [0, 15, 30, 45, 60, 90];

/** Bottom-sheet MOBILE de creación de tarea.
 *
 *  NO es un port de `TaskEditor.tsx`: ese es el modal de escritorio (`.btn` de
 *  ~26px de alto, la mitad del mínimo táctil de 44px del handoff, y campos
 *  pensados para mouse). Acá todo control mide ≥44px y los `input` van en 16px
 *  (con menos, Android hace zoom al enfocar).
 *
 *  Mutación por `useCreateTask` ⇒ patrón OUTBOX intacto (`repo.createTask` hace
 *  el INSERT + el registro en `outbox`).
 *
 *  Alcance deliberadamente chico ("lo mínimo para crear una tarea bien"):
 *    · TODO(1c · decide el usuario): sin recurrencia, sin hábito, sin subtareas,
 *      sin prioridad, sin proyecto. Eso se sigue haciendo desde escritorio; el
 *      diseño mobile no muestra ninguno de esos controles y no se inventan.
 *      `priority` queda en "med" (el mismo default del editor de escritorio).
 */
export function TaskSheet({ day: initialDay, onClose }: { day?: string; onClose: () => void }) {
  const createTask = useCreateTask();
  const categories = (useCategories().data ?? []).filter((c) => !c.archived);

  const [title, setTitle] = useState("");
  const [day, setDay] = useState(initialDay ?? todayYmd());
  const [duration, setDuration] = useState(30);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
    setSaving(true);
    setError(null);
    try {
      await createTask.mutateAsync({
        title: t,
        projectId: null,
        categoryId,
        priority: "med",
        duration,
        day,
        due: null,
        recurring: false,
        recurrence: null,
        recurrenceParentId: null,
        notes: "",
        subtasks: [],
      });
      onClose();
    } catch (err) {
      setSaving(false);
      setError(err instanceof Error ? err.message : "No se pudo crear la tarea.");
    }
  };

  return (
    <div className="m-sheet-backdrop" onClick={onClose}>
      <div className="m-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="m-sheet-head">
          <span>Nueva tarea</span>
          <button className="m-sheet-close" type="button" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div className="m-plan-form">
          {error && <div className="m-plan-error">{error}</div>}

          <div className="m-plan-field">
            <label className="m-plan-field-label" htmlFor="m-task-title">
              Título
            </label>
            <input
              id="m-task-title"
              className="m-plan-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Estudiar danés"
              autoComplete="off"
            />
          </div>

          <div className="m-plan-field">
            <label className="m-plan-field-label" htmlFor="m-task-day">
              Día
            </label>
            <input
              id="m-task-day"
              className="m-plan-input"
              type="date"
              value={day}
              onChange={(e) => setDay(e.target.value)}
            />
          </div>

          <div className="m-plan-field">
            <span className="m-plan-field-label">Duración</span>
            <div className="m-plan-chips">
              {DURATIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`m-plan-chip${duration === d ? " is-active" : ""}`}
                  onClick={() => setDuration(d)}
                >
                  {d === 0 ? "sin estimar" : `${d} min`}
                </button>
              ))}
            </div>
          </div>

          {categories.length > 0 && (
            <div className="m-plan-field">
              <span className="m-plan-field-label">Categoría</span>
              <div className="m-plan-chips">
                <button
                  type="button"
                  className={`m-plan-chip${categoryId === null ? " is-active" : ""}`}
                  onClick={() => setCategoryId(null)}
                >
                  sin categoría
                </button>
                {categories.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`m-plan-chip${categoryId === c.id ? " is-active" : ""}`}
                    onClick={() => setCategoryId(c.id)}
                  >
                    <span className="m-plan-chip-dot" style={{ background: colorsForHue(c.hue).bg }} />
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}

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
              Crear
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
