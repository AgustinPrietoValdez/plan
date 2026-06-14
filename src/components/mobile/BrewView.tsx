import { useState, useEffect, useRef, useCallback } from "react";
import {
  scanForScales,
  bleConnect, bleDisconnect, subscribeToScale, unsubscribeFromScale,
  sendTare, sendStartTimer,
  kettleConnect, kettleDisconnect, subscribeToKettle, unsubscribeFromKettle, sendKettleTemp,
  type BleDevice, type ScaleData, type KettleData,
} from "../../lib/ble";
import { useCoffeeBeans, useCoffeeRecipes, useCreateBrewSession } from "../../lib/queries";
import { repo } from "../../lib/repo";
import type { CoffeeRecipe, CoffeeBean, CoffeeRecipeStep, BrewDatapoint } from "../../types";

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtTimer(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// Cumulative water target for a step (from brew start, not per-step)
function stepCumulativeTarget(step: CoffeeRecipeStep, dose: number, totalWater: number): number | null {
  if (step.type !== "pour") return null;
  if (step.waterRatio == null) return step.waterGrams ?? null;
  return (step.waterMode ?? "x_cafe") === "x_cafe"
    ? step.waterRatio * dose
    : step.waterRatio * totalWater;
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

function ConnDot({ on }: { on: boolean }) {
  return (
    <span style={{
      width: 9, height: 9, borderRadius: "50%", display: "inline-block", flexShrink: 0,
      background: on ? "#4caf50" : "var(--fg-subtle)",
    }} />
  );
}

function FlowBand({ flow, target }: { flow: number | null; target?: number }) {
  if (flow == null) return null;
  const tgt = target ?? 3;
  const lo = tgt * 0.7, hi = tgt * 1.3;
  const abs = Math.abs(flow);
  const label = abs < lo ? "lento" : abs > hi ? "rápido" : "bien";
  const color = label === "bien" ? "#4caf50" : label === "rápido" ? "var(--danger)" : "#ff9800";
  return <span style={{ fontSize: 11, fontWeight: 700, color, marginLeft: 4 }}>{label}</span>;
}

function KettleIcon({ state }: { state: KettleData["state"] }) {
  const map: Record<KettleData["state"], string> = { heating: "🔥", hold: "✓", cooling: "↓", idle: "○" };
  return <span>{map[state]}</span>;
}

function SlideToStart({ onStart, disabled }: { onStart: () => void; disabled?: boolean }) {
  const [val, setVal] = useState(0);
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = Number(e.target.value);
    setVal(v);
    if (v >= 95) { onStart(); setTimeout(() => setVal(0), 150); }
  }
  function handleEnd() { if (val < 95) setVal(0); }
  return (
    <div style={{ position: "relative", height: 60, borderRadius: 30, background: "var(--bg-sunken)", overflow: "hidden", opacity: disabled ? 0.4 : 1 }}>
      <div style={{
        position: "absolute", top: 0, left: 0, height: "100%",
        width: `${Math.max(val, 8)}%`,
        background: "color-mix(in srgb, var(--accent, #4caf50) 25%, transparent)",
        transition: val === 0 ? "width 0.3s" : "none",
      }} />
      {val < 10 && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "var(--fg-subtle)", pointerEvents: "none", userSelect: "none" }}>
          Deslizá para arrancar →
        </div>
      )}
      <div style={{
        position: "absolute", top: 6, left: `calc(${val}% * (100% - 48px) / 100 + 6px)`,
        width: 48, height: 48, borderRadius: "50%",
        background: "var(--accent, #4caf50)",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: val === 0 ? "left 0.3s" : "none",
        pointerEvents: "none",
        fontSize: 18,
      }}>▶</div>
      <input type="range" min={0} max={100} value={val} disabled={disabled}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: disabled ? "not-allowed" : "grab", margin: 0 }}
        onChange={handleChange}
        onMouseUp={handleEnd}
        onTouchEnd={handleEnd}
      />
    </div>
  );
}

// ── types ─────────────────────────────────────────────────────────────────────

type ConnStatus = "off" | "connecting" | "on";
type Phase = "home" | "scanning" | "bean" | "recipe" | "tweak" | "dose" | "ready" | "brewing";

// ── main component ────────────────────────────────────────────────────────────

export function BrewView() {
  // ── connections ──
  const [scaleStatus, setScaleStatus] = useState<ConnStatus>("off");
  const [kettleStatus, setKettleStatus] = useState<ConnStatus>("off");
  const [scaleData, setScaleData] = useState<ScaleData | null>(null);
  const scaleDataRef = useRef<ScaleData | null>(null);
  const [kettleData, setKettleData] = useState<KettleData | null>(null);
  const [scaleName, setScaleName] = useState<string | null>(null);
  const [kettleName, setKettleName] = useState<string | null>(null);
  const scaleConnRef = useRef(false);
  const kettleConnRef = useRef(false);

  // ── scan ──
  const [connectingFor, setConnectingFor] = useState<"scale" | "kettle">("scale");
  const [scanDevices, setScanDevices] = useState<BleDevice[]>([]);
  const [scanDone, setScanDone] = useState(false);

  // ── brew selection ──
  const [phase, setPhase] = useState<Phase>("home");
  const [selectedBean, setSelectedBean] = useState<CoffeeBean | null>(null);
  const [selectedRecipe, setSelectedRecipe] = useState<CoffeeRecipe | null>(null);
  const [doseGrams, setDoseGrams] = useState<number | null>(null);
  // ajuste "para la proxima" (mixto: campos de receta editables + notas)
  const [tweakGrind, setTweakGrind] = useState("");
  const [tweakDose, setTweakDose] = useState("");
  const [tweakWater, setTweakWater] = useState("");
  const [tweakTemp, setTweakTemp] = useState("");
  const [tweakNotes, setTweakNotes] = useState("");
  const [tweakConsume, setTweakConsume] = useState(""); // gramos a descontar del stock
  // pre-dosis: que variables del ultimo tweak aplicar (toggle por categoria)
  const [applyGrind, setApplyGrind] = useState(true);
  const [applyTemp, setApplyTemp] = useState(true);
  const [applyDose, setApplyDose] = useState(true);
  const [applyWater, setApplyWater] = useState(true);
  const returnToReadyRef = useRef(false);

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

  const [error, setError] = useState<string | null>(null);

  const { data: recipes = [] } = useCoffeeRecipes();
  const { data: beans = [] } = useCoffeeBeans();
  const createBrewSession = useCreateBrewSession();

  // recetas generales (las que se eligen); las especificas por grano no se listan, se resuelven
  const generalRecipes = recipes.filter((r) => !r.baseRecipeId && !r.deletedAt);
  function beanSpecificFor(general: CoffeeRecipe, beanId: string | null): CoffeeRecipe | null {
    if (!beanId) return null;
    return recipes.find((r) => r.baseRecipeId === general.id && r.beanId === beanId && !r.deletedAt) ?? null;
  }
  // al elegir una receta general, resuelve a la version del grano (con variables de la AI) si existe
  function pickRecipe(general: CoffeeRecipe) {
    setSelectedRecipe(beanSpecificFor(general, selectedBean?.id ?? null) ?? general);
  }

  // cleanup on unmount
  useEffect(() => {
    return () => {
      if (scaleConnRef.current) { void unsubscribeFromScale(); void bleDisconnect(); }
      if (kettleConnRef.current) { void unsubscribeFromKettle(); void kettleDisconnect(); }
    };
  }, []);

  // ── water detection ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "brewing" || waterDetected) return;
    const flow = scaleData?.flow ?? 0;
    if (Math.abs(flow) > 0.4) {
      flowConsecutiveRef.current++;
      if (flowConsecutiveRef.current >= 2) {
        void sendStartTimer();
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
  useEffect(() => {
    if (phase !== "brewing" || !waterDetected || brewStopped) return;
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
  }, [phase, waterDetected, brewStopped, scaleData?.weight]);

  // ── brew timer ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "brewing" || !waterDetected || brewStopped) return;
    const id = setInterval(() => setBrewTimerMs(Date.now() - brewTimerStartRef.current), 100);
    return () => clearInterval(id);
  }, [phase, waterDetected, brewStopped]);

  // mantener un ref fresco de la balanza para el muestreo (sin depender de renders)
  useEffect(() => { scaleDataRef.current = scaleData; }, [scaleData]);

  // ── datapoint sampling ~10Hz ─────────────────────────────────────────────────
  // El intervalo se crea UNA sola vez al arrancar el brew y lee de refs. Antes tenia
  // scaleData/brewTimerMs en las deps -> se destruia/recreaba ~10 veces por segundo
  // y casi nunca llegaba a disparar (quedaban ~20 puntos en vez de ~1300), por eso el
  // grafico salia con picos rectos en vez de la curva real.
  useEffect(() => {
    if (phase !== "brewing" || !waterDetected || !selectedRecipe || brewStopped) return;
    const steps = selectedRecipe.steps;
    const id = setInterval(() => {
      const sd = scaleDataRef.current;
      if (!sd) return;
      const timerMs = Date.now() - brewTimerStartRef.current;
      const stepIdx = activeStepIdx(steps, timerMs / 1000);
      datapointsRef.current.push({ timerMs, weightG: sd.weight, flowGs: sd.flow, stepIdx });
    }, 100);
    return () => clearInterval(id);
  }, [phase, waterDetected, selectedRecipe, brewStopped]);

  // ── scan ──────────────────────────────────────────────────────────────────────
  async function startScan(forSlot: "scale" | "kettle") {
    setError(null); setScanDevices([]); setScanDone(false);
    setConnectingFor(forSlot); setPhase("scanning");
    try {
      await scanForScales(found => setScanDevices(found), 8000);
      setScanDone(true);
    } catch (e) { setError(String(e)); setPhase("home"); }
  }

  const connectScale = useCallback(async (device: BleDevice) => {
    setError(null); setScaleStatus("connecting"); setPhase("home");
    try {
      await bleConnect(device.address, () => {
        scaleConnRef.current = false; setScaleStatus("off"); setScaleData(null);
        void unsubscribeFromScale();
      });
      await subscribeToScale(d => setScaleData(d));
      scaleConnRef.current = true;
      setScaleName(device.name ?? device.address); setScaleStatus("on");
    } catch (e) { setScaleStatus("off"); setError(String(e)); }
  }, []);

  const connectKettle = useCallback(async (device: BleDevice) => {
    setError(null); setKettleStatus("connecting"); setPhase("home");
    try {
      await kettleConnect(device.address, () => {
        kettleConnRef.current = false; setKettleStatus("off"); setKettleData(null);
        void unsubscribeFromKettle();
      });
      await subscribeToKettle(d => setKettleData(d));
      kettleConnRef.current = true;
      setKettleName(device.name ?? device.address); setKettleStatus("on");
    } catch (e) { setKettleStatus("off"); setError(String(e)); }
  }, []);

  async function disconnectScale() {
    await unsubscribeFromScale(); await bleDisconnect();
    scaleConnRef.current = false; setScaleStatus("off"); setScaleData(null); setScaleName(null);
    if (phase !== "home") setPhase("home");
  }
  async function disconnectKettle() {
    await unsubscribeFromKettle(); await kettleDisconnect();
    kettleConnRef.current = false; setKettleStatus("off"); setKettleData(null); setKettleName(null);
  }

  // ── navigation ────────────────────────────────────────────────────────────────
  function goBean() { returnToReadyRef.current = false; setPhase("bean"); }
  function confirmBean() { setPhase(returnToReadyRef.current ? "ready" : "recipe"); returnToReadyRef.current = false; }
  function confirmRecipe() {
    if (returnToReadyRef.current) { returnToReadyRef.current = false; setPhase("ready"); return; }
    // si el grano tiene un ultimo ajuste, ofrecer aplicarlo por variable antes de la dosis
    setPhase(selectedBean?.lastTweak ? "tweak" : "dose");
  }
  function confirmTweak() {
    const t = selectedBean?.lastTweak;
    if (t && selectedRecipe) {
      const next: CoffeeRecipe = { ...selectedRecipe };
      if (applyGrind && t.grindSize) next.grindSize = t.grindSize;
      if (applyTemp && t.tempCelsius != null) next.tempCelsius = t.tempCelsius;
      if (applyWater && t.totalWaterGrams && t.doseGrams) {
        next.ratio = Math.round((t.totalWaterGrams / t.doseGrams) * 100) / 100;
      }
      setSelectedRecipe(next);
      if (applyDose && t.doseGrams != null) { setDoseGrams(t.doseGrams); setPhase("ready"); return; }
    }
    setPhase("dose");
  }
  function confirmDose(w: number) { setDoseGrams(w); setPhase("ready"); }

  function editFromReady(target: "bean" | "recipe" | "dose") {
    returnToReadyRef.current = true; setPhase(target);
  }

  async function startBrewing() {
    if (!selectedRecipe || doseGrams == null) return;
    flowConsecutiveRef.current = 0;
    setWaterDetected(false); setBrewTimerMs(0);
    setBrewStopped(false); peakWeightRef.current = 0; removalConsecutiveRef.current = 0;
    datapointsRef.current = [];
    // prefill del ajuste con lo que se uso (editable al terminar)
    setTweakGrind(selectedRecipe.grindSize ?? "");
    setTweakDose(String(doseGrams));
    setTweakWater(String(Math.round(selectedRecipe.ratio * doseGrams)));
    setTweakTemp(selectedRecipe.tempCelsius ? String(selectedRecipe.tempCelsius) : "");
    setTweakConsume(String(doseGrams));
    setTweakNotes("");
    if (kettleStatus === "on" && selectedRecipe.tempCelsius > 0) {
      try { await sendKettleTemp(selectedRecipe.tempCelsius); } catch { /* best-effort */ }
    }
    await sendTare();
    setPhase("brewing");
  }

  async function finishBrew() {
    if (selectedRecipe && doseGrams != null) {
      const totalWater = selectedRecipe.ratio * doseGrams;
      try {
        await createBrewSession.mutateAsync({
          recipeId: selectedRecipe.id, recipeName: selectedRecipe.name,
          beanId: selectedBean?.id ?? null, beanName: selectedBean?.name ?? "",
          doseGrams, totalWaterGrams: totalWater, durationMs: brewTimerMs,
          datapoints: datapointsRef.current,
        });
      } catch { /* best-effort */ }
      // guardar el ajuste en el grano (mixto: campos editados + notas).
      // salta la proxima vez que se levante este cafe.
      if (selectedBean) {
        const doseN = parseFloat(tweakDose);
        const waterN = parseFloat(tweakWater);
        const tempN = parseFloat(tweakTemp);
        try {
          await repo.patchCoffeeBean(selectedBean.id, {
            lastTweak: {
              grindSize: tweakGrind.trim() || undefined,
              doseGrams: Number.isFinite(doseN) ? doseN : doseGrams,
              totalWaterGrams: Number.isFinite(waterN) ? waterN : totalWater,
              tempCelsius: Number.isFinite(tempN) ? tempN : (selectedRecipe.tempCelsius || undefined),
              notes: tweakNotes.trim(),
              recipeId: selectedRecipe.id,
              at: new Date().toISOString(),
            },
          });
        } catch { /* best-effort */ }
        // descontar el cafe usado del stock (se auto-marca terminado si llega a 0)
        const usedG = parseFloat(tweakConsume);
        if (Number.isFinite(usedG) && usedG > 0) {
          try { await repo.consumeCoffeeBean(selectedBean.id, usedG); } catch { /* best-effort */ }
        }
      }
    }
    datapointsRef.current = []; setWaterDetected(false); setBrewTimerMs(0);
    setBrewStopped(false); peakWeightRef.current = 0; removalConsecutiveRef.current = 0;
    setTweakNotes(""); setTweakGrind(""); setTweakDose(""); setTweakWater(""); setTweakTemp(""); setTweakConsume("");
    setPhase("home");
  }

  // ── derived ───────────────────────────────────────────────────────────────────
  const timerSec = brewTimerMs / 1000;
  // Steps run in authored order (the order shown in the editor). timeSeconds is each step's
  // DURATION; we advance sequentially by summing durations. We do NOT reorder by it.
  const steps = selectedRecipe?.steps ?? [];
  const currentIdx = waterDetected ? activeStepIdx(steps, timerSec) : 0;
  const currentStep = steps[currentIdx] ?? null;
  const nextStep = steps[currentIdx + 1] ?? null;
  const totalWater = selectedRecipe && doseGrams ? selectedRecipe.ratio * doseGrams : 0;

  // Per-step pour progress (not cumulative)
  const dose = doseGrams ?? 0;
  const cumulativeTarget = currentStep ? resolvedStepTarget(currentStep, steps, currentIdx, dose, totalWater) : null;
  const prevTarget = currentStep ? prevPourCumulative(steps, currentIdx, dose, totalWater) : 0;
  const thisStepAmount = cumulativeTarget; // per-step water (not minus prev — prevTarget is the scale offset)
  const currentWeight = scaleData?.weight ?? 0;
  const stepPoured = Math.max(0, currentWeight - prevTarget);
  const pourPct = thisStepAmount != null && thisStepAmount > 0
    ? Math.min((stepPoured / thisStepAmount) * 100, 100) : 0;

  // Per-step time (seconds): elapsed within the current step / its duration (timeSeconds).
  const stepDur = currentStep ? Math.max(0, Math.round(currentStep.timeSeconds || 0)) : null;
  const stepStart = currentStep ? stepStartTime(steps, currentIdx) : 0;
  const stepElapsedRaw = currentStep ? Math.max(0, Math.floor(timerSec - stepStart)) : 0;
  const stepElapsed = stepDur != null ? Math.min(stepElapsedRaw, stepDur) : stepElapsedRaw;

  const activeBeans = beans.filter(b => !b.deletedAt);

  // ── render ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

      {/* ── SCAN ── */}
      {phase === "scanning" && (() => {
        const keyword = connectingFor === "scale" ? "bookoo" : "pava";
        const named = scanDevices.filter(d => d.name?.toLowerCase().includes(keyword));
        return (
          <div style={{ flex: 1, padding: 16, display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
              <span style={{ fontSize: 15, fontWeight: 700 }}>
                {scanDone ? `${named.length} dispositivo${named.length !== 1 ? "s" : ""} encontrado${named.length !== 1 ? "s" : ""}` : "Buscando…"}
              </span>
              <button className="btn ghost" style={{ fontSize: 12 }} onClick={() => setPhase("home")}>Cancelar</button>
            </div>
            {named.length === 0 && !scanDone && (
              <div style={{ textAlign: "center", padding: "32px 0", color: "var(--fg-subtle)", fontSize: 14 }}>Buscando dispositivos BLE…</div>
            )}
            {named.length === 0 && scanDone && (
              <div style={{ textAlign: "center", padding: "32px 0", color: "var(--fg-subtle)", fontSize: 14, lineHeight: 1.6 }}>
                No se encontraron dispositivos.<br />Verificá que esté encendido y cerca.
              </div>
            )}
            {named.map(d => (
              <button key={d.address} className="btn" style={{ textAlign: "left", padding: "12px 14px", fontSize: 14, flexShrink: 0 }}
                onClick={() => connectingFor === "scale" ? connectScale(d) : connectKettle(d)}>
                <div style={{ fontWeight: 600 }}>{d.name}</div>
                <div style={{ fontSize: 11, color: "var(--fg-muted)", marginTop: 2 }}>{d.address}</div>
              </button>
            ))}
          </div>
        );
      })()}

      {/* ── HOME ── */}
      {phase === "home" && (
        <div style={{ flex: 1, padding: 16, display: "flex", flexDirection: "column", gap: 14, overflowY: "auto" }}>
          {/* connection strips */}
          {[
            { label: "Balanza", name: scaleName, status: scaleStatus, data: scaleData, slot: "scale" as const,
              subtitle: scaleStatus === "on" && scaleData ? `${(scaleData.weight ?? 0).toFixed(1)} g${scaleData.timer_ms ? ` · ${fmtTimer(scaleData.timer_ms)}` : ""}${scaleData.battery != null ? ` · 🔋 ${scaleData.battery}%` : ""}` : null,
              onConnect: () => startScan("scale"), onDisconnect: disconnectScale },
            { label: "Pava Eléctrica", name: kettleName, status: kettleStatus, data: kettleData, slot: "kettle" as const,
              subtitle: kettleStatus === "on" && kettleData ? `${kettleData.temp.toFixed(0)}°C / ${kettleData.target.toFixed(0)}°C` : null,
              onConnect: () => startScan("kettle"), onDisconnect: disconnectKettle },
          ].map(({ label, name, status, slot, subtitle, onConnect, onDisconnect }) => (
            <div key={slot} style={{ background: "var(--bg-sunken)", borderRadius: 10, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <ConnDot on={status === "on"} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {status === "on" ? (name ?? label) : status === "connecting" ? "Conectando…" : label}
                  </div>
                  {subtitle && <div style={{ fontSize: 11, color: "var(--fg-muted)" }}>{subtitle}</div>}
                </div>
              </div>
              {status === "on"
                ? <button className="btn ghost" style={{ fontSize: 12 }} onClick={onDisconnect}>Desconectar</button>
                : <button className="btn" style={{ fontSize: 12 }} disabled={status === "connecting"} onClick={onConnect}>
                    {status === "connecting" ? "…" : "Conectar"}
                  </button>}
            </div>
          ))}

          {error && (
            <div style={{ color: "var(--danger)", fontSize: 13, padding: "8px 10px", borderRadius: 6, background: "color-mix(in srgb, var(--danger) 12%, transparent)" }}>{error}</div>
          )}

          {/* live weight tiles */}
          {scaleStatus === "on" && scaleData && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {[
                { label: "Peso", val: scaleData.weight?.toFixed(1), unit: scaleData.unit },
                { label: "Flow", val: scaleData.flow != null ? Math.abs(scaleData.flow).toFixed(1) : "—", unit: "g/s" },
                { label: "Timer", val: scaleData.timer_ms != null ? fmtTimer(scaleData.timer_ms) : "—:——", unit: "" },
              ].map(({ label, val, unit }) => (
                <div key={label} style={{ background: "var(--bg-sunken)", borderRadius: 10, padding: "14px 10px", textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: "var(--fg-subtle)", marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: label === "Timer" ? 20 : 26, fontWeight: 800, fontFamily: "var(--font-mono)", lineHeight: 1 }}>{val}</div>
                  <div style={{ fontSize: 10, color: "var(--fg-subtle)", marginTop: 2 }}>{unit}</div>
                </div>
              ))}
            </div>
          )}

          {scaleStatus === "on" && (
            <button className="btn ghost" style={{ fontSize: 14, padding: "10px" }} onClick={sendTare}>
              Tara
            </button>
          )}

          <div style={{ flex: 1 }} />

          {scaleStatus === "on"
            ? <button className="btn primary" style={{ fontSize: 17, fontWeight: 800, padding: "16px", borderRadius: 12 }} onClick={goBean}>
                Iniciar Brew
              </button>
            : <div style={{ textAlign: "center", padding: "40px 0", color: "var(--fg-subtle)", fontSize: 14, lineHeight: 1.6 }}>
                Conectá la balanza Bookoo para<br />acceder al brew guiado.
              </div>}
        </div>
      )}

      {/* ── BEAN ── */}
      {phase === "bean" && (
        <div style={{ flex: 1, padding: 16, display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <button className="btn ghost" style={{ fontSize: 12, padding: "6px 10px" }}
              onClick={() => setPhase(returnToReadyRef.current ? "ready" : "home")}>← Volver</button>
            <span style={{ fontSize: 16, fontWeight: 700 }}>¿Qué café usás?</span>
          </div>

          <button className="btn" style={{ textAlign: "left", padding: "12px 14px", fontSize: 14, flexShrink: 0, border: selectedBean === null ? "2px solid var(--accent)" : "2px solid transparent" }}
            onClick={() => setSelectedBean(null)}>
            <div style={{ fontWeight: 600 }}>Sin especificar</div>
          </button>

          {activeBeans.map(b => (
            <button key={b.id} className="btn" style={{ textAlign: "left", padding: "12px 14px", fontSize: 14, flexShrink: 0, border: selectedBean?.id === b.id ? "2px solid var(--accent)" : "2px solid transparent" }}
              onClick={() => setSelectedBean(b)}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontWeight: 600 }}>{b.name}</span>
                {b.lastTweak && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: "var(--accent, #4caf50)", border: "1px solid currentColor", borderRadius: 6, padding: "1px 5px" }}>
                    tiene ajuste
                  </span>
                )}
              </div>
              {b.roaster && <div style={{ fontSize: 11, color: "var(--fg-muted)", marginTop: 2 }}>{b.roaster}{b.country ? ` · ${b.country}` : ""}</div>}
              {b.cataInicial && <div style={{ fontSize: 11, color: "var(--fg-subtle)", marginTop: 2 }}>busco: {b.cataInicial}</div>}
            </button>
          ))}

          {activeBeans.length === 0 && (
            <div style={{ color: "var(--fg-subtle)", fontSize: 13, textAlign: "center", padding: "16px 0" }}>
              No hay cafés cargados. Podés agregar en desktop.
            </div>
          )}

          <div style={{ flex: 1 }} />
          <button className="btn primary" style={{ fontSize: 16, fontWeight: 700, padding: "14px", borderRadius: 12, flexShrink: 0 }} onClick={confirmBean}>
            Siguiente →
          </button>
        </div>
      )}

      {/* ── RECIPE ── */}
      {phase === "recipe" && (
        <div style={{ flex: 1, padding: 16, display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <button className="btn ghost" style={{ fontSize: 12, padding: "6px 10px" }}
              onClick={() => setPhase(returnToReadyRef.current ? "ready" : "bean")}>← Volver</button>
            <span style={{ fontSize: 16, fontWeight: 700 }}>Elegí la receta</span>
          </div>

          {generalRecipes.length === 0 && (
            <div style={{ color: "var(--fg-subtle)", fontSize: 14, textAlign: "center", padding: "20px 0" }}>
              No hay recetas. Creá una en la versión desktop.
            </div>
          )}

          {generalRecipes.map(r => {
            const specific = beanSpecificFor(r, selectedBean?.id ?? null);
            const shown = specific ?? r; // mostramos las variables que se van a usar
            const isSel = selectedRecipe?.id === shown.id;
            return (
              <button key={r.id} className="btn" style={{ textAlign: "left", padding: "12px 14px", fontSize: 14, flexShrink: 0, border: isSel ? "2px solid var(--accent)" : "2px solid transparent" }}
                onClick={() => pickRecipe(r)}>
                <div style={{ fontWeight: 600 }}>
                  {r.name}
                  {specific && <span style={{ fontSize: 10, fontWeight: 700, color: "var(--accent)", marginLeft: 6 }}>✨ ajustada para este café</span>}
                </div>
                <div style={{ fontSize: 11, color: "var(--fg-muted)", marginTop: 2 }}>
                  {shown.tempCelsius}°C · 1:{shown.ratio} · {shown.steps.length} pasos
                </div>
              </button>
            );
          })}

          <div style={{ flex: 1 }} />
          <button className="btn primary" disabled={!selectedRecipe} style={{ fontSize: 16, fontWeight: 700, padding: "14px", borderRadius: 12, flexShrink: 0 }}
            onClick={confirmRecipe}>
            Siguiente →
          </button>
        </div>
      )}

      {/* ── TWEAK (aplicar ultimo ajuste por variable, antes de la dosis) ── */}
      {phase === "tweak" && selectedRecipe && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button className="btn ghost" style={{ fontSize: 12, padding: "6px 10px" }}
                onClick={() => setPhase("recipe")}>← Volver</button>
              <span style={{ fontSize: 16, fontWeight: 700 }}>Último ajuste</span>
            </div>
            <div style={{ fontSize: 13, color: "var(--fg-subtle)" }}>
              Elegí qué variables del último ajuste aplicar a este brew.
            </div>
            {(() => {
              const t = selectedBean?.lastTweak;
              if (!t) return null;
              const rows = [
                { key: "g", on: applyGrind, set: setApplyGrind, label: "Molienda", val: t.grindSize, show: !!t.grindSize },
                { key: "t", on: applyTemp, set: setApplyTemp, label: "Temperatura", val: t.tempCelsius != null ? `${t.tempCelsius}°C` : "", show: t.tempCelsius != null },
                { key: "d", on: applyDose, set: setApplyDose, label: "Dosis", val: t.doseGrams != null ? `${t.doseGrams} g` : "", show: t.doseGrams != null },
                { key: "w", on: applyWater, set: setApplyWater, label: "Agua / ratio", val: (t.totalWaterGrams && t.doseGrams) ? `${t.totalWaterGrams} g (1:${(t.totalWaterGrams / t.doseGrams).toFixed(1)})` : "", show: !!(t.totalWaterGrams && t.doseGrams) },
              ].filter((r) => r.show);
              if (rows.length === 0) return <div style={{ fontSize: 13, color: "var(--fg-muted)" }}>El último ajuste no tiene variables, solo notas.</div>;
              return rows.map((r) => (
                <button key={r.key} onClick={() => r.set(!r.on)}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderRadius: 12, border: r.on ? "2px solid var(--accent)" : "2px solid var(--bg-sunken)", background: "var(--bg-sunken)", textAlign: "left" }}>
                  <div>
                    <div style={{ fontSize: 11, color: "var(--fg-subtle)" }}>{r.label}</div>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>{r.val}</div>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: r.on ? "var(--accent)" : "var(--fg-subtle)" }}>{r.on ? "usar ✓" : "omitir"}</span>
                </button>
              ));
            })()}
            {selectedBean?.lastTweak?.notes && (
              <div style={{ fontSize: 13, color: "var(--fg-muted)", background: "var(--bg-sunken)", borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--fg-subtle)", marginBottom: 4 }}>NOTAS DEL AJUSTE</div>
                {selectedBean.lastTweak.notes}
              </div>
            )}
          </div>
          <div style={{ padding: 16, flexShrink: 0, borderTop: "1px solid var(--border-subtle)", background: "var(--bg)" }}>
            <button className="btn primary" style={{ width: "100%", fontSize: 16, fontWeight: 700, padding: "14px", borderRadius: 12 }}
              onClick={confirmTweak}>
              Siguiente →
            </button>
          </div>
        </div>
      )}

      {/* ── DOSE ── */}
      {phase === "dose" && (
        <div style={{ flex: 1, padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button className="btn ghost" style={{ fontSize: 12, padding: "6px 10px" }}
              onClick={() => setPhase(returnToReadyRef.current ? "ready" : "recipe")}>← Volver</button>
            <span style={{ fontSize: 16, fontWeight: 700 }}>Pesá la dosis</span>
          </div>

          <div style={{ fontSize: 13, color: "var(--fg-subtle)", lineHeight: 1.5 }}>
            Poné el recipiente → Tara → agregá el café molido.
          </div>

          <div style={{ background: "var(--bg-sunken)", borderRadius: 14, padding: "24px", textAlign: "center", flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 8 }}>
            <div style={{ fontSize: 72, fontWeight: 800, fontFamily: "var(--font-mono)", lineHeight: 1 }}>
              {scaleData?.weight != null ? scaleData.weight.toFixed(1) : "—"}
            </div>
            <div style={{ fontSize: 16, color: "var(--fg-subtle)" }}>g</div>
            {selectedRecipe && scaleData?.weight != null && scaleData.weight > 0 && (
              <div style={{ fontSize: 13, color: "var(--fg-muted)", marginTop: 4 }}>
                Agua objetivo: {(scaleData.weight * selectedRecipe.ratio).toFixed(0)} g
              </div>
            )}
          </div>

          <button className="btn ghost" style={{ fontSize: 15, padding: "14px", borderRadius: 10 }} onClick={sendTare}>
            Tara
          </button>

          <button className="btn primary" disabled={scaleData?.weight == null || (scaleData.weight ?? 0) <= 0}
            style={{ fontSize: 17, fontWeight: 800, padding: "16px", borderRadius: 12 }}
            onClick={() => confirmDose(scaleData?.weight ?? 0)}
          >
            Confirmar {scaleData?.weight != null && scaleData.weight > 0 ? `${scaleData.weight.toFixed(1)} g` : "dosis"}
          </button>
        </div>
      )}

      {/* ── READY ── */}
      {phase === "ready" && selectedRecipe && doseGrams != null && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
         <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <button className="btn ghost" style={{ fontSize: 12, padding: "6px 10px" }}
              onClick={() => setPhase("dose")}>← Editar</button>
            <span style={{ fontSize: 16, fontWeight: 700 }}>Listo para arrancar</span>
          </div>

          {/* summary card */}
          <div style={{ background: "var(--bg-sunken)", borderRadius: 14, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              { label: "Café", value: selectedBean?.name ?? "Sin especificar", sub: selectedBean?.roaster, editTarget: "bean" as const },
              { label: "Receta", value: selectedRecipe.name, sub: `${selectedRecipe.tempCelsius}°C · 1:${selectedRecipe.ratio} · ${selectedRecipe.steps.length} pasos`, editTarget: "recipe" as const },
              { label: "Dosis", value: `${doseGrams.toFixed(1)} g`, sub: `Agua: ${totalWater.toFixed(0)} g`, editTarget: "dose" as const },
            ].map(({ label, value, sub, editTarget }) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 11, color: "var(--fg-subtle)", marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{value}</div>
                  {sub && <div style={{ fontSize: 11, color: "var(--fg-muted)" }}>{sub}</div>}
                </div>
                <button className="btn ghost" style={{ fontSize: 12, padding: "4px 10px" }}
                  onClick={() => editFromReady(editTarget)}>
                  Editar
                </button>
              </div>
            ))}

            {kettleStatus === "on" && kettleData && (
              <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 11, color: "var(--fg-subtle)", marginBottom: 2 }}>Pava</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>
                    <KettleIcon state={kettleData.state} /> {kettleData.temp.toFixed(0)}°C → {selectedRecipe.tempCelsius}°C
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ultimo ajuste guardado de este grano */}
          {selectedBean?.lastTweak && (
            <div style={{ background: "color-mix(in srgb, var(--accent, #4caf50) 12%, transparent)", borderRadius: 12, padding: "12px 14px", fontSize: 13 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent, #4caf50)", marginBottom: 4 }}>ÚLTIMO AJUSTE DE ESTE CAFÉ</div>
              <div style={{ color: "var(--fg-muted)" }}>
                {selectedBean.lastTweak.grindSize ? `molienda ${selectedBean.lastTweak.grindSize}` : ""}
                {selectedBean.lastTweak.doseGrams ? ` · ${selectedBean.lastTweak.doseGrams}g` : ""}
                {selectedBean.lastTweak.tempCelsius ? ` · ${selectedBean.lastTweak.tempCelsius}°C` : ""}
              </div>
              {selectedBean.lastTweak.notes && <div style={{ marginTop: 4 }}>{selectedBean.lastTweak.notes}</div>}
            </div>
          )}

          {/* steps preview */}
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-subtle)" }}>Pasos</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {selectedRecipe.steps.map((s, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "6px 10px", background: "var(--bg-sunken)", borderRadius: 8 }}>
                <span>
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: s.type === "pour" ? "var(--accent, #4caf50)" : "var(--fg-subtle)", marginRight: 6 }}>
                    {s.type === "pour" ? "vertida" : "acción"}
                  </span>
                  {s.description || (s.type === "pour" ? "Verter" : "Esperar")}
                  {s.type === "pour" && s.waterRatio != null && doseGrams != null && (
                    <span style={{ color: "var(--fg-subtle)" }}> · {(s.waterRatio * doseGrams).toFixed(0)} g</span>
                  )}
                </span>
                <span style={{ color: "var(--fg-subtle)", fontFamily: "var(--font-mono)", fontSize: 12 }}>{fmtTimer(s.timeSeconds * 1000)}</span>
              </div>
            ))}
          </div>

         </div>
         <div style={{ padding: 16, flexShrink: 0, borderTop: "1px solid var(--border-subtle)", background: "var(--bg)" }}>
           <SlideToStart onStart={startBrewing} />
         </div>
        </div>
      )}

      {/* ── BREWING ── */}
      {phase === "brewing" && (
        <div style={{ flex: 1, padding: 16, display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" }}>

          {/* auto-stop: filtro removido */}
          {brewStopped && (
            <div style={{ background: "color-mix(in srgb, var(--accent, #4caf50) 14%, transparent)", border: "1px solid var(--accent, #4caf50)", borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--accent, #4caf50)" }}>
                ☕ Sacaste el filtro — brew detenido
              </div>
              <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 4 }}>
                Finalizá para guardar la sesión.
              </div>
            </div>
          )}

          {/* per-step timer (elapsed / duration of the current step) */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontWeight: 800, display: "flex", alignItems: "baseline", gap: 3 }}>
              <span style={{ fontSize: 48 }}>{stepElapsed}</span>
              {stepDur != null && <span style={{ fontSize: 26, color: "var(--fg-muted)" }}>/{stepDur}</span>}
              <span style={{ fontSize: 16, color: "var(--fg-muted)" }}>seg</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
              {scaleData?.battery != null && <span style={{ fontSize: 11, color: "var(--fg-muted)" }}>🔋 {scaleData.battery}%</span>}
              {kettleStatus === "on" && kettleData && (
                <span style={{ fontSize: 11, color: "var(--fg-muted)" }}><KettleIcon state={kettleData.state} /> {kettleData.temp.toFixed(0)}°C</span>
              )}
            </div>
          </div>

          {/* waiting for water */}
          {!waterDetected && (
            <div style={{ background: "var(--bg-sunken)", borderRadius: 12, padding: "20px", textAlign: "center" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>💧</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>Esperando agua…</div>
              <div style={{ fontSize: 13, color: "var(--fg-muted)", marginTop: 4 }}>
                El timer arranca cuando detecte el primer vertido.
              </div>
            </div>
          )}

          {/* current step */}
          {waterDetected && currentStep && (
            <>
              <div style={{ fontSize: 12, color: "var(--fg-subtle)" }}>
                Paso {currentIdx + 1} de {steps.length}
              </div>
              <div style={{ background: "var(--bg-sunken)", borderRadius: 12, padding: "16px", display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: currentStep.type === "pour" ? "var(--accent, #4caf50)" : "var(--fg-subtle)" }}>
                    {currentStep.type === "pour" ? "Vertida" : "Acción"}
                  </span>
                </div>
                {/* what to do */}
                <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.3, textAlign: "center" }}>
                  {currentStep.description || (currentStep.type === "pour" ? "Verter" : "Esperar")}
                </div>
                {currentStep.type === "pour" && thisStepAmount != null && (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
                      <span style={{ color: "var(--fg-muted)" }}>{stepPoured.toFixed(1)} g</span>
                      <span style={{ fontWeight: 700 }}>{thisStepAmount.toFixed(0)} g</span>
                    </div>
                    <div style={{ background: "var(--bg-base)", borderRadius: 6, height: 10, overflow: "hidden" }}>
                      <div style={{ height: "100%", borderRadius: 6, background: "var(--accent, #4caf50)", width: `${pourPct}%`, transition: "width 0.2s" }} />
                    </div>
                    {scaleData?.flow != null && (
                      <div style={{ fontSize: 13, color: "var(--fg-muted)" }}>
                        Flow: {Math.abs(scaleData.flow).toFixed(1)} g/s
                        <FlowBand flow={scaleData.flow} target={currentStep.flowTarget} />
                      </div>
                    )}
                  </>
                )}
              </div>

              {nextStep && (
                <div style={{ background: "var(--bg-base)", borderRadius: 10, padding: "12px 14px", opacity: 0.7, display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13 }}>
                    <span style={{ color: "var(--fg-subtle)", marginRight: 6 }}>Siguiente:</span>
                    {nextStep.description || (nextStep.type === "pour" ? "Vertida" : "Paso")}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--fg-subtle)", fontFamily: "var(--font-mono)" }}>{fmtTimer(nextStep.timeSeconds * 1000)}</span>
                </div>
              )}
              {!nextStep && (
                <div style={{ fontSize: 14, color: "var(--fg-subtle)", textAlign: "center", padding: "8px 0" }}>Último paso</div>
              )}
            </>
          )}

          <div style={{ flex: 1 }} />
          {selectedBean && (
            <div style={{ background: "var(--bg-sunken)", borderRadius: 12, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--fg-subtle)" }}>
                Ajuste para la próxima (sale al levantar este café)
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <label style={{ fontSize: 11, color: "var(--fg-muted)", display: "flex", flexDirection: "column", gap: 2 }}>
                  Molienda
                  <input className="input" value={tweakGrind} placeholder="ej. 18 / medio-fino"
                    onChange={(e) => setTweakGrind(e.target.value)} />
                </label>
                <label style={{ fontSize: 11, color: "var(--fg-muted)", display: "flex", flexDirection: "column", gap: 2 }}>
                  Dosis (g)
                  <input className="input" type="number" inputMode="decimal" value={tweakDose}
                    onChange={(e) => setTweakDose(e.target.value)} />
                </label>
                <label style={{ fontSize: 11, color: "var(--fg-muted)", display: "flex", flexDirection: "column", gap: 2 }}>
                  Agua (g)
                  <input className="input" type="number" inputMode="decimal" value={tweakWater}
                    onChange={(e) => setTweakWater(e.target.value)} />
                </label>
                <label style={{ fontSize: 11, color: "var(--fg-muted)", display: "flex", flexDirection: "column", gap: 2 }}>
                  Temp (°C)
                  <input className="input" type="number" inputMode="decimal" value={tweakTemp}
                    onChange={(e) => setTweakTemp(e.target.value)} />
                </label>
              </div>
              <label style={{ fontSize: 11, color: "var(--fg-muted)", display: "flex", flexDirection: "column", gap: 2 }}>
                Café usado (g) — se descuenta del stock
                <input className="input" type="number" inputMode="decimal" value={tweakConsume}
                  onChange={(e) => setTweakConsume(e.target.value)} />
              </label>
              <textarea
                className="input"
                value={tweakNotes}
                rows={2}
                style={{ resize: "vertical", fontSize: 13 }}
                placeholder="Notas (ej. quedó ácido, moler más fino la próxima)…"
                onChange={(e) => setTweakNotes(e.target.value)}
              />
            </div>
          )}
          <button className="btn ghost" style={{ fontSize: 14, padding: "12px", borderRadius: 10 }} onClick={finishBrew}>
            Finalizar brew
          </button>
        </div>
      )}
    </div>
  );
}
