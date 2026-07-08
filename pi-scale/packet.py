"""Parser for BOOKOO Themis Ultra weight/flow BLE notifications.

Port of parseWeightPacket in src/lib/ble.ts (lines 17-32) — same bit layout,
same checksum, same sign convention. Keep the two in sync if either changes.
"""

from dataclasses import dataclass


@dataclass
class ScaleData:
    weight_g: float
    flow_g_s: float
    timer_ms: int
    battery: int
    unit: str


def parse_weight_packet(data: bytes) -> ScaleData | None:
    if len(data) < 20:
        return None
    if data[0] != 0x03 or data[1] != 0x0B:
        return None
    checksum = 0
    for i in range(19):
        checksum ^= data[i]
    if checksum != data[19]:
        return None

    timer_ms = (data[2] << 16) | (data[3] << 8) | data[4]
    unit = "oz" if data[5] == 1 else "g"

    weight_raw = (data[7] << 16) | (data[8] << 8) | data[9]
    weight_sign = -1 if data[6] in (0x2D, 0x01) else 1
    weight_g = (weight_sign * weight_raw) / 100

    flow_raw = (data[11] << 8) | data[12]
    flow_sign = -1 if data[10] in (0x2D, 0x01) else 1
    flow_g_s = (flow_sign * flow_raw) / 100

    return ScaleData(
        weight_g=weight_g,
        flow_g_s=flow_g_s,
        timer_ms=timer_ms,
        battery=data[13],
        unit=unit,
    )
