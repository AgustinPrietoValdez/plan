import { useCallback, useEffect, useRef, useState } from "react";
import {
  bleConnect, bleDisconnect, subscribeToScale, unsubscribeFromScale,
  kettleConnect, kettleDisconnect, subscribeToKettle, unsubscribeFromKettle, sendKettleTemp,
  scanForScales,
  type BleDevice, type ScaleData, type KettleData,
} from "../../lib/ble";
import { daysOld, freshnessStatus } from "../../lib/coffeeFreshness";
import { todayYmd, ymd } from "../../lib/date";
import type { BrewSession, CoffeeBean, CoffeeRecipe, CoffeeTweak } from "../../types";

/* ═══════════════════════════════════════════════════════════════════════════
   CONTRATO DEL FLUJO DE CAFÉ (mobile) — lo mantiene el agente de 1i.
   1g y 1h programan contra esto; el detalle largo está arriba de
   `CafeMobileView.tsx`. Acá van los tipos, las constantes y las derivaciones
   compartidas + el ÚNICO dueño del BLE (`useCafeDevices`).
   ═══════════════════════════════════════════════════════════════════════════ */

// ── constantes de diseño (un solo lugar) ─────────────────────────────────────

/** Stepper de dosis del handoff 1i: paso 0,5 g, rango 8–40 g. */
export const DOSE_STEP = 0.5;
export const DOSE_MIN = 8;
export const DOSE_MAX = 40;
/** Denominador del anillo de dosis (`dosis / 30 g`, handoff 1i). */
export const DOSE_RING_MAX = 30;

/** Dosis inicial cuando el grano no tiene `lastTweak`. Es el valor del
 *  prototipo (15,5 g). TODO(usuario): no está definido en el handoff. */
export const DEFAULT_DOSE_G = 15.5;

/** Denominador del anillo "tazas del día" del encabezado de 1i.
 *  TODO(usuario): NO existe como concepto en el modelo (no hay meta diaria).
 *  4 es el número del prototipo; vive acá para cambiarlo en un solo lugar. */
export const CUPS_GOAL_PER_DAY = 4;

/** Días de descanso que llenan el anillo de frescura al 100 %.
 *  42 = el techo de `in-range` en `coffeeFreshness.ts`; reproduce los % del
 *  prototipo. TODO(usuario): el handoff no define qué mide este anillo (en el
 *  desktop el anillo del `BeanTile` mide bolsa restante, que es otra cosa). */
export const FRESHNESS_RING_DAYS = 42;

/** Umbral de `too-fresh` en `coffeeFreshness.ts`: días hasta "en rango". */
const REST_DAYS = 21;

/** Gramos sobre la balanza a partir de los cuales se considera que el brew "ya
 *  tenía agua" — el único criterio para decidir qué hacer si la balanza se cae
 *  (se apaga / se desconecta) a mitad de brew. Decisión del usuario:
 *
 *   · pico de peso ≥ este umbral ⇒ hay café mojado: **el brew sigue** (timer y
 *     avance de pasos por tiempo no se cortan) pero la sesión se DESCARTA — la
 *     telemetría quedó incompleta, así que no se escriben `BrewSession` ni
 *     datapoints. Ver `BrewView.tsx`.
 *   · por debajo ⇒ no hay nada que perder: se vuelve a la pantalla de conexión.
 *
 *  20 g ≈ un chorrito real sobre el café (el bloom típico de 15 g de dosis son
 *  30-45 g). Por debajo de eso lo que hubo fue un toque en la balanza, una tara
 *  mal hecha o el "Tara + Start" manual sin haber vertido todavía: ahí volver
 *  atrás no le cuesta nada al usuario. Se mide contra el PICO de peso visto, no
 *  contra la última lectura: al desconectarse, `scaleData` pasa a `null` y el
 *  peso en pantalla cae a 0. */
export const BREW_HAS_WATER_G = 20;

// ── derivaciones puras ───────────────────────────────────────────────────────

export function snapDose(g: number): number {
  const snapped = Math.round(g / DOSE_STEP) * DOSE_STEP;
  return Math.min(DOSE_MAX, Math.max(DOSE_MIN, Math.round(snapped * 10) / 10));
}

/** % del anillo de frescura de la card de grano (0–100). */
export function freshnessPct(roastedOn: string | null): number {
  const d = daysOld(roastedOn);
  if (d == null || d < 0) return 0;
  return Math.min(100, (d / FRESHNESS_RING_DAYS) * 100);
}

/** Tazas de hoy = sesiones de brew creadas hoy.
 *  `createdAt` es ISO **UTC**: se convierte a fecha LOCAL antes de comparar
 *  (un `slice(0,10)` cuenta mal los brews de la noche). */
export function cupsToday(sessions: BrewSession[]): number {
  const today = todayYmd();
  return sessions.filter((s) => {
    if (s.deletedAt) return false;
    const d = new Date(s.createdAt);
    return !Number.isNaN(d.getTime()) && ymd(d) === today;
  }).length;
}

/** Receta específica (ajustada por la AI) para ese grano, si existe. */
export function beanSpecificFor(
  recipes: CoffeeRecipe[],
  general: CoffeeRecipe | null,
  beanId: string | null,
): CoffeeRecipe | null {
  if (!general || !beanId) return null;
  return recipes.find((r) => r.baseRecipeId === general.id && r.beanId === beanId && !r.deletedAt) ?? null;
}

/** Qué variables del último ajuste del grano se aplican a este brew.
 *  Es exactamente el set de toggles de la pantalla `tweak` de hoy. */
export interface TweakApply {
  grind: boolean;
  temp: boolean;
  dose: boolean;
  water: boolean;
}

export const TWEAK_APPLY_ALL: TweakApply = { grind: true, temp: true, dose: true, water: true };

/** Aplica el último ajuste del grano sobre la receta base. Misma matemática que
 *  el `confirmTweak()` que vivía en `BrewView` (molienda / temp / ratio). La
 *  dosis NO se toca acá: es del borrador (la elige el stepper de 1i). */
export function applyTweak(base: CoffeeRecipe, tweak: CoffeeTweak | null, apply: TweakApply): CoffeeRecipe {
  if (!tweak) return base;
  const next: CoffeeRecipe = { ...base };
  if (apply.grind && tweak.grindSize) next.grindSize = tweak.grindSize;
  if (apply.temp && tweak.tempCelsius != null) next.tempCelsius = tweak.tempCelsius;
  if (apply.water && tweak.totalWaterGrams && tweak.doseGrams) {
    next.ratio = Math.round((tweak.totalWaterGrams / tweak.doseGrams) * 100) / 100;
  }
  return next;
}

export function pourCount(recipe: CoffeeRecipe): number {
  return recipe.steps.filter((s) => s.type === "pour").length;
}

/** `timeSeconds` es la DURACIÓN del paso ⇒ el total es la suma. */
export function recipeTotalSeconds(recipe: CoffeeRecipe): number {
  return recipe.steps.reduce((t, s) => t + (s.timeSeconds || 0), 0);
}

export function fmtClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Meta de una fila de receta en 1i: `4 vertidos · 1:16 · 3:00`.
 *  Sin vertidos (Aeropress) el handoff pide `inmersión 2:00 · 1:13` ⇒ la regla
 *  derivada es `pours === 0 ⇒ inmersión`. No hay campo para esto. */
export function recipeMeta(recipe: CoffeeRecipe): string {
  const pours = pourCount(recipe);
  const total = recipeTotalSeconds(recipe);
  const ratio = recipe.ratio > 0 ? `1:${recipe.ratio}` : "sin ratio";
  return pours > 0
    ? `${pours} vertido${pours === 1 ? "" : "s"} · ${ratio} · ${fmtClock(total)}`
    : `inmersión ${fmtClock(total)} · ${ratio}`;
}

/** Agua total mostrada y guardada. Recetas viejas con `ratio` 0/ausente ⇒ 0
 *  (no se divide ni se multiplica a ciegas). */
export function waterFor(recipe: CoffeeRecipe | null, doseGrams: number): number {
  if (!recipe || !(recipe.ratio > 0)) return 0;
  return Math.round(recipe.ratio * doseGrams);
}

/** Grano del banner inferior de 1i: el que está descansando y MÁS CERCA de
 *  entrar en rango. `null` si no hay ninguno ⇒ el banner no se muestra. */
export function restingBanner(
  beans: { id: string; name: string; roastedOn: string | null }[],
): { id: string; name: string; roastedOn: string; daysLeft: number } | null {
  let best: { id: string; name: string; roastedOn: string; daysLeft: number } | null = null;
  for (const b of beans) {
    if (!b.roastedOn || freshnessStatus(b.roastedOn) !== "too-fresh") continue;
    const d = daysOld(b.roastedOn);
    if (d == null) continue;
    const daysLeft = Math.max(0, REST_DAYS - d);
    if (!best || daysLeft < best.daysLeft) {
      best = { id: b.id, name: b.name, roastedOn: b.roastedOn, daysLeft };
    }
  }
  return best;
}

/** "26/07" a partir de un `YYYY-MM-DD`. */
export function fmtDayMonth(ymdStr: string): string {
  const [, m, d] = ymdStr.split("-");
  return `${d}/${m}`;
}

// ── borrador del brew ────────────────────────────────────────────────────────

/** El estado que viaja entre las pantallas del flujo. Vive en `CafeMobileView`
 *  (NO en el store de Zustand: es estado local del flujo).
 *
 *  Se guarda `generalRecipeId` — la receta EFECTIVA se DERIVA en cada render
 *  (`beanSpecificFor` + `applyTweak`). Si se guardara la receta resuelta,
 *  cambiar de grano dejaría pegada la receta ajustada del grano anterior. */
export interface BrewDraft {
  beanId: string | null;
  generalRecipeId: string | null;
  doseGrams: number;
  /** El usuario movió el stepper de dosis a mano ⇒ no se re-siembra al cambiar
   *  de grano y el toggle "Dosis" de la pantalla de tweaks arranca apagado. */
  doseTouched: boolean;
  /** Dosis que había ANTES de que la del `lastTweak` pisara el stepper (al
   *  elegir el grano o al prender el toggle "Dosis"). Es a lo que se vuelve al
   *  APAGAR ese toggle: sin esto "omitir" dejaba el mismo número que "usar".
   *  `null` = no se pisó nada ⇒ no hay nada que restaurar. */
  doseBeforeTweak: number | null;
  apply: TweakApply;
  /** Id del grano cuyos toggles describe `apply`. Los toggles se siembran UNA
   *  vez por grano: volver de `tweak` a `elegir` y entrar de nuevo NO los pisa
   *  (antes se reescribían enteros en cada transición y se perdía lo elegido). */
  applyFor: string | null;
}

export function emptyDraft(): BrewDraft {
  return {
    beanId: null,
    generalRecipeId: null,
    doseGrams: DEFAULT_DOSE_G,
    doseTouched: false,
    doseBeforeTweak: null,
    apply: { ...TWEAK_APPLY_ALL },
    applyFor: null,
  };
}

/** Lo que queda CONGELADO al entrar al brew (compuerta de `conexion`).
 *
 *  El borrador guarda ids y la receta efectiva se DERIVA en cada render — eso
 *  vale para elegir/tweak/conexión, pero NO para el brew en vivo: si la query
 *  de granos/recetas deja de resolver (grano marcado terminado al descontar el
 *  stock, pull de sync, refetch), la derivación se cae y `BrewView` se
 *  desmontaría a mitad del brew (tara + timer + datapoints perdidos). Además un
 *  cambio de receta en vuelo movería los objetivos y el `total_water_grams` que
 *  se guarda. Por eso el brew consume ESTE snapshot, no la query. */
export interface BrewSnapshot {
  bean: CoffeeBean;
  /** Receta EFECTIVA (específica del grano + `lastTweak` ya aplicado). */
  recipe: CoffeeRecipe;
  doseGrams: number;
}

// ── BLE: dueño único de la conexión ──────────────────────────────────────────

export type ConnStatus = "off" | "connecting" | "on";
export type DeviceSlot = "scale" | "kettle";

export interface CafeDevices {
  scaleStatus: ConnStatus;
  kettleStatus: ConnStatus;
  scaleData: ScaleData | null;
  kettleData: KettleData | null;
  scaleName: string | null;
  kettleName: string | null;
  error: string | null;
  clearError: () => void;

  /** Slot para el que hay un scan abierto; `null` = no hay scan. */
  scanFor: DeviceSlot | null;
  scanDevices: BleDevice[];
  scanDone: boolean;
  startScan: (slot: DeviceSlot) => void;
  cancelScan: () => void;

  connectScale: (d: BleDevice) => Promise<void>;
  connectKettle: (d: BleDevice) => Promise<void>;
  disconnectScale: () => Promise<void>;
  disconnectKettle: () => Promise<void>;
  disconnectAll: () => Promise<void>;

  /** Best-effort: pone la pava a calentar a `tempC`. No hace nada si la pava
   *  no está conectada o la temperatura es 0. */
  heatKettle: (tempC: number) => void;
}

/** ÚNICO dueño de `src/lib/ble.ts` en mobile.
 *
 *  `ble.ts` es un singleton de módulo (un solo `notifUnlisten`, una sola
 *  conexión): si dos componentes llaman `subscribeToScale`, el segundo pisa al
 *  primero. Por eso este hook se instancia UNA sola vez, en `CafeMobileView`
 *  (que la shell nunca desmonta), y las pantallas reciben el objeto por props.
 *  NINGUNA pantalla importa `lib/ble.ts` directamente. */
export function useCafeDevices(): CafeDevices {
  const [scaleStatus, setScaleStatus] = useState<ConnStatus>("off");
  const [kettleStatus, setKettleStatus] = useState<ConnStatus>("off");
  const [scaleData, setScaleData] = useState<ScaleData | null>(null);
  const [kettleData, setKettleData] = useState<KettleData | null>(null);
  const [scaleName, setScaleName] = useState<string | null>(null);
  const [kettleName, setKettleName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [scanFor, setScanFor] = useState<DeviceSlot | null>(null);
  const [scanDevices, setScanDevices] = useState<BleDevice[]>([]);
  const [scanDone, setScanDone] = useState(false);

  const scaleConnRef = useRef(false);
  const kettleConnRef = useRef(false);
  const kettleOnRef = useRef(false);
  // El scan puede tardar hasta ~28 s (8 s de scan + hasta 20 s esperando el
  // permiso de Android). Si mientras tanto el usuario cancela o se conecta,
  // los resultados que llegan tarde no deben reabrir la lista.
  const scanTokenRef = useRef(0);

  useEffect(() => { kettleOnRef.current = kettleStatus === "on"; }, [kettleStatus]);

  // cleanup: solo al desmontar el tab Café (la shell no lo desmonta nunca)
  useEffect(() => {
    return () => {
      if (scaleConnRef.current) { void unsubscribeFromScale(); void bleDisconnect(); }
      if (kettleConnRef.current) { void unsubscribeFromKettle(); void kettleDisconnect(); }
    };
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const cancelScan = useCallback(() => {
    scanTokenRef.current++;
    setScanFor(null);
    setScanDevices([]);
    setScanDone(false);
  }, []);

  /** NO devuelve promesa a propósito: `scanForScales` bloquea los 8 s completos
   *  (y hasta ~20 s más si Android tiene que pedir permisos). Quien lo llama
   *  no puede `await`-earlo sin congelar la pantalla. */
  const startScan = useCallback((slot: DeviceSlot) => {
    const token = ++scanTokenRef.current;
    setError(null);
    setScanDevices([]);
    setScanDone(false);
    setScanFor(slot);
    void scanForScales((found) => {
      if (scanTokenRef.current === token) setScanDevices(found);
    }, 8000).then(
      () => { if (scanTokenRef.current === token) setScanDone(true); },
      (e) => {
        if (scanTokenRef.current !== token) return;
        setError(String(e));
        setScanFor(null);
        setScanDone(true);
      },
    );
  }, []);

  const connectScale = useCallback(async (device: BleDevice) => {
    scanTokenRef.current++;
    setError(null); setScaleStatus("connecting"); setScanFor(null);
    try {
      await bleConnect(device.address, () => {
        scaleConnRef.current = false; setScaleStatus("off"); setScaleData(null);
        void unsubscribeFromScale();
      });
      await subscribeToScale((d) => setScaleData(d));
      scaleConnRef.current = true;
      setScaleName(device.name ?? device.address); setScaleStatus("on");
    } catch (e) { setScaleStatus("off"); setError(String(e)); }
  }, []);

  const connectKettle = useCallback(async (device: BleDevice) => {
    scanTokenRef.current++;
    setError(null); setKettleStatus("connecting"); setScanFor(null);
    try {
      await kettleConnect(device.address, () => {
        kettleConnRef.current = false; setKettleStatus("off"); setKettleData(null);
        void unsubscribeFromKettle();
      });
      await subscribeToKettle((d) => setKettleData(d));
      kettleConnRef.current = true;
      setKettleName(device.name ?? device.address); setKettleStatus("on");
    } catch (e) { setKettleStatus("off"); setError(String(e)); }
  }, []);

  const disconnectScale = useCallback(async () => {
    try { await unsubscribeFromScale(); await bleDisconnect(); } catch { /* best-effort */ }
    scaleConnRef.current = false;
    setScaleStatus("off"); setScaleData(null); setScaleName(null);
  }, []);

  const disconnectKettle = useCallback(async () => {
    try { await unsubscribeFromKettle(); await kettleDisconnect(); } catch { /* best-effort */ }
    kettleConnRef.current = false;
    setKettleStatus("off"); setKettleData(null); setKettleName(null);
  }, []);

  const disconnectAll = useCallback(async () => {
    if (scaleConnRef.current) await disconnectScale();
    if (kettleConnRef.current) await disconnectKettle();
  }, [disconnectScale, disconnectKettle]);

  const heatKettle = useCallback((tempC: number) => {
    if (kettleOnRef.current && tempC > 0) {
      void sendKettleTemp(tempC).catch(() => { /* best-effort */ });
    }
  }, []);

  return {
    scaleStatus, kettleStatus, scaleData, kettleData, scaleName, kettleName,
    error, clearError,
    scanFor, scanDevices, scanDone, startScan, cancelScan,
    connectScale, connectKettle, disconnectScale, disconnectKettle, disconnectAll,
    heatKettle,
  };
}
