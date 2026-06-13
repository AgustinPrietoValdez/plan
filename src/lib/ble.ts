import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface BleDevice {
    address: string;
    name: string | null;
}

export interface ScaleData {
    weight: number | null;
    flow: number | null;
    timer_ms: number | null;
    battery: number | null;
    unit: string;
}

function parseWeightPacket(data: number[]): ScaleData | null {
    if (data.length < 20) return null;
    if (data[0] !== 0x03 || data[1] !== 0x0b) return null;
    let checksum = 0;
    for (let i = 0; i < 19; i++) checksum ^= data[i];
    if (checksum !== data[19]) return null;
    const timer_ms = (data[2] << 16) | (data[3] << 8) | data[4];
    const unit = data[5] === 1 ? "oz" : "g";
    const weightRaw = (data[7] << 16) | (data[8] << 8) | data[9];
    const weightSign = data[6] === 0x2d || data[6] === 0x01 ? -1 : 1;
    const weight = (weightSign * weightRaw) / 100;
    const flowRaw = (data[11] << 8) | data[12];
    const flowSign = data[10] === 0x2d || data[10] === 0x01 ? -1 : 1;
    const flow = (flowSign * flowRaw) / 100;
    return { weight, flow, timer_ms, battery: data[13], unit };
}

let notifUnlisten: UnlistenFn | null = null;

export async function scanForScales(
    onDevices: (devices: BleDevice[]) => void,
    timeoutMs = 5000,
): Promise<void> {
    const hasPerms = await invoke<boolean>("ble_check_permissions");
    if (!hasPerms) {
        await invoke("ble_request_permissions");
        await new Promise<void>((r) => setTimeout(r, 500));
        const granted = await invoke<boolean>("ble_check_permissions");
        if (!granted) {
            throw new Error(
                "Permisos BLE denegados. Habilitá Bluetooth y los permisos de la app en Configuración.",
            );
        }
    }

    let scanFailed = false;
    const unlisten = await listen<string>("ble-scan-update", (event) => {
        try {
            const payload = JSON.parse(event.payload);
            if (Array.isArray(payload)) {
                onDevices(payload as BleDevice[]);
            } else if (payload && typeof payload.scanError === "number") {
                scanFailed = true;
            }
        } catch { /* ignore */ }
    });

    try {
        await invoke("ble_start_scan", { timeoutMs });
        await new Promise<void>((r) => setTimeout(r, timeoutMs));
    } finally {
        unlisten();
    }

    if (scanFailed) {
        throw new Error(
            "El escaneo BLE falló. Desactivá y volvé a activar Bluetooth e intentá de nuevo.",
        );
    }
}

export async function bleConnect(
    address: string,
    onDisconnect: () => void,
): Promise<void> {
    const unlistenDisc = await listen("ble-disconnected", () => {
        unlistenDisc();
        onDisconnect();
    });
    try {
        await invoke("ble_connect_and_subscribe", { address });
    } catch (e) {
        unlistenDisc();
        throw e;
    }
}

export async function bleDisconnect(): Promise<void> {
    await invoke("ble_disconnect");
}

export async function subscribeToScale(
    onData: (data: ScaleData) => void,
): Promise<void> {
    notifUnlisten?.();
    notifUnlisten = await listen<string>("ble-notification", (event) => {
        try {
            const raw = JSON.parse(event.payload) as number[];
            const parsed = parseWeightPacket(raw);
            if (parsed) onData(parsed);
        } catch { /* ignore */ }
    });
}

export async function unsubscribeFromScale(): Promise<void> {
    notifUnlisten?.();
    notifUnlisten = null;
}

export async function sendTareStart(): Promise<void> {
    await invoke("ble_send_command", { data: [0x03, 0x0a, 0x07, 0x00, 0x00, 0x00] });
}

export async function sendTare(): Promise<void> {
    await invoke("ble_send_command", { data: [0x03, 0x0a, 0x01, 0x00, 0x00, 0x08] });
}

export async function sendStartTimer(): Promise<void> {
    await invoke("ble_send_command", { data: [0x03, 0x0a, 0x04, 0x00, 0x00, 0x0a] });
}

// ── Kettle (Pava Eléctrica) ──────────────────────────────────────────────────

export interface KettleData {
    /** 0=calentando 1=hold 2=enfriando 4=idle */
    state: "heating" | "hold" | "cooling" | "idle";
    temp: number;
    target: number;
}

let kettleNotifUnlisten: UnlistenFn | null = null;

function parseKettleNotif(bytes: number[]): KettleData | null {
    // Pava sends ASCII "estado:tempActual:objetivo", e.g. "0:83:93"
    const text = String.fromCharCode(...bytes);
    const parts = text.trim().split(":");
    if (parts.length < 3) return null;
    const stateNum = parseInt(parts[0]);
    const temp = parseFloat(parts[1]);
    const target = parseFloat(parts[2]);
    if (isNaN(stateNum) || isNaN(temp) || isNaN(target)) return null;
    const state: KettleData["state"] =
        stateNum === 0 ? "heating" :
        stateNum === 1 ? "hold" :
        stateNum === 2 ? "cooling" : "idle";
    return { state, temp, target };
}

export async function kettleConnect(
    address: string,
    onDisconnect: () => void,
): Promise<void> {
    const unlistenDisc = await listen("kettle-disconnected", () => {
        unlistenDisc();
        onDisconnect();
    });
    try {
        await invoke("kettle_connect_and_subscribe", { address });
    } catch (e) {
        unlistenDisc();
        throw e;
    }
}

export async function kettleDisconnect(): Promise<void> {
    await invoke("kettle_disconnect");
}

export async function subscribeToKettle(
    onData: (data: KettleData) => void,
): Promise<void> {
    kettleNotifUnlisten?.();
    kettleNotifUnlisten = await listen<string>("kettle-notification", (event) => {
        try {
            const raw = JSON.parse(event.payload) as number[];
            const parsed = parseKettleNotif(raw);
            if (parsed) onData(parsed);
        } catch { /* ignore */ }
    });
}

export async function unsubscribeFromKettle(): Promise<void> {
    kettleNotifUnlisten?.();
    kettleNotifUnlisten = null;
}

export async function sendKettleTemp(tempC: number): Promise<void> {
    await invoke("kettle_set_temp", { temp: tempC });
}
