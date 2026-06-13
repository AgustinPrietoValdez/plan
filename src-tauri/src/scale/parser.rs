use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct ScaleData {
    pub weight: Option<f32>,
    pub flow: Option<f32>,
    pub timer_ms: Option<u32>,
    pub battery: Option<u8>,
    pub unit: String,
}

/// Parse a 20-byte Bookoo/Themis BLE weight packet.
/// Format: [0x03][0x0B][timer×3][unit][wsign][weight×3][fsign][flow×2][bat][×4][checksum]
pub fn parse_weight_packet(data: &[u8]) -> Option<ScaleData> {
    if data.len() < 20 { return None; }
    if data[0] != 0x03 || data[1] != 0x0B { return None; }

    let mut checksum = 0u8;
    for b in &data[..19] { checksum ^= b; }
    if checksum != data[19] { return None; }

    let timer_ms = ((data[2] as u32) << 16) | ((data[3] as u32) << 8) | (data[4] as u32);
    let unit = if data[5] == 1 { "oz".to_string() } else { "g".to_string() };

    let weight_raw = ((data[7] as u32) << 16) | ((data[8] as u32) << 8) | (data[9] as u32);
    let weight_sign = if data[6] == 0x2D || data[6] == 0x01 { -1.0f32 } else { 1.0 };
    let weight = weight_sign * (weight_raw as f32) / 100.0;

    let flow_raw = ((data[11] as u16) << 8) | (data[12] as u16);
    let flow_sign = if data[10] == 0x2D || data[10] == 0x01 { -1.0f32 } else { 1.0 };
    let flow = flow_sign * (flow_raw as f32) / 100.0;

    Some(ScaleData {
        weight: Some(weight),
        flow: Some(flow),
        timer_ms: Some(timer_ms),
        battery: Some(data[13]),
        unit,
    })
}
