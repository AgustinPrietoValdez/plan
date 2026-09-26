import { useCallback, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Schedule } from "@tauri-apps/plugin-notification";
import { useEvents } from "./queries";
import { fromYmd, todayYmd, ymd, addDays, MONTH_SHORT_ES } from "./date";
import { useApp, type MobileRoute } from "./store";

/** Permiso real (Android WebView miente con window.Notification). */
async function realIsPermissionGranted(): Promise<boolean> {
  const v = await invoke<boolean | null>("plugin:notification|is_permission_granted");
  return v === true;
}

// Rango de IDs reservado para notificaciones de EVENTOS. Compras usa 1..999
// (ver useComprasNotifications). Eventos usan 1000..(1000+MAX-1) y solo
// cancelamos ESE rango, asi los dos sistemas no se pisan.
const EVENT_ID_BASE = 1000;
const EVENT_ID_MAX = 4000; // hasta 3000 eventos futuros programados

const isAndroid = () => /android/i.test(navigator.userAgent);

// ─── Widget de pantalla de inicio: "próximo evento" ──────────────────────────
//
// El widget corre en el proceso del LAUNCHER: no hay webview, ni React, ni
// TanStack Query, ni lectura razonable de calendar.db (WAL, un solo escritor).
// Así que el próximo evento lo calcula ACÁ y se le deja escrito un snapshot:
//   snapshot -> invoke("update_widget_snapshot")
//            -> lib.rs -> JNI -> MainActivity.updateWidgetSnapshot
//            -> NextEventWidget.writeSnapshot (SharedPreferences) + repintar
// El widget solo PINTA: no conoce el esquema ni calcula nada.

interface WidgetSnapshot {
  hasEvent: boolean;
  eventId?: string;
  title?: string;
  /** "Hoy" | "Mañana" | "22 ago" — ya formateado; Kotlin no localiza nada. */
  dayLabel?: string;
  /** "14:30" */
  timeLabel?: string;
  location?: string;
  /** epoch ms del inicio; el widget solo lo usa para el "falta N". */
  startMs?: number;
}

function dayLabelFor(day: string): string {
  const today = todayYmd();
  if (day === today) return "Hoy";
  if (day === ymd(addDays(fromYmd(today), 1))) return "Mañana";
  const d = fromYmd(day);
  return `${d.getDate()} ${MONTH_SHORT_ES[d.getMonth()]}`;
}

/** Empuja a nativo el próximo evento (o el estado vacío). Solo Android. */
async function pushWidgetSnapshot(snapshot: WidgetSnapshot) {
  if (!isAndroid()) return;
  try {
    await invoke("update_widget_snapshot", { payload: JSON.stringify(snapshot) });
  } catch {
    /* el widget no es crítico: si falla, se repinta en el próximo push */
  }
}

// ─── Tap del widget -> ruta de la app ────────────────────────────────────────
//
// Modelo PULL: Kotlin deja la ruta pendiente en MainActivity y el frontend la
// retira. No hay push porque no existe un AppHandle global desde el que Kotlin
// pueda emitir un evento Tauri.
//
// Preguntamos al montar (app abierta desde cero por el tap) y cada vez que la
// ventana vuelve al foco (app YA abierta que Android trajo al frente por
// onNewIntent, sin remontar nada).

/** Retira la ruta pendiente de nativo y la empuja al store. */
async function drainPendingNativeRoute() {
  if (!isAndroid()) return;
  let raw = "";
  try {
    raw = (await invoke<string>("take_pending_mobile_route")) ?? "";
  } catch {
    return;
  }
  if (!raw) return;
  let route: MobileRoute;
  try {
    const parsed = JSON.parse(raw) as Partial<MobileRoute>;
    if (!parsed || parsed.tab == null) return;
    route = { tab: parsed.tab, ...(parsed.openEventId ? { openEventId: parsed.openEventId } : {}) };
  } catch {
    return;
  }
  // PUNTO DE ENTRADA ÚNICO documentado en lib/store.ts. La shell mueve el tab;
  // si la ruta trae `openEventId` queda PARQUEADA para la pantalla destino.
  //
  // TODO(1c): la pantalla de detalle de evento en mobile TODAVÍA NO EXISTE.
  // Hasta que exista, un tap sobre un evento abre el tab Plan y la ruta queda
  // parqueada en el store sin que nadie la consuma. El widget ya entrega el
  // `eventId` correcto: falta que 1c lea `pendingMobileRoute`, abra el evento y
  // llame `consumeMobileRoute()`.
  useApp.getState().requestMobileRoute(route);
}

/** Escucha los taps del widget de Android. Se monta junto con las
 *  notificaciones de eventos para no tocar la shell (es de otro agente). */
function useAndroidWidgetRoute() {
  useEffect(() => {
    if (!isAndroid()) return;
    void drainPendingNativeRoute();
    const onWake = () => {
      if (document.visibilityState === "visible") void drainPendingNativeRoute();
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    return () => {
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, []);
}

/** Programa una notificacion local del SO por cada evento futuro con hora y
 *  notifyMinutesBefore. Funciona en desktop (Windows) y, cuando el firing
 *  nativo este, en Android. On-demand: corre solo cuando cambia la data. */
export function useEventNotifications() {
  const eventsQ = useEvents();
  const events = eventsQ.data;

  // Solo eventos con dia + hora de inicio + aviso configurado.
  const timed = useMemo(
    () =>
      (events ?? []).filter(
        (e) => e.startTime && e.notifyMinutesBefore != null && !e.deletedAt,
      ),
    [events],
  );

  // Clave estable: re-programar solo si cambia algo relevante (no en cada sync).
  const configKey = useMemo(
    () =>
      JSON.stringify(
        timed
          .map((e) => ({ i: e.id, d: e.day, t: e.startTime, n: e.notifyMinutesBefore, ti: e.title }))
          .sort((a, b) => a.i.localeCompare(b.i)),
      ),
    [timed],
  );

  // ── Snapshot del widget ────────────────────────────────────────────────
  //
  // OJO: el widget NO usa `timed`. `timed` exige `notifyMinutesBefore != null`
  // porque son los eventos que llevan notificación; un evento SIN aviso sigue
  // siendo el próximo evento y el widget lo tiene que mostrar.
  //
  // DECISIÓN DE IMPLEMENTACIÓN (pendiente de confirmar con el usuario): entran
  // solo eventos CON hora de inicio. Los de día completo (startTime == null) no
  // tienen hora que mostrar, y el widget muestra hora. Si el usuario los quiere,
  // hay que definir cómo se pintan y cómo compiten con un evento con hora.
  const nextEvent = useMemo(() => {
    const now = Date.now();
    let best: { e: (typeof timed)[number]; ms: number } | null = null;
    for (const e of events ?? []) {
      if (e.deletedAt || !e.startTime) continue;
      const [h, m] = e.startTime.split(":").map(Number);
      if (!Number.isFinite(h) || !Number.isFinite(m)) continue;
      const d = fromYmd(e.day);
      d.setHours(h, m, 0, 0);
      const ms = d.getTime();
      if (ms <= now) continue;
      if (!best || ms < best.ms) best = { e, ms };
    }
    return best;
  }, [events]);

  const snapshot = useMemo<WidgetSnapshot>(() => {
    if (!nextEvent) return { hasEvent: false };
    const { e, ms } = nextEvent;
    return {
      hasEvent: true,
      eventId: e.id,
      title: e.title || "Evento",
      dayLabel: dayLabelFor(e.day),
      timeLabel: e.startTime ?? "",
      location: e.location ?? "",
      startMs: ms,
    };
  }, [nextEvent]);

  const snapshotKey = useMemo(() => JSON.stringify(snapshot), [snapshot]);

  // Se empuja apenas cambia (y en el primer render con datos). No depende del
  // permiso de notificaciones: el widget no postea nada.
  useEffect(() => {
    if (!eventsQ.isSuccess) return;
    void pushWidgetSnapshot(JSON.parse(snapshotKey) as WidgetSnapshot);
  }, [snapshotKey, eventsQ.isSuccess]);

  useAndroidWidgetRoute();

  const schedule = useCallback(async () => {
    const now = Date.now();

    // Calcular trigger de cada evento futuro con hora.
    const due: { id: string; when: number; title: string; body: string }[] = [];
    for (const e of timed) {
      if (!e.startTime) continue;
      const [h, m] = e.startTime.split(":").map(Number);
      if (!Number.isFinite(h) || !Number.isFinite(m)) continue;
      const when = fromYmd(e.day);
      when.setHours(h, m, 0, 0);
      when.setMinutes(when.getMinutes() - (e.notifyMinutesBefore ?? 0));
      if (when.getTime() <= now) continue; // ya paso
      const lead = e.notifyMinutesBefore ?? 0;
      const body =
        lead > 0
          ? `${e.title} en ${lead} min${e.location ? ` · ${e.location}` : ""}`
          : `${e.title}${e.location ? ` · ${e.location}` : ""}`;
      due.push({ id: e.id, when: when.getTime(), title: e.title || "Evento", body });
    }

    if (isAndroid()) {
      // Android: AlarmManager exacto nativo (el plugin Tauri es inexacto en Doze).
      // Trackeamos los ids programados en localStorage para cancelar los borrados.
      const KEY = "eventNotifIds";
      let prev: string[] = [];
      try { prev = JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { prev = []; }
      const current = new Set(due.map((d) => d.id));
      // cancelar los que ya no estan
      for (const oldId of prev) {
        if (!current.has(oldId)) {
          try { await invoke("cancel_event_notification", { id: oldId }); } catch { /* noop */ }
        }
      }
      // programar/actualizar los actuales (FLAG_UPDATE_CURRENT sobreescribe)
      for (const d of due) {
        try {
          await invoke("schedule_event_notification", {
            payload: JSON.stringify({ id: d.id, triggerMs: d.when, title: d.title, body: d.body }),
          });
        } catch { /* noop */ }
      }
      try { localStorage.setItem(KEY, JSON.stringify([...current])); } catch { /* noop */ }
      return;
    }

    // Desktop (Windows): plugin de notificaciones. Limpiar SOLO el rango de
    // eventos y reprogramar. Mismo workaround que compras: invocar el comando
    // Rust y limpiar claves nulas del objeto Schedule.
    const eventIds = Array.from({ length: EVENT_ID_MAX - EVENT_ID_BASE }, (_, i) => EVENT_ID_BASE + i);
    try {
      await invoke("plugin:notification|cancel", { notifications: eventIds });
    } catch {
      /* best-effort */
    }
    const scheduleNotification = (options: {
      id: number;
      title: string;
      body: string;
      schedule: ReturnType<typeof Schedule.at>;
    }) => {
      const raw = options.schedule as unknown as Record<string, unknown>;
      const cleanSchedule = Object.fromEntries(
        Object.entries(raw).filter(([, v]) => v != null),
      );
      return invoke("plugin:notification|notify", {
        options: { ...options, schedule: cleanSchedule },
      });
    };
    const pending: Promise<unknown>[] = [];
    let id = EVENT_ID_BASE;
    for (const d of due) {
      if (id >= EVENT_ID_MAX) break;
      pending.push(
        scheduleNotification({
          id: id++,
          title: "Evento",
          body: d.body,
          schedule: Schedule.at(new Date(d.when), false, true),
        }),
      );
    }
    await Promise.all(pending);
  }, [timed]);

  useEffect(() => {
    if (!eventsQ.isSuccess) return;
    let cancelled = false;
    void (async () => {
      try {
        const granted = await realIsPermissionGranted();
        if (cancelled || !granted) return;
        await schedule();
      } catch (e) {
        console.error("event notifications check failed:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
    // configKey colapsa el churn de identidad de arrays en un string estable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configKey, eventsQ.isSuccess]);
}
