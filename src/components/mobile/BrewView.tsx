import { useState, useEffect, useRef } from "react";
import { sendTare, sendStartTimer, type KettleData } from "../../lib/ble";
import { flowBand } from "../../lib/coffeeFlow";
import { useConsumeCoffeeBean, useCreateBrewSession, usePatchCoffeeBean } from "../../lib/queries";
import type { CoffeeRecipe, CoffeeBean, CoffeeRecipeStep, BrewDatapoint } from "../../types";
import { BREW_HAS_WATER_G, type CafeDevices } from "./cafeFlow";

/* Café · brew en vivo + cierre (fases `brewing` y `finish`).
 *
 * RECORTE (agente 1i, 2026-08-16): este componente ya NO elige nada ni conecta
 * nada. Se fueron a pantallas propias del flujo (`CafeMobileView` las rutea):
 *   · `home` / `scanning` (strips de balanza y pava + scan) → `BrewConnectView`
 *   · `bean` / `recipe` / `dose` / `ready` + `SlideToStart` → `BrewSetupView` (1i)
 *   · `tweak` (toggles del último ajuste)                   → `BrewTweakView`
 * El dueño del BLE es `useCafeDevices()`, instanciado en `CafeMobileView`; acá
 * llega por props. Sólo se llaman comandos sueltos de `ble.ts` (`sendTare`,
 * `sendStartTimer`): nada de conectar, desconectar ni suscribir.
 *
 * MONTAR ESTE COMPONENTE ES ARRANCAR EL BREW: el efecto de montaje hace la tara
 * y manda la pava a la temperatura de la receta (lo que hacía `startBrewing()`).
 * Ese efecto es IDEMPOTENTE (ref-guard): en dev `<React.StrictMode>` lo invoca
 * dos veces y eso taraba dos veces y mandaba dos comandos a la pava.
 *
 * `bean` / `recipe` / `doseGrams` llegan CONGELADOS (`BrewSnapshot` de
 * `cafeFlow.ts`, armado en la compuerta de `conexion`): mientras el brew corre no
 * se re-derivan de react-query, así un refetch o un grano que se marca terminado
 * al descontar el stock no pueden desmontar el brew ni moverle los objetivos.
 *
 * REDISEÑO 1h (agente de 1h, 2026-08-16): se rehízo el RENDER de la fase
 * `brewing` (barra de balanza + card oscura de peso + card de receta con el paso
 * en curso + CTA). Es presentación: la máquina de estados NO se tocó.
 *   · el paso sigue siendo DERIVADO del tiempo (`activeStepIdx`, suma de
 *     duraciones) — decisión del usuario. La barra de segmentos es un INDICADOR
 *     (sin tap) y las flechas ‹ › del diseño no se implementaron: con el paso
 *     derivado saltarían solas de vuelta. Ver el reporte de 1h.
 *   · la fase `finish` la conserva el usuario tal cual: NO se rediseñó.
 *   · clases CSS del rediseño: `.m-live-*` en `styles/mobile/cafe.css`.
 *
 * SI SE CAE LA BALANZA A MITAD DE BREW (decisión del usuario, 2026-08-16):
 * NO se reconecta desde acá y NO se abandona la pantalla. El criterio único es
 * `BREW_HAS_WATER_G` (`cafeFlow.ts`), medido contra el PICO de peso visto:
 *   · ya había agua ⇒ `sessionLost`: el brew SIGUE (cronómetro y avance de pasos
 *     por tiempo intactos) porque el usuario está haciendo café de verdad y tiene
 *     que poder terminarlo mirando la pantalla, pero la sesión se DESCARTA: al
 *     cerrar NO se crea `BrewSession` ni datapoints (telemetría incompleta). Se
 *     avisa en el acto con un cartel fijo, no al final.
 *   · todavía no había agua ⇒ no hay nada que perder: `onAbort()` y de vuelta a
 *     la pantalla de conexión (ahí sí está el scan).
 * Lo que SÍ se sigue guardando en un brew descartado es lo que no es telemetría:
 * el descuento de stock y el `lastTweak` / la cata. El café se usó igual.
 * Esto es DISTINTO del auto-stop por caída de peso (filtro removido), que
 * detecta el fin real del brew con la balanza conectada. */

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtTimer(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// Extrae el numero de clicks de una molienda guardada como texto ("90", "media-gruesa (~90 K6)").
function parseGrindClicks(s?: string): number {
  const m = (s ?? "").match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
}

// Cumulative water target for a step (from brew start, not per-step)
function stepCumulativeTarget(step: CoffeeRecipeStep, dose: number, totalWater: number): number | null {
  if (step.type !== "pour") return null;
  if (step.waterRatio == null) return step.waterGrams ?? null;
  // x_cafe: waterRatio es multiplo de la dosis (ej 2 -> 2x cafe).
  // pct_agua: waterRatio es el % del agua TOTAL de ESE paso (ej 20 -> 20% del agua),
  //   por eso /100 (el editor en CafeView lo guarda como porcentaje, no como fraccion).
  return (step.waterMode ?? "x_cafe") === "x_cafe"
    ? step.waterRatio * dose
    : (step.waterRatio / 100) * totalWater;
}

// Sum of per-step water from all previous pour steps (scale is cumulative, so this is the weight offset)
function prevPourCumulative(steps: CoffeeRecipeStep[], currentIdx: number, dose: number, totalWater: number): number {
  let sum = 0;
  for (let i = 0; i < currentIdx; i++) {
    if (steps[i].type === "pour") {
      sum += stepCumulativeTarget(steps[i], dose, totalWater) ?? 0;
    }
  }
  return sum;
}

// Resolved water target for a step — handles autoComplete (last pour fills up to totalWater)
function resolvedStepTarget(
  step: CoffeeRecipeStep,
  steps: CoffeeRecipeStep[],
  stepIdx: number,
  dose: number,
  totalWater: number,
): number | null {
  if (step.type !== "pour") return null;
  if (step.autoComplete) {
    // Per-step target = totalWater minus water already poured in all other steps
    const otherPoured = steps.reduce((sum, s, i) => {
      if (i === stepIdx || s.type !== "pour" || s.autoComplete) return sum;
      return sum + (stepCumulativeTarget(s, dose, totalWater) ?? 0);
    }, 0);
    return Math.max(0, totalWater - otherPoured);
  }
  return stepCumulativeTarget(step, dose, totalWater);
}

// timeSeconds is each step's DURATION. Cumulative start of step i = sum of previous durations.
function stepStartTime(steps: CoffeeRecipeStep[], i: number): number {
  let t = 0;
  for (let k = 0; k < i && k < steps.length; k++) t += steps[k].timeSeconds || 0;
  return t;
}

// Active step for a given elapsed time: walk the list in order, summing durations.
function activeStepIdx(steps: CoffeeRecipeStep[], timerSec: number): number {
  let acc = 0;
  for (let i = 0; i < steps.length; i++) {
    acc += steps[i].timeSeconds || 0;
    if (timerSec < acc) return i;
  }
  return Math.max(0, steps.length - 1); // past the end -> stay on last step
}

// ── sub-components ────────────────────────────────────────────────────────────

function KettleIcon({ state }: { state: KettleData["state"] }) {
  const map: Record<KettleData["state"], string> = { heating: "🔥", hold: "✓", cooling: "↓", idle: "○" };
  return <span>{map[state]}</span>;
}

// Stepper con botones + / - (ajuste al finalizar). decimals controla la precision.
function Stepper({ label, value, onChange, step, decimals = 0, unit, min, prefix }: {
  label: string; value: number; onChange: (v: number) => void;
  step: number; decimals?: number; unit?: string; min?: number; prefix?: string;
}) {
  const pow = 10 ** decimals;
  function bump(dir: number) {
    const next = Math.round((value + dir * step) * pow) / pow;
    onChange(min != null ? Math.max(min, next) : next);
  }
  const btn: React.CSSProperties = {
    fontSize: 24, fontWeight: 800, width: 46, height: 46, borderRadius: 10, lineHeight: 1, padding: 0, flexShrink: 0,
  };
  return (
    <div style={{ background: "var(--bg-sunken)", borderRadius: 12, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 11, color: "var(--fg-subtle)", fontWeight: 700 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <button className="btn ghost" style={btn} onClick={() => bump(-1)}>−</button>
        <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "var(--font-mono)", textAlign: "center", flex: 1, minWidth: 0 }}>
          {prefix}{value.toFixed(decimals)}{unit && <span style={{ fontSize: 12, color: "var(--fg-subtle)", fontWeight: 600 }}> {unit}</span>}
        </div>
        <button className="btn ghost" style={btn} onClick={() => bump(1)}>+</button>
      </div>
    </div>
  );
}

// Números del rediseño 1h: coma decimal, como el resto del mobile (`186,4`).
// (La `FlowGauge` de barra+punto la reemplazó el stat `g/s` de la card oscura,
// que usa la misma banda ±30% que `ScaleView` vía `lib/coffeeFlow.ts`.)
function fmtNum(n: number, decimals = 1): string {
  return n.toFixed(decimals).replace(".", ",");
}

// Clamp a 0..100 para las barras de progreso.
function pct(v: number): number {
  return Math.max(0, Math.min(100, v));
}

// ── types ─────────────────────────────────────────────────────────────────────

type Phase = "brewing" | "finish";

export interface BrewViewProps {
  /** Grano CONGELADO al armar el brew (`BrewSnapshot` de `cafeFlow.ts`).
   *  Nunca es `null`: sin grano no se puede salir de 1i (`canStart`) ni pasar la
   *  compuerta de `conexion`. Que sea del snapshot es lo que garantiza que no se
   *  evapore a mitad de brew (ej. al descontar el stock hasta 0 g, que marca el
   *  grano terminado). */
  bean: CoffeeBean;
  /** Receta EFECTIVA (específica del grano + último ajuste ya aplicado),
   *  también congelada: no se re-deriva mientras dura el brew. */
  recipe: CoffeeRecipe;
  /** Dosis DECLARADA en 1i (stepper de 0,5 g), no medida con la balanza. */
  doseGrams: number;
  /** Dueño del BLE (`useCafeDevices()` en `CafeMobileView`). */
  devices: CafeDevices;
  /** Espeja la fase interna en `cafeScreen` (`brew` / `finish`). */
  onPhaseChange: (p: Phase) => void;
  /** Brew guardado: el flujo limpia el borrador y vuelve a la bodega. */
  onDone: () => void;
  /** Se cayó la balanza ANTES de que hubiera agua (`BREW_HAS_WATER_G`): no hay
   *  nada que perder ⇒ el flujo descarta el brew y vuelve a `conexion`, que es
   *  donde vive el scan. Desmonta este componente. */
  onAbort: () => void;
}

// ── main component ────────────────────────────────────────────────────────────

export function BrewView({ bean, recipe, doseGrams, devices, onPhaseChange, onDone, onAbort }: BrewViewProps) {
  const { scaleData, kettleStatus, kettleData } = devices;
  const scaleDataRef = useRef(scaleData);

  const [phase, setPhase] = useState<Phase>("brewing");

  // ── ajuste "para la proxima" (fase finish): steppers + consumo + notas ──
  // Se siembran con lo que se va a usar en ESTE brew (editable al terminar).
  const [tweakGrind, setTweakGrind] = useState(() => parseGrindClicks(recipe.grindSize)); // clicks K6
  const [tweakRatio, setTweakRatio] = useState(() => recipe.ratio);                       // 1:ratio
  const [tweakDose, setTweakDose] = useState(() => doseGrams);                            // g
  const [tweakTemp, setTweakTemp] = useState(() => recipe.tempCelsius || 0);              // C
  const [tweakNotes, setTweakNotes] = useState(() => (recipe.coffeeType === "cata" ? (recipe.notes ?? "") : ""));
  const [tweakConsume, setTweakConsume] = useState(() => String(doseGrams)); // gramos a descontar del stock
  // form de cupping (cata inicial): se completa al finalizar un brew de receta tipo "cupping"
  const [cupFragancia, setCupFragancia] = useState("");
  const [cupSabor, setCupSabor] = useState("");
  const [cupAcidez, setCupAcidez] = useState("");
  const [cupDulzor, setCupDulzor] = useState("");
  const [cupCuerpo, setCupCuerpo] = useState("");
  const [cupDefectos, setCupDefectos] = useState("");
  const [cupNota, setCupNota] = useState("");

  // ── brewing ──
  const [waterDetected, setWaterDetected] = useState(false);
  const [brewTimerMs, setBrewTimerMs] = useState(0);
  const brewTimerStartRef = useRef(0);
  const flowConsecutiveRef = useRef(0);
  const datapointsRef = useRef<Omit<BrewDatapoint, "id" | "sessionId">[]>([]);
  // auto-stop al sacar el filtro/dripper: peso pico visto + contador de lecturas
  // consecutivas que confirman la caida (anti-ruido)
  const [brewStopped, setBrewStopped] = useState(false);
  const peakWeightRef = useRef(0);
  const removalConsecutiveRef = useRef(0);
  // se cayó la balanza con agua ya en el filtro: el brew SIGUE, la sesión no se
  // guarda. Es distinto de `brewStopped` (fin real del brew, balanza conectada).
  const [sessionLost, setSessionLost] = useState(false);
  // al finalizar: guardar tarda (encolar sesion + datapoints + tweak). Mostramos overlay
  // "Guardando..." y bloqueamos el boton para que no se dispare dos veces (cada tap creaba
  // una sesion duplicada). savingRef es el guard sincrono; saving controla el overlay.
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  // flow suavizado (EMA) para mostrar y para la barra: el flow crudo de la balanza (~10Hz)
  // salta mucho y hace parpadear el numero / la etiqueta. El crudo se sigue logueando tal cual.
  const [flowSmooth, setFlowSmooth] = useState(0);
  const flowSmoothRef = useRef(0);

  // Mutaciones por HOOK, no `repo.*` crudo: el repo escribe SQLite + outbox pero
  // no invalida react-query, así que el peso de la bodega y el `lastTweak` de la
  // pantalla `tweak` quedaban con el valor viejo (`staleTime` 60 s y sin
  // `refetchOnWindowFocus`) hasta el siguiente pull de sync.
  const createBrewSession = useCreateBrewSession();
  const patchCoffeeBean = usePatchCoffeeBean();
  const consumeCoffeeBean = useConsumeCoffeeBean();

  const isCupping = recipe.coffeeType === "cupping";
  function buildCataText(): string {
    return [
      ["Fragancia/aroma", cupFragancia],
      ["Sabores (notas a buscar)", cupSabor],
      ["Acidez", cupAcidez],
      ["Dulzor", cupDulzor],
      ["Cuerpo", cupCuerpo],
      ["Defectos", cupDefectos],
      ["Nota global", cupNota],
    ].filter(([, v]) => v.trim()).map(([k, v]) => `${k}: ${v.trim()}`).join("\n");
  }

  // ── arranque del brew ────────────────────────────────────────────────────────
  // Montar el componente ES arrancar: tara + pava a la temperatura de la receta.
  // (Era el cuerpo de `startBrewing()`; el reset de contadores ya no hace falta
  // porque el estado nace limpio en cada montaje.)
  //
  // El ref-guard NO es cosmético: `main.tsx` monta en `<React.StrictMode>`, que
  // en dev (`tauri android dev`) invoca los efectos DOS veces ⇒ doble tara y dos
  // comandos a la pava. El ref sobrevive al doble montaje simulado (es la misma
  // instancia del componente), así que el arranque queda idempotente.
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    devices.heatKettle(recipe.tempCelsius);
    void sendTare().catch(() => { /* best-effort */ });
    // solo al montar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Espejar la fase interna en `cafeScreen` (lo consume la compuerta del flujo).
  useEffect(() => { onPhaseChange(phase); }, [phase, onPhaseChange]);

  // ── caída de la balanza a mitad de brew ─────────────────────────────────────
  // `ble.ts` emite `ble-disconnected`; `useCafeDevices` lo traduce a
  // `scaleStatus: "off"` + `scaleData: null`. Detectamos el FLANCO on → off; el
  // que dispara `endBrew` es deliberado y se filtra con `endingRef`.
  // Durante `brewing` NO hay ninguna otra forma de llegar a ese flanco: el botón
  // "Desconectar" de la barra se sacó justamente porque desconectar a mano con
  // agua en el filtro descarta la sesión.
  const scaleOn = devices.scaleStatus === "on";
  const endingRef = useRef(false);
  const scaleWasOnRef = useRef(scaleOn);
  useEffect(() => {
    const wasOn = scaleWasOnRef.current;
    scaleWasOnRef.current = scaleOn;
    if (phase !== "brewing" || scaleOn || !wasOn) return;
    if (endingRef.current || sessionLost) return;
    // El pico (no la última lectura: `scaleData` ya es `null`) es el único
    // criterio. Se acumula sólo con `waterDetected`, así que un pico ≥ umbral
    // implica que el brew ya había arrancado.
    if (peakWeightRef.current >= BREW_HAS_WATER_G) setSessionLost(true);
    else onAbort();
  }, [scaleOn, phase, sessionLost, onAbort]);

  // ── water detection ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "brewing" || waterDetected) return;
    const flow = scaleData?.flow ?? 0;
    if (Math.abs(flow) > 0.4) {
      flowConsecutiveRef.current++;
      if (flowConsecutiveRef.current >= 2) {
        sendStartTimer().catch(() => { /* best-effort: la balanza puede rechazar el write */ });
        brewTimerStartRef.current = Date.now();
        setWaterDetected(true);
      }
    } else {
      flowConsecutiveRef.current = 0;
    }
  }, [phase, waterDetected, scaleData?.flow]);

  // ── auto-stop: deteccion de removido del filtro ───────────────────────────────
  // Durante un brew normal el peso solo SUBE (vertidos) o se mantiene. Una caida
  // brusca y sostenida = se levanto el dripper/filtro. Detectamos eso y frenamos.
  //
  // Con la balanza caída (`sessionLost`) este detector NO corre: `scaleData`
  // pasa a `null` ⇒ el peso leído sería 0 y la caída a 0 se confundiría con
  // levantar el filtro. Una desconexión NO es un auto-stop.
  useEffect(() => {
    if (phase !== "brewing" || !waterDetected || brewStopped || sessionLost) return;
    const REMOVAL_DROP_G = 50;          // caida absoluta minima vs el pico (g) — pedido del usuario:
                                        // el filtro + soporte pesan ~50g, solo paramos si se saca al
                                        // menos ese peso (evita falsos disparos)
    const REMOVAL_PEAK_FRACTION = 0.6;  // ademas el peso debe caer por debajo del 60% del pico
    const REMOVAL_MIN_PEAK_G = 50;      // ignorar hasta tener un pico real (evita disparos al inicio)
    const REMOVAL_CONSECUTIVE = 3;      // lecturas consecutivas que confirman la caida (anti-ruido)
    const w = scaleData?.weight ?? 0;
    if (w > peakWeightRef.current) peakWeightRef.current = w;
    const peak = peakWeightRef.current;
    const dropped =
      peak >= REMOVAL_MIN_PEAK_G &&
      (peak - w) >= REMOVAL_DROP_G &&
      w < peak * REMOVAL_PEAK_FRACTION;
    if (dropped) {
      removalConsecutiveRef.current++;
      if (removalConsecutiveRef.current >= REMOVAL_CONSECUTIVE) {
        setBrewStopped(true);
      }
    } else {
      removalConsecutiveRef.current = 0;
    }
  }, [phase, waterDetected, brewStopped, sessionLost, scaleData?.weight]);

  // ── brew timer ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "brewing" || !waterDetected || brewStopped) return;
    const id = setInterval(() => setBrewTimerMs(Date.now() - brewTimerStartRef.current), 100);
    return () => clearInterval(id);
  }, [phase, waterDetected, brewStopped]);

  // mantener un ref fresco de la balanza para el muestreo (sin depender de renders)
  useEffect(() => { scaleDataRef.current = scaleData; }, [scaleData]);

  // EMA del flow para display/barra (alpha 0.25 ~ ventana de 4-5 muestras a 10Hz)
  useEffect(() => {
    const f = scaleData?.flow ?? 0;
    flowSmoothRef.current = 0.25 * f + 0.75 * flowSmoothRef.current;
    setFlowSmooth(flowSmoothRef.current);
  }, [scaleData?.flow]);

  // ── datapoint sampling ~10Hz ─────────────────────────────────────────────────
  // El intervalo se crea UNA sola vez al arrancar el brew y lee de refs. Antes tenia
  // scaleData/brewTimerMs en las deps -> se destruia/recreaba ~10 veces por segundo
  // y casi nunca llegaba a disparar (quedaban ~20 puntos en vez de ~1300), por eso el
  // grafico salia con picos rectos en vez de la curva real.
  //
  // `sessionLost` lo corta: la sesion ya no se va a guardar (y sin balanza no
  // hay `scaleData` que muestrear). Es un booleano que se prende UNA vez, no
  // desestabiliza las deps. El cronometro NO se corta: su efecto no lo mira.
  useEffect(() => {
    if (phase !== "brewing" || !waterDetected || brewStopped || sessionLost) return;
    const steps = recipe.steps;
    const id = setInterval(() => {
      const sd = scaleDataRef.current;
      if (!sd) return;
      const timerMs = Date.now() - brewTimerStartRef.current;
      const stepIdx = activeStepIdx(steps, timerMs / 1000);
      datapointsRef.current.push({ timerMs, weightG: sd.weight, flowGs: sd.flow, stepIdx });
    }, 100);
    return () => clearInterval(id);
  }, [phase, waterDetected, recipe, brewStopped, sessionLost]);

  // CTA "Tara + Start" (1h): arranque MANUAL del brew. Dispara exactamente la
  // misma transición que la detección automática de agua (que sigue viva como
  // fallback: su efecto se auto-desactiva con `waterDetected`).
  //
  // SÓLO antes del primer vertido: tarar a mitad de brew pondría la balanza en
  // 0 y los objetivos ACUMULADOS (que se comparan contra el peso total) dejarían
  // de coincidir; además la caída de peso dispararía el auto-stop.
  function tareAndStart() {
    if (waterDetected || brewStopped) return;
    void sendTare().catch(() => { /* best-effort */ });
    sendStartTimer().catch(() => { /* best-effort: la balanza puede rechazar el write */ });
    brewTimerStartRef.current = Date.now();
    setWaterDetected(true);
  }

  // tocar "Finalizar brew" (✓): desconecta los dispositivos y pasa a la pantalla de ajuste/cata.
  // NO guarda todavia (el brew queda congelado: brewTimerMs + datapointsRef intactos).
  //
  // `endingRef` marca que la desconexion que viene es DELIBERADA, para que el
  // detector de caida de balanza no la lea como "se apago la balanza". Se pone
  // ANTES del `await` (sincrono): el evento de desconexion llega durante el await.
  // Con `sessionLost` el ✓ lleva al mismo cierre, pero sin escribir la sesion.
  async function endBrew() {
    if (savingRef.current) return;
    endingRef.current = true;
    try { await devices.disconnectAll(); } catch { /* best-effort */ }
    setPhase("finish");
  }

  // tocar "Guardar" en la pantalla de ajuste: encola la sesion + el ajuste y cierra el flujo.
  //
  // Con `sessionLost` se SALTEA la sesion (y con ella los datapoints): la
  // telemetria quedo incompleta cuando se cayo la balanza. Todo lo demas SI se
  // guarda, porque no es telemetria y el cafe se uso igual: el descuento de
  // stock, el `lastTweak` del grano y la cata inicial. Decision del usuario.
  async function saveBrew() {
    // guard: el guardado tarda; sin esto un doble-tap creaba varias sesiones identicas.
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);

    const totalWaterG = recipe.ratio * doseGrams;
    if (!sessionLost) {
      try {
        await createBrewSession.mutateAsync({
          recipeId: recipe.id, recipeName: recipe.name,
          beanId: bean.id, beanName: bean.name,
          doseGrams, totalWaterGrams: totalWaterG, durationMs: brewTimerMs,
          datapoints: datapointsRef.current,
        });
      } catch { /* best-effort */ }
    }
    // guardar el ajuste en el grano (steppers + notas). Salta la proxima vez que se levante este cafe.
    // (El `if (bean)` que envolvia esto se fue: el grano viene del snapshot y no puede ser null.)
    if (isCupping) {
      // cata inicial: guardar el form en cata_inicial SOLO si esta vacia; si ya hay, preguntar para agregar
      const cataText = buildCataText();
      if (cataText) {
        const existing = (bean.cataInicial ?? "").trim();
        try {
          if (!existing) {
            await patchCoffeeBean.mutateAsync({ id: bean.id, patch: { cataInicial: cataText } });
          } else if (window.confirm("Este grano ya tiene cata inicial. Agregar estas notas abajo?")) {
            await patchCoffeeBean.mutateAsync({
              id: bean.id,
              patch: { cataInicial: existing + "\n---\n" + cataText },
            });
          }
        } catch { /* best-effort */ }
      }
      if (doseGrams > 0) {
        try { await consumeCoffeeBean.mutateAsync({ id: bean.id, grams: doseGrams }); }
        catch { /* best-effort */ }
      }
    } else {
      try {
        await patchCoffeeBean.mutateAsync({
          id: bean.id,
          patch: {
            lastTweak: {
              grindSize: tweakGrind > 0 ? String(tweakGrind) : undefined,
              doseGrams: tweakDose > 0 ? tweakDose : doseGrams,
              totalWaterGrams: Math.round(tweakRatio * (tweakDose > 0 ? tweakDose : doseGrams)),
              tempCelsius: tweakTemp > 0 ? tweakTemp : (recipe.tempCelsius || undefined),
              notes: tweakNotes.trim(),
              recipeId: recipe.id,
              at: new Date().toISOString(),
            },
          },
        });
      } catch { /* best-effort */ }
      // descontar el cafe usado del stock (se auto-marca terminado si llega a 0)
      const usedG = parseFloat(tweakConsume);
      if (Number.isFinite(usedG) && usedG > 0) {
        try { await consumeCoffeeBean.mutateAsync({ id: bean.id, grams: usedG }); }
        catch { /* best-effort */ }
      }
    }
    datapointsRef.current = [];
    setSaving(false);
    savingRef.current = false;
    // El borrador y la limpieza los hace el flujo (`CafeMobileView`): este
    // componente se desmonta acá.
    onDone();
  }

  // ── derived ───────────────────────────────────────────────────────────────────
  const timerSec = brewTimerMs / 1000;
  // Steps run in authored order (the order shown in the editor). timeSeconds is each step's
  // DURATION; we advance sequentially by summing durations. We do NOT reorder by it.
  const steps = recipe.steps;
  const currentIdx = waterDetected ? activeStepIdx(steps, timerSec) : 0;
  const currentStep = steps[currentIdx] ?? null;
  const nextStep = steps[currentIdx + 1] ?? null;
  const totalWater = recipe.ratio * doseGrams;

  // Pesos ACUMULADOS (la balanza lee el peso total). Objetivo del paso = agua de pasos previos
  // + agua de este paso, para que el numero coincida con lo que marca la balanza.
  const dose = doseGrams;
  const thisStepAmount = currentStep ? resolvedStepTarget(currentStep, steps, currentIdx, dose, totalWater) : null;
  const prevTarget = currentStep ? prevPourCumulative(steps, currentIdx, dose, totalWater) : 0;
  const currentWeight = scaleData?.weight ?? 0;
  const isPour = currentStep?.type === "pour";
  const stepCumTarget = isPour ? prevTarget + (thisStepAmount ?? 0) : prevTarget;
  const reachedTarget = isPour && stepCumTarget > 0 && currentWeight >= stepCumTarget - 1;

  // Per-step time (seconds): elapsed within the current step / its duration (timeSeconds).
  const stepDur = currentStep ? Math.max(0, Math.round(currentStep.timeSeconds || 0)) : null;
  const stepStart = currentStep ? stepStartTime(steps, currentIdx) : 0;
  const stepElapsedRaw = currentStep ? Math.max(0, Math.floor(timerSec - stepStart)) : 0;
  const stepElapsed = stepDur != null ? Math.min(stepElapsedRaw, stepDur) : stepElapsedRaw;

  // ── derivados de PRESENTACIÓN del rediseño 1h ───────────────────────────────
  // Card oscura: la barra va hacia el agua TOTAL de la receta (el header dice
  // "objetivo 250 g", que es el total). La barra del PASO vive en la card del paso.
  const totalPct = totalWater > 0 ? pct((currentWeight / totalWater) * 100) : 0;
  // Barra del paso: avance DESDE el objetivo del paso anterior (antes se medía
  // desde cero, que es lo que mide la barra de la card oscura).
  const stepSpan = stepCumTarget - prevTarget;
  const stepWeightPct = stepSpan > 0 ? pct(((currentWeight - prevTarget) / stepSpan) * 100) : 0;
  const stepTimePct = stepDur ? pct((stepElapsed / stepDur) * 100) : 0;
  // Los pasos `action` no tienen objetivo de peso ⇒ su barra avanza por tiempo.
  // Sin balanza (`sessionLost`) TODAS avanzan por tiempo: la de peso quedaría
  // clavada en 0 y el brew se sigue justamente por tiempo.
  const stepPct = isPour && stepSpan > 0 && !sessionLost ? stepWeightPct : stepTimePct;
  const band = flowBand(Math.max(0, flowSmooth), currentStep?.flowTarget);
  const nextTitle = nextStep
    ? (nextStep.description || (nextStep.type === "pour" ? "Vertida" : "Paso"))
    : "Servir y anotar";
  // (`scaleOn` se define arriba, junto al detector de caída de la balanza.)
  const scaleSub = [devices.scaleName, recipe.name, bean?.name].filter(Boolean).join(" · ");

  // ── render ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", position: "relative" }}>

      {/* ── GUARDANDO (overlay) ── el guardado tarda; tapamos la pantalla para que se vea
           que esta procesando y no se vuelva a tocar el boton */}
      {/* `--bg-base` NO existe en `tokens.css`: el `color-mix` inline era inválido
           y el overlay quedaba transparente (tapaba los taps, pero no se veía). */}
      {saving && (
        <div className="m-live-saving">
          <div style={{ fontSize: 32 }}>⏳</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>
            {sessionLost ? "Cerrando el brew…" : "Guardando brew…"}
          </div>
          <div style={{ fontSize: 13, color: "var(--fg-muted)", textAlign: "center", maxWidth: 240 }}>
            {sessionLost
              ? "Guardando el café usado y el ajuste. La sesión no se registra."
              : "Guardando la sesión y desconectando balanza y pava. Puede tardar unos segundos."}
          </div>
        </div>
      )}

      {/* ── BREWING (rediseño 1h) ── */}
      {phase === "brewing" && (
        <>
          {/* ── barra de estado de la balanza ──────────────────────────────── */}
          <div className="m-live-scale">
            <span className={`m-live-scale-dot${scaleOn ? " is-on" : ""}`} />
            <div className="m-live-scale-info">
              {/* El cartel grande vive en el cuerpo (que scrollea); esta línea es
                  el recordatorio FIJO de que la sesión ya no se guarda. */}
              <div className="m-live-scale-name">
                {scaleOn ? "Balanza conectada" : sessionLost ? "Balanza caída — no se guarda" : "Sin balanza"}
              </div>
              <div className="m-live-scale-subrow">
                <span className="m-live-scale-sub">{scaleSub}</span>
                {/* La pava y la batería no tienen slot en el diseño de 1h, pero el
                    dato existe y hoy se ve durante el brew ⇒ va acá, sin truncar. */}
                {(scaleData?.battery != null || (kettleStatus === "on" && kettleData)) && (
                  <span className="m-live-scale-meta">
                    {scaleData?.battery != null && <span>🔋 {scaleData.battery}%</span>}
                    {kettleStatus === "on" && kettleData && (
                      <span><KettleIcon state={kettleData.state} /> {kettleData.temp.toFixed(0)}°C</span>
                    )}
                  </span>
                )}
              </div>
            </div>
            {/* Esta barra NO tiene botones, por decisión del usuario:
                · "Buscar balanza" no va y no es un pendiente: no se reconecta
                  desde un brew en curso. Si la balanza se cae con agua ya
                  vertida el brew SIGUE sin ella (cronómetro y pasos por tiempo)
                  y la sesión se descarta; si se cae antes del agua, el flujo
                  vuelve solo a `conexion`, que es donde vive el scan.
                · "Desconectar" se SACÓ de la fase `brewing` (2026-08-16): ahora
                  que desconectar con agua en el filtro descarta la sesión, el
                  botón era una trampa — un toque de más perdía el registro sin
                  aviso previo. Desconectar a mano sigue estando donde tiene
                  sentido: `BrewConnectView` (antes del brew) y el ✓ (`endBrew`
                  → `disconnectAll()`) al terminar.
                El "← Volver" de `finish` cae en un estado coherente: un brew sin
                balanza que se puede terminar mirando la pantalla. */}
          </div>

          <div className="m-live-body">

            {/* Se cayó la balanza con agua ya vertida: el brew sigue, la sesión
                no. El aviso es fijo (no un toast) para que no se pueda pasar por
                alto y para que al llegar al ✓ ya se sepa. */}
            {sessionLost && (
              <div className="m-live-alert m-live-alert--warn">
                <div className="m-live-alert-title">⚠ Se desconectó la balanza</div>
                <div className="m-live-alert-sub">
                  El brew sigue: el cronómetro y los pasos avanzan por tiempo, terminalo
                  mirando la pantalla. <b>Esta sesión no se va a guardar</b> — los datos
                  quedaron incompletos. El café usado y el ajuste sí se guardan al cerrar.
                </div>
              </div>
            )}

            {/* auto-stop: filtro removido (no tiene slot en el diseño; va arriba) */}
            {brewStopped && (
              <div className="m-live-alert">
                <div className="m-live-alert-title">☕ Sacaste el filtro — brew detenido</div>
                <div className="m-live-alert-sub">
                  {sessionLost ? "Tocá ✓ para cerrar (la sesión no se guarda)." : "Tocá ✓ para guardar la sesión."}
                </div>
              </div>
            )}

            {/* ── card oscura de peso ──────────────────────────────────────── */}
            <div className="m-live-weight">
              <div className="m-live-weight-head">
                <span className="m-live-weight-label">Peso</span>
                <span className="m-live-weight-target">
                  {totalWater > 0 ? `objetivo ${totalWater.toFixed(0)} g · 1:${recipe.ratio}` : "sin objetivo de agua"}
                </span>
              </div>
              {/* Sin balanza no hay peso: `scaleData` es `null` y `currentWeight`
                  cae a 0. Mostrar "0,0 g" con la barra vaciándose sería mentir
                  sobre una medición que no existe ⇒ "—". */}
              <div className="m-live-weight-num">
                {sessionLost ? "—" : fmtNum(currentWeight, 1)}<span className="m-live-weight-unit">g</span>
              </div>
              <div className="m-live-bar">
                <div className="m-live-bar-fill" style={{ width: `${totalPct}%` }} />
              </div>
              <div className="m-live-stats">
                <div className="m-live-stat">
                  <div className="m-live-stat-val">{sessionLost ? "—" : fmtNum(Math.max(0, flowSmooth), 1)}</div>
                  <div className="m-live-stat-label">
                    g/s{!sessionLost && waterDetected && isPour && <> · <span className={`m-live-flow is-${band.tone}`}>{band.label}</span></>}
                  </div>
                </div>
                <div className="m-live-stat">
                  <div className="m-live-stat-val">{fmtTimer(brewTimerMs)}</div>
                  <div className="m-live-stat-label">tiempo</div>
                </div>
                <div className="m-live-stat">
                  <div className="m-live-stat-val">{fmtNum(doseGrams, 1)}</div>
                  <div className="m-live-stat-label">g dosis</div>
                </div>
              </div>
            </div>

            {/* el timer arranca solo con el primer vertido (o con "Tara + Start") */}
            {!waterDetected && (
              <div className="m-live-wait">
                💧 Esperando agua — el timer arranca con el primer vertido.
              </div>
            )}

            {/* ── card de receta con el paso en curso ──────────────────────── */}
            {currentStep && (
              <div className="m-live-recipe">
                <div className="m-live-recipe-head">
                  <div className="m-live-recipe-name">{[recipe.name, bean?.name].filter(Boolean).join(" · ")}</div>
                  <span className="m-live-recipe-pill">paso {currentIdx + 1} de {steps.length}</span>
                </div>

                {/* Barra de segmentos: INDICADOR, sin tap. El paso se DERIVA del
                    tiempo (decisión del usuario) ⇒ un tap volvería solo al paso
                    derivado en el próximo tick. Por lo mismo no van las flechas ‹ ›. */}
                <div className="m-live-segs">
                  {steps.map((_s, i) => (
                    <div
                      key={i}
                      className={`m-live-seg${i < currentIdx ? " is-done" : i === currentIdx ? " is-current" : ""}`}
                    />
                  ))}
                </div>

                <div className="m-live-step">
                  <div className="m-live-step-head">
                    <span className="m-live-step-num">{currentIdx + 1}</span>
                    <div className="m-live-step-titles">
                      <div className="m-live-step-title">
                        {currentStep.description || (isPour ? "Verter" : "Esperar")}
                      </div>
                      <div className="m-live-step-meta">
                        {fmtTimer(stepStart * 1000)} – {fmtTimer((stepStart + (stepDur ?? 0)) * 1000)}
                      </div>
                    </div>
                  </div>
                  <div className="m-live-step-bar">
                    <div
                      className={`m-live-step-fill${reachedTarget ? " is-done" : ""}`}
                      style={{ width: `${stepPct}%` }}
                    />
                  </div>
                  <div className="m-live-step-foot">
                    {/* TODO(1h · usuario): el diseño pone acá un hint por paso
                        ("Vertido en espiral, lento"), pero `CoffeeRecipeStep` sólo
                        tiene `description` (que es el título). Mientras no exista el
                        campo, el slot muestra el cronómetro del paso, que es lo que
                        se veía antes en grande. */}
                    <span className="m-live-step-hint">
                      {stepDur != null ? `${stepElapsed} / ${stepDur} s` : `${stepElapsed} s`}
                    </span>
                    <span className="m-live-step-target">
                      {isPour && stepCumTarget > 0
                        ? `hasta ${stepCumTarget.toFixed(0)} g`
                        : sessionLost ? "sin balanza" : `${currentWeight.toFixed(0)} g en la balanza`}
                    </span>
                  </div>
                </div>

                <div className="m-live-next">Sigue: <b>{nextTitle}</b></div>
              </div>
            )}

            {/* ── CTA ──────────────────────────────────────────────────────── */}
            <div className="m-live-cta-row">
              <button
                type="button"
                className="m-live-cta"
                onClick={tareAndStart}
                disabled={waterDetected || brewStopped}
              >
                {brewStopped ? "Brew detenido" : waterDetected ? "Brew en curso" : "Tara + Start"}
              </button>
              <button
                type="button"
                className="m-live-done"
                onClick={endBrew}
                disabled={saving}
                aria-label={isCupping ? "Terminar cata" : "Finalizar brew"}
                title={isCupping ? "Terminar cata" : "Finalizar brew"}
              >
                ✓
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── FINISH (ajuste para la proxima / cata) ── */}
      {phase === "finish" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button className="btn ghost" style={{ fontSize: 12, padding: "6px 10px" }}
                onClick={() => setPhase("brewing")}>← Volver</button>
              <span style={{ fontSize: 16, fontWeight: 700 }}>{isCupping ? "Cata inicial" : "Ajuste para la próxima"}</span>
            </div>

            {/* Único cambio de la fase `finish` además del texto del botón: el
                aviso de que esta sesión no se registra (se cayó la balanza). Sin
                esto el resumen de arriba prometería un guardado que no pasa. */}
            {sessionLost && (
              <div className="m-live-alert m-live-alert--warn">
                <div className="m-live-alert-title">⚠ Esta sesión no se guarda</div>
                <div className="m-live-alert-sub">
                  Se desconectó la balanza durante el brew, así que los datos quedaron
                  incompletos y no se registra la sesión. El café usado se descuenta del
                  stock y el ajuste queda guardado igual.
                </div>
              </div>
            )}

            {/* resumen del brew */}
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1, background: "var(--bg-sunken)", borderRadius: 10, padding: "10px 12px", textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "var(--fg-subtle)" }}>Tiempo</div>
                <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "var(--font-mono)" }}>{fmtTimer(brewTimerMs)}</div>
              </div>
              <div style={{ flex: 1, background: "var(--bg-sunken)", borderRadius: 10, padding: "10px 12px", textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "var(--fg-subtle)" }}>Agua</div>
                <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "var(--font-mono)" }}>{totalWater.toFixed(0)} g</div>
              </div>
            </div>

            {/* ajuste con steppers (no-cata, con grano) */}
            {!isCupping && bean && (
              <>
                <div style={{ fontSize: 12, color: "var(--fg-subtle)" }}>
                  Tocá + / − para dejar el ajuste que sale la próxima vez que levantes este café.
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <Stepper label="Ratio (1:x)" prefix="1:" value={tweakRatio} step={0.1} decimals={1} min={1} onChange={setTweakRatio} />
                  <Stepper label="Temp" unit="°C" value={tweakTemp} step={1} decimals={0} min={0} onChange={setTweakTemp} />
                  <Stepper label="Dosis" unit="g" value={tweakDose} step={0.1} decimals={1} min={0} onChange={setTweakDose} />
                  <Stepper label="Molienda (K6)" unit="clicks" value={tweakGrind} step={1} decimals={0} min={0} onChange={setTweakGrind} />
                </div>
                <label style={{ fontSize: 11, color: "var(--fg-muted)", display: "flex", flexDirection: "column", gap: 2 }}>
                  Café usado (g) — se descuenta del stock
                  <input className="input" type="number" inputMode="decimal" value={tweakConsume}
                    onChange={(e) => setTweakConsume(e.target.value)} />
                </label>
                <textarea className="input" value={tweakNotes} rows={3} style={{ resize: "vertical", fontSize: 13 }}
                  placeholder="Notas (ej. quedó ácido, moler más fino la próxima)…"
                  onChange={(e) => setTweakNotes(e.target.value)} />
              </>
            )}

            {/* (Acá vivía el aviso "Sin café especificado": era código MUERTO desde
                que 1i exige grano para empezar el brew — `canStart` en
                `BrewSetupView` y la compuerta de `CafeMobileView`.) */}

            {/* cata (receta cupping con grano) */}
            {isCupping && bean && (
              <div style={{ background: "var(--bg-sunken)", borderRadius: 12, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--accent, #4caf50)" }}>
                  Cata inicial — notas a buscar (se guarda en el café si está vacía)
                </div>
                {(() => {
                  const fields: Array<[string, string, (v: string) => void, string]> = [
                    ["Fragancia / aroma", cupFragancia, setCupFragancia, "floral, frutal, dulce, tostado..."],
                    ["Sabores (notas a buscar)", cupSabor, setCupSabor, "durazno, panela, te negro..."],
                    ["Acidez", cupAcidez, setCupAcidez, "citrica, brillante, media..."],
                    ["Dulzor", cupDulzor, setCupDulzor, "alto, a panela..."],
                    ["Cuerpo", cupCuerpo, setCupCuerpo, "liviano, sedoso, jugoso..."],
                    ["Defectos", cupDefectos, setCupDefectos, "ninguno / astringente / fermento..."],
                  ];
                  return fields.map(([label, val, setter, ph]) => (
                    <label key={label} style={{ fontSize: 11, color: "var(--fg-muted)", display: "flex", flexDirection: "column", gap: 2 }}>
                      {label}
                      <input className="input" value={val} placeholder={ph} onChange={(e) => setter(e.target.value)} />
                    </label>
                  ));
                })()}
                <label style={{ fontSize: 11, color: "var(--fg-muted)", display: "flex", flexDirection: "column", gap: 2 }}>
                  Nota global (1-10)
                  <input className="input" type="number" inputMode="decimal" value={cupNota}
                    onChange={(e) => setCupNota(e.target.value)} />
                </label>
              </div>
            )}
          </div>
          <div style={{ padding: 16, flexShrink: 0, borderTop: "1px solid var(--border-subtle)", background: "var(--bg)" }}>
            <button className="btn primary" style={{ width: "100%", fontSize: 16, fontWeight: 800, padding: "14px", borderRadius: 12, opacity: saving ? 0.6 : 1 }}
              onClick={saveBrew} disabled={saving}>
              {saving
                ? "Guardando…"
                : isCupping
                  ? "Guardar cata"
                  : sessionLost ? "Guardar ajuste y cerrar" : "Guardar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
