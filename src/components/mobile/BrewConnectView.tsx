import { useEffect, type CSSProperties } from "react";
import type { CoffeeBean, CoffeeRecipe } from "../../types";
import { waterFor, type CafeDevices, type DeviceSlot } from "./cafeFlow";

/* Café · Conexión (balanza + pava) — paso PROPIO del flujo, decisión del
 * usuario (2026-08-16). Va DESPUÉS de elegir grano, receta, dosis y tweaks.
 *
 * Es el scan/conexión que vivía en las fases `home` / `scanning` de `BrewView`
 * (mismos strips, mismo filtro por nombre, mismos tiles de peso en vivo),
 * REUBICADO — no reescrito.
 *
 * Dos cosas propias de este paso:
 *  · Al conectarse la pava empieza a calentar SOLA, a la temperatura de la
 *    receta efectiva. Antes eso lo disparaba `confirmRecipe()` en `BrewView`.
 *  · El usuario toca "Continuar" y recién ahí se entra al brew (COMPUERTA).
 *
 * El scan NO se `await`-ea desde el CTA: `scanForScales` bloquea los 8 s
 * completos y hasta ~20 s más si Android pide permisos. `startScan` es
 * fire-and-forget y esta pantalla muestra el progreso. */

function fmtTimer(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const KETTLE_STATE_ICON: Record<string, string> = { heating: "🔥", hold: "✓", cooling: "↓", idle: "○" };

export function BrewConnectView({ bean, recipe, doseGrams, devices, onBack, onContinue }: {
  bean: CoffeeBean | null;
  /** Receta EFECTIVA (específica del grano + ajuste aplicado). */
  recipe: CoffeeRecipe;
  doseGrams: number;
  devices: CafeDevices;
  onBack: () => void;
  onContinue: () => void;
}) {
  const {
    scaleStatus, kettleStatus, scaleData, kettleData, scaleName, kettleName,
    error, scanFor, scanDevices, scanDone, startScan, cancelScan,
    connectScale, connectKettle, disconnectScale, disconnectKettle, heatKettle,
  } = devices;

  const water = waterFor(recipe, doseGrams);
  const targetTemp = recipe.tempCelsius;

  // La pava calienta sola apenas se conecta (y si cambia la temperatura de la
  // receta efectiva, se re-manda). Best-effort: `heatKettle` no hace nada si la
  // pava está desconectada o la receta no trae temperatura.
  useEffect(() => {
    if (kettleStatus === "on") heatKettle(targetTemp);
  }, [kettleStatus, targetTemp, heatKettle]);

  // ── lista de scan ──────────────────────────────────────────────────────────
  if (scanFor) {
    const keyword = scanFor === "scale" ? "bookoo" : "pava";
    const named = scanDevices.filter((d) => d.name?.toLowerCase().includes(keyword));
    return (
      <div className="m-screen">
        <header className="m-scr-head">
          <div className="m-scr-head-row">
            <div className="m-scr-titles">
              <div className="m-scr-title">
                {scanDone
                  ? `${named.length} dispositivo${named.length !== 1 ? "s" : ""} encontrado${named.length !== 1 ? "s" : ""}`
                  : "Buscando…"}
              </div>
              <div className="m-scr-sub">{scanFor === "scale" ? "Balanza Bookoo" : "Pava eléctrica"}</div>
            </div>
            <button type="button" className="m-brew-ghost" onClick={cancelScan}>Cancelar</button>
          </div>
        </header>
        <div className="m-scroll" style={{ "--m-scroll-gap": "10px" } as CSSProperties}>
          {named.length === 0 && !scanDone && <div className="m-empty">Buscando dispositivos BLE…</div>}
          {named.length === 0 && scanDone && (
            <div className="m-empty">No se encontraron dispositivos.<br />Verificá que esté encendido y cerca.</div>
          )}
          {named.map((d) => (
            <button
              key={d.address}
              type="button"
              className="m-brew-dev"
              onClick={() => void (scanFor === "scale" ? connectScale(d) : connectKettle(d))}
            >
              <span className="m-brew-dev-name">{d.name}</span>
              <span className="m-brew-dev-addr m-mono">{d.address}</span>
            </button>
          ))}
          <div className="m-scroll-tail" />
        </div>
      </div>
    );
  }

  const strips: {
    slot: DeviceSlot; label: string; name: string | null; status: string;
    subtitle: string | null; onConnect: () => void; onDisconnect: () => void;
  }[] = [
    {
      slot: "scale", label: "Balanza", name: scaleName, status: scaleStatus,
      subtitle: scaleStatus === "on" && scaleData
        ? `${(scaleData.weight ?? 0).toFixed(1)} g${scaleData.timer_ms ? ` · ${fmtTimer(scaleData.timer_ms)}` : ""}${scaleData.battery != null ? ` · 🔋 ${scaleData.battery}%` : ""}`
        : null,
      onConnect: () => startScan("scale"), onDisconnect: () => void disconnectScale(),
    },
    {
      slot: "kettle", label: "Pava eléctrica", name: kettleName, status: kettleStatus,
      subtitle: kettleStatus === "on" && kettleData
        ? `${KETTLE_STATE_ICON[kettleData.state] ?? ""} ${kettleData.temp.toFixed(0)}°C / ${kettleData.target.toFixed(0)}°C`
        : null,
      onConnect: () => startScan("kettle"), onDisconnect: () => void disconnectKettle(),
    },
  ];

  return (
    <div className="m-screen">
      <header className="m-scr-head">
        <div className="m-scr-head-row">
          <button type="button" className="m-brew-back" onClick={onBack} aria-label="Volver">‹</button>
          <div className="m-scr-titles">
            <div className="m-scr-title">Conectá los equipos</div>
            <div className="m-scr-sub">
              {bean ? `${bean.name} · ` : ""}{recipe.name} · {doseGrams.toFixed(1)} g · {water} g agua
            </div>
          </div>
        </div>
      </header>

      <div className="m-scroll" style={{ "--m-scroll-pt": "14px", "--m-scroll-gap": "12px" } as CSSProperties}>
        {strips.map((s) => (
          <div key={s.slot} className="m-brew-conn">
            <span className={`m-brew-dot${s.status === "on" ? " is-on" : ""}`} />
            <div className="m-brew-conn-txt">
              <div className="m-brew-conn-name">
                {s.status === "on" ? (s.name ?? s.label) : s.status === "connecting" ? "Conectando…" : s.label}
              </div>
              {s.subtitle && <div className="m-brew-conn-sub m-mono">{s.subtitle}</div>}
            </div>
            {s.status === "on"
              ? <button type="button" className="m-brew-ghost" onClick={s.onDisconnect}>Desconectar</button>
              : <button type="button" className="m-brew-ghost is-primary" disabled={s.status === "connecting"} onClick={s.onConnect}>
                  {s.status === "connecting" ? "…" : "Conectar"}
                </button>}
          </div>
        ))}

        {kettleStatus === "on" && targetTemp > 0 && (
          <div className="m-brew-kettle-note">
            La pava está calentando sola a <b className="m-mono">{targetTemp}°C</b>
            {kettleData ? <> — va por <b className="m-mono">{kettleData.temp.toFixed(0)}°C</b></> : null}.
          </div>
        )}

        {error && <div className="m-brew-error">{error}</div>}

        {scaleStatus === "on" && scaleData && (
          <div className="m-brew-tiles">
            {[
              { label: "Peso", val: (scaleData.weight ?? 0).toFixed(1), unit: scaleData.unit },
              { label: "Flow", val: scaleData.flow != null ? Math.abs(scaleData.flow).toFixed(1) : "—", unit: "g/s" },
              { label: "Timer", val: scaleData.timer_ms != null ? fmtTimer(scaleData.timer_ms) : "—:——", unit: "" },
            ].map((t) => (
              <div key={t.label} className="m-brew-tile">
                <div className="m-brew-tile-label">{t.label}</div>
                <div className="m-brew-tile-val m-mono">{t.val}</div>
                <div className="m-brew-tile-unit">{t.unit}</div>
              </div>
            ))}
          </div>
        )}

        {scaleStatus !== "on" && (
          <div className="m-empty">
            Conectá la balanza Bookoo para<br />acceder al brew guiado.
          </div>
        )}

        <div className="m-scroll-tail" />
      </div>

      <div className="m-brew-footer">
        {/* COMPUERTA: igual que hoy, no se entra al brew sin balanza (sin ella
            el cronómetro no arranca — el timer se dispara por detección de
            flujo — y no hay progreso de peso).
            TODO(usuario): si se quiere brew manual sin balanza, es acá. */}
        <button type="button" className="m-brew-cta" disabled={scaleStatus !== "on"} onClick={onContinue}>
          Continuar
        </button>
      </div>
    </div>
  );
}
