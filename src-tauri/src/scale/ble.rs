use btleplug::api::{Central, Manager as _, Peripheral as _, ScanFilter, WriteType};
use tauri::Emitter;
use btleplug::platform::{Adapter, Manager, Peripheral};
use futures::StreamExt;
use serde::Serialize;
use std::collections::HashMap;
use std::time::Duration;
use uuid::Uuid;

use super::parser::parse_weight_packet;

const WEIGHT_NOTIFY_UUID: &str = "0000FF11-0000-1000-8000-00805F9B34FB";
const COMMAND_WRITE_UUID: &str = "0000FF12-0000-1000-8000-00805F9B34FB";

// tare + start timer in one command
pub const CMD_TARE_START: &[u8] = &[0x03, 0x0A, 0x07, 0x00, 0x00, 0x00];

#[derive(Debug, Clone, Serialize)]
pub struct DeviceInfo {
    pub id: String,
    pub name: String,
}

pub struct BleManager {
    adapter: Option<Adapter>,
    discovered: HashMap<String, Peripheral>,
    peripheral: Option<Peripheral>,
}

impl BleManager {
    pub fn new() -> Self {
        BleManager { adapter: None, discovered: HashMap::new(), peripheral: None }
    }

    async fn adapter(&mut self) -> Result<Adapter, String> {
        if let Some(ref a) = self.adapter { return Ok(a.clone()); }
        let mgr = Manager::new().await.map_err(|e| e.to_string())?;
        let adapters = mgr.adapters().await.map_err(|e| e.to_string())?;
        let a = adapters.into_iter().next().ok_or("No BLE adapter")?;
        self.adapter = Some(a.clone());
        Ok(a)
    }

    pub async fn scan(&mut self) -> Result<Vec<DeviceInfo>, String> {
        let adapter = self.adapter().await?;
        adapter.start_scan(ScanFilter::default()).await.map_err(|e| e.to_string())?;
        tokio::time::sleep(Duration::from_secs(5)).await;
        adapter.stop_scan().await.map_err(|e| e.to_string())?;

        let peripherals = adapter.peripherals().await.map_err(|e| e.to_string())?;
        let mut devices = Vec::new();
        for p in peripherals {
            let props = p.properties().await.ok().flatten();
            let name = props.and_then(|pp| pp.local_name).unwrap_or_default();
            let lower = name.to_lowercase();
            if lower.contains("bookoo") || lower.contains("themis") {
                let id = p.id().to_string();
                self.discovered.insert(id.clone(), p);
                devices.push(DeviceInfo { id, name });
            }
        }
        Ok(devices)
    }

    pub async fn connect(&mut self, device_id: &str, app: tauri::AppHandle) -> Result<(), String> {
        let peripheral = self.discovered.get(device_id)
            .ok_or("Device not found — scan first")?.clone();

        peripheral.connect().await.map_err(|e| e.to_string())?;
        peripheral.discover_services().await.map_err(|e| e.to_string())?;

        let notify_uuid = Uuid::parse_str(WEIGHT_NOTIFY_UUID).unwrap();
        let chars = peripheral.characteristics();
        let notify_char = chars.iter()
            .find(|c| c.uuid == notify_uuid)
            .ok_or("Notify characteristic not found")?
            .clone();

        peripheral.subscribe(&notify_char).await.map_err(|e| e.to_string())?;
        self.peripheral = Some(peripheral.clone());
        let _ = app.emit("ble_connection", true);

        tauri::async_runtime::spawn(async move {
            let mut stream = match peripheral.notifications().await {
                Ok(s) => s,
                Err(e) => { eprintln!("BLE notifications error: {e}"); return; }
            };
            while let Some(notif) = stream.next().await {
                if let Some(data) = parse_weight_packet(&notif.value) {
                    let _ = app.emit("scale_data", data);
                }
            }
            let _ = app.emit("ble_connection", false);
        });

        Ok(())
    }

    pub async fn disconnect(&mut self) -> Result<(), String> {
        if let Some(ref p) = self.peripheral {
            p.disconnect().await.map_err(|e| e.to_string())?;
        }
        self.peripheral = None;
        Ok(())
    }

    pub async fn send_command(&self, bytes: &[u8]) -> Result<(), String> {
        let p = self.peripheral.as_ref().ok_or("Not connected")?;
        let write_uuid = Uuid::parse_str(COMMAND_WRITE_UUID).unwrap();
        let chars = p.characteristics();
        let c = chars.iter().find(|c| c.uuid == write_uuid)
            .ok_or("Write characteristic not found")?
            .clone();
        p.write(&c, bytes, WriteType::WithoutResponse).await.map_err(|e| e.to_string())
    }

    pub fn is_connected(&self) -> bool {
        self.peripheral.is_some()
    }
}
