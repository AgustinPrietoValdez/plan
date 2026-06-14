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
type Phase = "home" | "scanning" | "bean" | "recipe" | "dose" | "ready" | "brewing";

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
  const returnToReadyRef = useRef(false);

  // ── brewing ──
  const [waterDetected, setWaterDetected] = useState(false);
  const [brewTimerMs, setBrewTimerMs] = useState(0);
  const brewTimerStartRef = useRef(0);
  const flowConsecutiveRef = useRef(0);
  const datapointsRef = useRef<Omit<BrewDatapoint, "id" | "sessionId">[]>([]);

  const [error, setError] = useState<string | null>(null);

  const { data: recipes = [] } = useCoffeeRecipes();
  const { data: beans = [] } = useCoffeeBeans();
  const createBrewSession = useCreateBrewSession();

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

  // ── brew timer ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "brewing" || !waterDetected) return;
    const id = setInterval(() => setBrewTimerMs(Date.now() - brewTimerStartRef.current), 100);
    return () => clearInterval(id);
  }, [phase, waterDetected]);

  // mantener un ref fresco de la balanza para el muestreo (sin depender de renders)
  useEffect(() => { scaleDataRef.current = scaleData; }, [scaleData]);

  // ── datapoint sampling ~10Hz ─────────────────────────────────────────────────
  // El intervalo se crea UNA sola vez al arrancar el brew y lee de refs. Antes tenia
  // scaleData/brewTimerMs en las deps -> se destruia/recreaba ~10 veces por segundo
  // y casi nunca llegaba a disparar (quedaban ~20 puntos en vez de ~1300), por eso el
  // grafico salia con picos rectos en vez de la curva real.
  useEffect(() => {
    if (phase !== "brewing" || !waterDetected || !selectedRecipe) return;
    const steps = selectedRecipe.steps;
    const id = setInterval(() => {
      const sd = scaleDataRef.current;
      if (!sd) return;
      const timerMs = Date.now() - brewTimerStartRef.current;
      const stepIdx = activeStepIdx(steps, timerMs / 1000);
      datapointsRef.current.push({ timerMs, weightG: sd.weight, flowGs: sd.flow, stepIdx });
    }, 100);
    return () => clearInterval(id);
  }, [phase, waterDetected, selectedRecipe]);

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
  function confirmRecipe() { setPhase(returnToReadyRef.current ? "ready" : "dose"); returnToReadyRef.current = false; }
  function confirmDose(w: number) { setDoseGrams(w); setPhase("ready"); }

  function editFromReady(target: "bean" | "recipe" | "dose") {
    returnToReadyRef.current = true; setPhase(target);
  }

  async function startBrewing() {
    if (!selectedRecipe || doseGrams == null) return;
    flowConsecutiveRef.current = 0;
    setWaterDetected(false); setBrewTimerMs(0);
    datapointsRef.current = [];
    // prefill del ajuste con lo que se uso (editable al terminar)
    setTweakGrind(selectedRecipe.grindSize ?? "");
    setTweakDose(String(doseGrams));
    setTweakWater(String(Math.round(selectedRecipe.ratio * doseGrams)));
    setTweakTemp(selectedRecipe.tempCelsius ? String(selectedRecipe.tempCelsius) : "");
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
      }
    }
    datapointsRef.current = []; setWaterDetected(false); setBrewTimerMs(0);
    setTweakNotes(""); setTweakGrind(""); setTweakDose(""); setTweakWater(""); setTweakTemp("");
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

          {recipes.length === 0 && (
            <div style={{ color: "var(--fg-subtle)", fontSize: 14, textAlign: "center", padding: "20px 0" }}>
              No hay recetas. Creá una en la versión desktop.
            </div>
          )}

          {recipes.map(r => (
            <button key={r.id} className="btn" style={{ textAlign: "left", padding: "12px 14px", fontSize: 14, flexShrink: 0, border: selectedRecipe?.id === r.id ? "2px solid var(--accent)" : "2px solid transparent" }}
              onClick={() => setSelectedRecipe(r)}>
              <div style={{ fontWeight: 600 }}>{r.name}</div>
              <div style={{ fontSize: 11, color: "var(--fg-muted)", marginTop: 2 }}>
                {r.tempCelsius}°C · 1:{r.ratio} · {r.steps.length} pasos
              </div>
            </button>
          ))}

          <div style={{ flex: 1 }} />
          <button className="btn primary" disabled={!selectedRecipe} style={{ fontSize: 16, fontWeight: 700, padding: "14px", borderRadius: 12, flexShrink: 0 }}
            onClick={confirmRecipe}>
            Siguiente →
          </button>
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
        <div style={{ flex: 1, padding: 16, display: "flex", flexDirection: "column", gap: 14, overflowY: "auto" }}>
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

          <div style={{ flex: 1 }} />
          <SlideToStart onStart={startBrewing} />
        </div>
      )}

      {/* ── BREWING ── */}
      {phase === "brewing" && (
        <div style={{ flex: 1, padding: 16, display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" }}>

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
