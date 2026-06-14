import { useCallback, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Schedule } from "@tauri-apps/plugin-notification";
import { useEvents } from "./queries";
import { fromYmd } from "./date";

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

  const schedule = useCallback(async () => {
    const isAndroid = /android/i.test(navigator.userAgent);
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

    if (isAndroid) {
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
