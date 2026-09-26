import { useEffect, useImperativeHandle, useMemo, useState, type CSSProperties } from "react";
import { ICheck } from "../icons";
import { signOut } from "../../lib/auth";
import { colorsForHue } from "../../lib/categoryColor";
import { categoryFor } from "../../lib/categoryFor";
import { DOW_LONG_ES, MONTH_SHORT_ES, fromYmd } from "../../lib/date";
import { useCategories, useEvents, useProjects, useTasks } from "../../lib/queries";
import { useApp } from "../../lib/store";
import { useToday } from "../../lib/useToday";
import { EventSheet, type EventSheetMode } from "./EventSheet";
import { TaskSheet } from "./TaskSheet";
import type { CalendarEvent, Category, Project, Task } from "../../types";
import type { MobileScreenProps } from "./shell";

/* ════════════════════════════════════════════════════════════════════════════
   ROLL-FORWARD EN MOBILE — DECIDIDO: SÍ (usuario, 2026-08-16)

   El teléfono va a correr los hooks de mantenimiento
   (`useRollForwardRecurringTasks` y compañía), o sea que ESCRIBE. Los monta la
   SHELL en `MobileApp.tsx` — 1c no toca ese archivo y no los monta por su
   cuenta.

   Qué asume esta pantalla en consecuencia: que las tareas de hoy ya están
   materializadas. Por eso acá NO hay ningún workaround defensivo para el caso
   "la lista sale vacía porque las recurrentes no rodaron": lista vacía = no hay
   tareas hoy, y punto.

   ⚠ Riesgo que trae la decisión (reportado, NO se mitiga desde acá): el guard de
   idempotencia de `rollForward.ts` y el de `useCompleteTask` leen `siblings` del
   SQLite LOCAL. Si escritorio y celular ruedan el mismo día antes de que el
   create del otro haya bajado por sync, los dos pasan el guard y crean DOS filas
   con el mismo `recurrenceParentId` y el mismo `day` (ids distintos ⇒ el sync
   las merge a las dos; no hay UNIQUE en la tabla). Esta vista las mostraría como
   dos filas idénticas y el pill contaría de más. NO se deduplica acá a propósito:
   sería tapar un bug de datos en la capa de presentación.
   ════════════════════════════════════════════════════════════════════════════ */

/* ────────────────────────────────────────────────────────────────────────────
   REGLAS DE LA PANTALLA — todo lo que el diseño NO dejó cerrado vive acá.

   Cada valor está elegido con el criterio "lo más conservador y coherente con
   el escritorio". Están juntos a propósito: cambiar cualquiera de estas
   decisiones es tocar UNA línea, no salir a buscar la regla por el archivo.
   ──────────────────────────────────────────────────────────────────────────── */
const PLAN_RULES = {
  /** ¿Entran las atrasadas no-hábito (lo que hace `plan_cli.py show --today`)?
   *  NO por ahora: `HomeView` — la vista equivalente de escritorio — muestra
   *  exactamente `day === hoy`, y el diseño de 1c no tiene ninguna marca visual
   *  para distinguir una atrasada. Sumarlas sin marca sería mentir sobre el día.
   *  TODO(1c · decide el usuario): si se activa, hay que definir esa marca. */
  INCLUDE_OVERDUE: false,

  /** Los hábitos SÍ aparecen en la lista (el meta "hábito" está en la spec), así
   *  que cuentan en el pill: el pill es exactamente el conjunto de la lista (el
   *  screenshot muestra 1/3 con 3 tareas ⇒ solo tareas, sin eventos).
   *  En "minutos restantes" suman su `duration`, que en un hábito suele ser 0 —
   *  o sea que no distorsionan el número sin necesidad de una regla aparte.
   *  TODO(1c · decide el usuario): confirmar. */
  HABITS_IN_COUNT: true,

  /** Ventana de "evento por empezar", en minutos. El handoff sugiere ~60.
   *  La alternativa sería el `notifyMinutesBefore` de cada evento (que es
   *  nullable), pero eso haría que el anillo midiera cosas distintas según el
   *  evento. TODO(1c · decide el usuario). */
  UPCOMING_WINDOW_MIN: 60,

  /** ¿La card sigue visible con el evento YA empezado y sin terminar?
   *  NO: el handoff no da copia para ese estado ("en 25 min" deja de aplicar) y
   *  el anillo, que mide la ventana PREVIA, quedaría al 100% fijo. Inventar
   *  ambas cosas es diseñar. TODO(1c · decide el usuario). */
  SHOW_ALREADY_STARTED: false,

  /** Tap en una tarea YA hecha. "noop" = igual que el escritorio, donde la fila
   *  deshabilita el check cuando está hecha (`onClick={done ? undefined : …}`).
   *  Destildar no existe como acción en ningún lado del codebase.
   *  TODO(1c · decide el usuario). */
  TAP_ON_DONE: "noop" as "noop" | "complete",

  /** Copia del estado vacío. La misma que usa `HomeView` para su sección de hoy
   *  ("Sin tareas para hoy"), para no tener dos textos para lo mismo.
   *  TODO(1c · decide el usuario). */
  EMPTY_COPY: "Sin tareas para hoy",
};

/** "Ahora" reactivo, con tick por minuto ALINEADO al `:00` (no un intervalo de
 *  60s desde el montaje, que iría derivando y mostraría el reloj desfasado).
 *  Se detiene con `document.hidden` — un timer corriendo con la app en segundo
 *  plano solo gasta batería — y se re-sincroniza al volver.
 *
 *  Vive acá y no en `lib/`: es el único consumidor por ahora, y `lib/` es
 *  superficie compartida con los otros agentes en vuelo. Si 1h/Café también lo
 *  necesita, se promueve a `src/lib/useNow.ts` en ese momento.
 *
 *  StrictMode (dev) monta el efecto dos veces: el cleanup cancela el timeout, no
 *  quedan dos cadenas vivas. */
function useMinuteNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: number | undefined;
    const stop = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = undefined;
    };
    const schedule = () => {
      stop();
      // +250ms de margen para caer del lado de adentro del minuto nuevo.
      const ms = 60_000 - (Date.now() % 60_000) + 250;
      timer = window.setTimeout(() => {
        setNow(new Date());
        schedule();
      }, ms);
    };
    const sync = () => {
      stop();
      if (document.hidden) return;
      setNow(new Date());
      schedule();
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("focus", sync);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("focus", sync);
    };
  }, []);
  return now;
}

const hhmm = (d: Date) =>
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/** Minutos desde medianoche de un "HH:MM". */
function minutesOfDay(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/** El evento del día que está por empezar, o null. Función pura para poder
 *  razonarla (y testearla) sin React. Si hay más de uno dentro de la ventana,
 *  gana el más próximo. */
function upcomingEvent(events: CalendarEvent[], today: string, now: Date): CalendarEvent | null {
  const nowMin = now.getHours() * 60 + now.getMinutes();
  let best: CalendarEvent | null = null;
  let bestDelta = Infinity;
  for (const e of events) {
    if (e.day !== today) continue;
    // "Todo el día" no es un flag del modelo: son los eventos con `startTime`
    // en null. Nunca "empiezan", así que quedan fuera del criterio.
    if (!e.startTime) continue;
    const delta = minutesOfDay(e.startTime) - nowMin;
    if (delta < 0 && !PLAN_RULES.SHOW_ALREADY_STARTED) continue;
    if (delta < 0 || delta > PLAN_RULES.UPCOMING_WINDOW_MIN) continue;
    if (delta < bestDelta) {
      best = e;
      bestDelta = delta;
    }
  }
  return best;
}

export function PlanDelDiaView({ ref }: MobileScreenProps) {
  const today = useToday();
  const now = useMinuteNow();

  const openCompletion = useApp((s) => s.openCompletion);
  const completingTaskId = useApp((s) => s.completingTaskId);
  const pendingRoute = useApp((s) => s.pendingMobileRoute);
  const consumeMobileRoute = useApp((s) => s.consumeMobileRoute);

  const tasksQ = useTasks();
  const eventsQ = useEvents();
  const categoriesQ = useCategories();
  const projectsQ = useProjects();

  // ── sheets propios de 1c ────────────────────────────────────────────────
  // El FAB de la nav abre un menú corto Tarea / Evento (decisión del usuario) y
  // de ahí al bottom-sheet mobile correspondiente. NO se usa `openCreate` /
  // `openEventCreate` del store: eso abre los editores de ESCRITORIO montados
  // por `MobileModalHost`, que es justamente lo que estos sheets reemplazan.
  const [menuOpen, setMenuOpen] = useState(false);
  const [taskSheetOpen, setTaskSheetOpen] = useState(false);
  const [eventSheet, setEventSheet] = useState<EventSheetMode | null>(null);
  useImperativeHandle(ref, () => ({ onFab: () => setMenuOpen(true) }), []);

  // ── ruta externa (widget de Android) ────────────────────────────────────
  // La shell deja parqueada la ruta con `openEventId` y no elige destino: el
  // destino DENTRO del tab lo resuelve esta pantalla. Abrimos ese evento en el
  // mismo sheet de evento, en modo edición, y consumimos la ruta.
  useEffect(() => {
    const id = pendingRoute?.openEventId;
    if (!id) return;
    setMenuOpen(false);
    setTaskSheetOpen(false);
    setEventSheet({ kind: "edit", eventId: id });
    consumeMobileRoute();
  }, [pendingRoute, consumeMobileRoute]);

  // ── refresco al volver a la app ─────────────────────────────────────────
  // El `QueryClient` global va con `staleTime: 60s` y `refetchOnWindowFocus:
  // false` (main.tsx), así que esta pantalla NO se refresca sola al volver del
  // segundo plano: un evento creado en escritorio hace 10 segundos puede no
  // verse. Para 1c, que es lo primero que se mira al abrir el teléfono, eso no
  // sirve. Se refetchean solo las dos queries de esta vista (no se toca la
  // config global, que es compartida con el escritorio).
  const refetchTasks = tasksQ.refetch;
  const refetchEvents = eventsQ.refetch;
  useEffect(() => {
    const sync = () => {
      if (document.hidden) return;
      void refetchTasks();
      void refetchEvents();
    };
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("focus", sync);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("focus", sync);
    };
  }, [refetchTasks, refetchEvents]);

  // ── datos derivados ─────────────────────────────────────────────────────
  const tasks: Task[] = useMemo(() => tasksQ.data ?? [], [tasksQ.data]);
  const categories: Category[] = useMemo(() => categoriesQ.data ?? [], [categoriesQ.data]);
  const projects: Project[] = useMemo(() => projectsQ.data ?? [], [projectsQ.data]);

  // `repo.listTasks()` ya filtra `deleted_at IS NULL`, no hace falta repetirlo.
  // Pendientes primero y hechas después, igual que `HomeView`.
  const dayTasks = useMemo(() => {
    const belongs = (t: Task) => {
      if (t.day === today) return true;
      if (!PLAN_RULES.INCLUDE_OVERDUE) return false;
      // Mismo criterio que `isNotFinished` (lib/taskState.ts): los hábitos NO se
      // atrasan (un día no hecho lapsa) y las que todavía tienen regla de
      // recurrencia las levanta el roll-forward.
      return !t.done && !t.isHabit && !t.recurrence && !!t.day && t.day < today;
    };
    const mine = tasks.filter(belongs).filter((t) => PLAN_RULES.HABITS_IN_COUNT || !t.isHabit);
    return [...mine.filter((t) => !t.done), ...mine.filter((t) => t.done)];
  }, [tasks, today]);

  const doneCount = dayTasks.filter((t) => t.done).length;
  const minutesLeft = dayTasks.reduce((s, t) => (t.done ? s : s + t.duration), 0);

  const event = useMemo(
    () => upcomingEvent(eventsQ.data ?? [], today, now),
    [eventsQ.data, today, now],
  );

  // ── encabezado ──────────────────────────────────────────────────────────
  const todayDate = fromYmd(today);
  // No hay array de día corto en español en `lib/date.ts`; "Sáb" sale de
  // recortar el largo (el CSS lo pasa a mayúsculas).
  const eyebrow = `${DOW_LONG_ES[todayDate.getDay()].slice(0, 3)} ${todayDate.getDate()} ${
    MONTH_SHORT_ES[todayDate.getMonth()]
  } · ${hhmm(now)}`;

  const onTaskTap = (t: Task) => {
    if (t.done && PLAN_RULES.TAP_ON_DONE === "noop") return;
    openCompletion(t.id);
  };

  return (
    <div className="m-screen">
      {/* Sin header fijo (el handoff lo pide explícito) ⇒ el scroller carga la
          safe-area de arriba con `.m-scroll--top-safe`. */}
      <div className="m-scroll m-scroll--top-safe">
        {/* 1 · fila de encabezado */}
        <div className="m-plan-head">
          <div className="m-plan-head-titles">
            <div className="m-plan-eyebrow">{eyebrow}</div>
            <h1 className="m-plan-title">{event ? "Ya casi empieza" : "Tareas de hoy"}</h1>
          </div>
          <span className="m-plan-count">
            {doneCount}/{dayTasks.length}
          </span>
        </div>

        {/* 2 · card oscura del evento por empezar */}
        {event && <UpcomingEventCard event={event} now={now} onOpen={() => setEventSheet({ kind: "edit", eventId: event.id })} />}

        {/* 3 · label de sección + minutos restantes */}
        <div className="m-plan-sec">
          <span className="m-label">Tareas de hoy</span>
          {minutesLeft > 0 && <span className="m-plan-sec-meta">{minutesLeft} min restantes</span>}
        </div>

        {/* 4 · lista de tareas */}
        {dayTasks.length === 0 ? (
          <p className="m-empty">{PLAN_RULES.EMPTY_COPY}</p>
        ) : (
          <div className="m-plan-tasks">
            {dayTasks.map((t) => {
              const cat = categoryFor(t, categories, projects);
              return (
                <TaskRow
                  key={t.id}
                  task={t}
                  dotColor={cat ? colorsForHue(cat.hue).bg : "var(--fg-subtle)"}
                  busy={completingTaskId === t.id}
                  onTap={() => onTaskTap(t)}
                />
              );
            })}
          </div>
        )}

        {/* TODO(P3 · decide el usuario): "Salir" perdió su lugar cuando se borró
            el header global y ningún header del diseño lo tiene. Lo dejó acá la
            shell, provisorio, para no dejar la app sin logout. 1c lo MANTIENE
            funcionando donde está; no lo rediseña ni lo mueve. */}
        <button className="m-signout-provisional" type="button" onClick={() => void signOut()}>
          Salir (provisorio · P3)
        </button>

        <div className="m-scroll-tail" />
      </div>

      {/* Overlays: hermanos de `.m-scroll`, DENTRO de `.m-screen` (contrato §5). */}
      {menuOpen && (
        <div className="m-sheet-backdrop" onClick={() => setMenuOpen(false)}>
          <div className="m-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="m-sheet-head">
              <span>¿Qué querés crear?</span>
              <button
                className="m-sheet-close"
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>
            <div className="m-plan-menu">
              <button
                className="m-plan-menu-btn"
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setTaskSheetOpen(true);
                }}
              >
                <span className="m-plan-menu-emoji">✅</span>
                <div>
                  <div className="m-plan-menu-name">Tarea</div>
                  <div className="m-plan-menu-sub">Algo para hacer hoy</div>
                </div>
              </button>
              <button
                className="m-plan-menu-btn"
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setEventSheet({ kind: "create", day: today });
                }}
              >
                <span className="m-plan-menu-emoji">📅</span>
                <div>
                  <div className="m-plan-menu-name">Evento</div>
                  <div className="m-plan-menu-sub">Algo con hora</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {taskSheetOpen && <TaskSheet day={today} onClose={() => setTaskSheetOpen(false)} />}
      {eventSheet && <EventSheet mode={eventSheet} onClose={() => setEventSheet(null)} />}
    </div>
  );
}

/** Card oscura del evento por empezar. El anillo representa el tiempo YA
 *  transcurrido de la ventana de `PLAN_RULES.UPCOMING_WINDOW_MIN`. */
function UpcomingEventCard({
  event,
  now,
  onOpen,
}: {
  event: CalendarEvent;
  now: Date;
  onOpen: () => void;
}) {
  const start = event.startTime ?? "00:00";
  const minsUntil = Math.max(0, minutesOfDay(start) - (now.getHours() * 60 + now.getMinutes()));
  const pct = Math.min(
    100,
    Math.max(0, ((PLAN_RULES.UPCOMING_WINDOW_MIN - minsUntil) / PLAN_RULES.UPCOMING_WINDOW_MIN) * 100),
  );

  // Meta: SOLO lo que existe en el modelo. El "con Sofi" del diseño no tiene
  // fuente — `CalendarEvent` no tiene invitados/attendees — y no se inventa.
  // La duración solo se puede calcular con `endTime`, que es nullable.
  const metaParts: string[] = [];
  if (event.location.trim()) metaParts.push(event.location.trim());
  if (event.startTime && event.endTime) {
    const mins = minutesOfDay(event.endTime) - minutesOfDay(event.startTime);
    if (mins > 0) metaParts.push(`${mins} min`);
  }

  return (
    <div className="m-ev" style={{ "--m-ev-pct": `${pct}%` } as CSSProperties}>
      <div className="m-ev-top">
        <span className="m-ev-dot" />
        <span className="m-ev-label">Evento por empezar</span>
        <span className="m-ev-countdown">{minsUntil >= 1 ? `en ${minsUntil} min` : "ahora"}</span>
      </div>

      <div className="m-ev-mid">
        <div className="m-ev-ring">
          <div className="m-ev-ring-inner">
            <div>
              <div className="m-ev-time">{start}</div>
              <div className="m-ev-time-label">empieza</div>
            </div>
          </div>
        </div>
        <div className="m-ev-info">
          <h2 className="m-ev-title">{event.title}</h2>
          {metaParts.length > 0 && <div className="m-ev-meta">{metaParts.join(" · ")}</div>}
        </div>
      </div>

      <div className="m-ev-actions">
        <button className="m-ev-cta" type="button" onClick={onOpen}>
          Abrir el evento
        </button>
        {/* TODO(1c · decide el usuario): el ⏰ es "snooze / recordar" y NO existe
            en el modelo — no hay campo, ni mutación, ni forma de reprogramar UNA
            notificación puntual (`useEventNotifications` reprograma todo desde
            los datos; tocar `notifyMinutesBefore` cambiaría el aviso para
            siempre y se sincronizaría a todos los dispositivos). Queda INERTE:
            se dibuja para no romper la composición de la card, pero no hace
            nada hasta que el usuario defina qué tiene que hacer. */}
        <button className="m-ev-snooze" type="button" disabled aria-label="Posponer (pendiente de definir)">
          ⏰
        </button>
      </div>
    </div>
  );
}

function TaskRow({
  task,
  dotColor,
  busy,
  onTap,
}: {
  task: Task;
  dotColor: string;
  busy: boolean;
  onTap: () => void;
}) {
  const done = task.done;
  const meta = done ? "hecho" : task.isHabit ? "hábito" : task.duration > 0 ? `${task.duration} min` : "";
  return (
    <button
      type="button"
      className={`m-task${done ? " is-done" : ""}${busy ? " is-busy" : ""}`}
      onClick={onTap}
    >
      <span className={`m-task-box${done ? " is-done" : ""}`}>
        {done && <ICheck size={13} stroke={2.6} />}
      </span>
      <span className="m-task-dot" style={{ background: dotColor }} />
      <span className={`m-task-title${done ? " is-done" : ""}`}>{task.title}</span>
      {meta && <span className="m-task-meta">{meta}</span>}
    </button>
  );
}
