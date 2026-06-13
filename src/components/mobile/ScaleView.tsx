import { useState, useEffect, useRef, useCallback } from "react";
import {
  scanForScales, bleConnect, bleDisconnect,
  subscribeToScale, unsubscribeFromScale, sendTareStart,
  type BleDevice, type ScaleData,
} from "../../lib/ble";

function fmtTimer(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function FlowBand({ flow, target }: { flow: number | null; target?: number }) {
  if (flow == null) return null;
  const abs = Math.abs(flow);
  const tgt = target ?? 3;
  const lo = tgt * 0.7;
  const hi = tgt * 1.3;
  const label = abs < lo ? "lento" : abs > hi ? "rápido" : "bien";
  const color = label === "bien" ? "#4caf50" : label === "rápido" ? "var(--danger)" : "#ff9800";
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color, marginLeft: 4 }}>
      {label}
    </span>
  );
}

export function ScaleView() {
  const [phase, setPhase] = useState<"idle" | "scanning" | "devices" | "connecting" | "live">("idle");
  const [devices, setDevices] = useState<BleDevice[]>([]);
  const [data, setData] = useState<ScaleData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanDone, setScanDone] = useState(false);
  const scanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
    };
  }, []);

  const handleDevices = useCallback((found: BleDevice[]) => {
    setDevices(found);
    if (found.length > 0) setPhase("devices");
  }, []);

  async function scan() {
    setError(null);
    setDevices([]);
    setScanDone(false);
    setPhase("scanning");
    try {
      await scanForScales(handleDevices, 8000);
      setScanDone(true);
      setPhase((prev) => prev === "scanning" ? "idle" : prev);
    } catch (e) {
      setPhase("idle");
      setError(String(e));
    }
  }

  async function connect(device: BleDevice) {
    setError(null);
    setPhase("connecting");
    try {
      await bleConnect(device.address, () => {
        setPhase("idle");
        setData(null);
        unsubscribeFromScale().catch(() => {});
      });
      await subscribeToScale((d) => setData(d));
      setPhase("live");
    } catch (e) {
      setPhase("idle");
      setError(String(e));
    }
  }

  async function disconnect() {
    try {
      await unsubscribeFromScale();
      await bleDisconnect();
    } catch (e) {
      setError(String(e));
    }
    setPhase("idle");
    setData(null);
  }

  async function tareStart() {
    setError(null);
    try {
      await sendTareStart();
    } catch (e) {
      setError(String(e));
    }
  }

  const isLive = phase === "live";

  return (
    <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 16, minHeight: "100%" }}>

      {/* Status bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            width: 10, height: 10, borderRadius: "50%", display: "inline-block", flexShrink: 0,
            background: isLive ? "#4caf50" : phase === "scanning" || phase === "connecting" ? "#ff9800" : "var(--fg-subtle)",
          }} />
          <span style={{ fontSize: 14, fontWeight: 600 }}>
            {isLive ? "Balanza conectada"
              : phase === "scanning"
                ? `Buscando… ${devices.length > 0 ? `(${devices.length} encontrado${devices.length > 1 ? "s" : ""})` : ""}`
              : phase === "connecting" ? "Conectando…"
              : "Sin balanza"}
          </span>
        </div>
        {isLive ? (
          <button className="btn ghost" style={{ fontSize: 12 }} onClick={disconnect}>
            Desconectar
          </button>
        ) : (
          <button className="btn primary" style={{ fontSize: 12 }}
            onClick={scan} disabled={phase === "scanning" || phase === "connecting"}>
            {phase === "scanning" ? "Buscando…" : "Buscar balanza"}
          </button>
        )}
      </div>

      {error && (
        <div style={{
          color: "var(--danger)", fontSize: 13, padding: "8px 10px",
          background: "color-mix(in srgb, var(--danger) 12%, transparent)", borderRadius: 6,
        }}>
          {error}
        </div>
      )}

      {/* Device list */}
      {phase === "devices" && devices.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontSize: 12, color: "var(--fg-muted)" }}>Dispositivos encontrados:</span>
          {devices.map((d) => (
            <button key={d.address} className="btn" onClick={() => connect(d)}
              style={{ textAlign: "left", padding: "12px 14px", fontSize: 14 }}>
              {d.name || d.address}
            </button>
          ))}
        </div>
      )}

      {/* Live data */}
      {isLive && (
        <>
          <div style={{
            background: "var(--bg-sunken)", borderRadius: 14, padding: "20px",
            textAlign: "center",
          }}>
            <div style={{ fontSize: 12, color: "var(--fg-subtle)", marginBottom: 6 }}>Peso</div>
            <div style={{ fontSize: 56, fontWeight: 800, fontFamily: "var(--font-mono)", lineHeight: 1 }}>
              {data?.weight != null ? data.weight.toFixed(1) : "—"}
            </div>
            <div style={{ fontSize: 14, color: "var(--fg-subtle)", marginTop: 4 }}>
              {data?.unit ?? "g"}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div style={{ background: "var(--bg-sunken)", borderRadius: 10, padding: "12px", textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "var(--fg-subtle)", marginBottom: 4 }}>Flow</div>
              <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "var(--font-mono)" }}>
                {data?.flow != null ? Math.abs(data.flow).toFixed(1) : "—"}
              </div>
              <div style={{ fontSize: 11, color: "var(--fg-subtle)" }}>
                g/s <FlowBand flow={data?.flow ?? null} />
              </div>
            </div>
            <div style={{ background: "var(--bg-sunken)", borderRadius: 10, padding: "12px", textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "var(--fg-subtle)", marginBottom: 4 }}>Tiempo</div>
              <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "var(--font-mono)" }}>
                {data?.timer_ms != null ? fmtTimer(data.timer_ms) : "—:——"}
              </div>
            </div>
            <div style={{ background: "var(--bg-sunken)", borderRadius: 10, padding: "12px", textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "var(--fg-subtle)", marginBottom: 4 }}>Batería</div>
              <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "var(--font-mono)" }}>
                {data?.battery != null ? `${data.battery}%` : "—"}
              </div>
            </div>
          </div>

          <button className="btn primary" onClick={tareStart}
            style={{ padding: "16px", fontSize: 18, fontWeight: 800, borderRadius: 12 }}>
            Tara + Start
          </button>
        </>
      )}

      {phase === "idle" && !error && (
        <div style={{ textAlign: "center", padding: "40px 0", color: "var(--fg-subtle)", fontSize: 14, lineHeight: 1.6 }}>
          {scanDone && devices.length === 0
            ? <>No se encontraron dispositivos.<br />Verificá que la balanza esté encendida y cerca.</>
            : <>Encendé la balanza Bookoo<br />y presioná "Buscar balanza"</>
          }
        </div>
      )}
    </div>
  );
}
