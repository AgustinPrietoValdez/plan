# BOOKOO Themis BLE Spike

Research spike for reading live data and controlling a **BOOKOO Themis** coffee scale (Themis / Themis Mini / **Themis Ultra**) from a **Tauri (Rust) + Web** app on **Windows**.

> Date: 2026-06-09. Scope: practical BLE spec + Windows implementation path.

---

## Summary (TL;DR)

- **BOOKOO publishes an OFFICIAL open BLE protocol** on GitHub: <https://github.com/BooKooCode/OpenSource>. This is the authoritative source and it covers exactly the model family you have. There is a dedicated folder **`bookoo_ultra_scale/`** (your Themis Ultra) and **`bookoo_mini_scale/`** — both ship a `protocols.md`. The two protocols are essentially identical.
- **GATT layout (verified, from official docs):**
  - Service: `0x0FFE`
  - Weight/data **notify** characteristic: `0xFF11`
  - Command **write** characteristic: `0xFF12`
  - 16-bit UUIDs expand to the standard base: `0000xxxx-0000-1000-8000-00805F9B34FB`
- **Weight notifications** are a fixed **20-byte** packet (header `03 0B ...`) containing weight, flow rate, timer (ms), battery %, unit, and config flags — all in **one** packet. Numbers are big-endian, weight/flow are ×100. Sign carried in a dedicated byte.
- **Commands** are fixed **6-byte** frames (`03 0A <cmd> <d1> <d2> <checksum>`) with XOR checksum: tare, start/stop/reset timer, tare+start, beep, auto-off, flow smoothing, calibrate.
- **Update rate:** not stated numerically in the official doc; community work reports roughly **on the order of 10 Hz** (treat as unverified — confirm by sniffing).
- **Windows / Tauri:** **Do NOT rely on Web Bluetooth.** Tauri's webview on Windows is **WebView2**, which does **not** expose `navigator.bluetooth` to embedded apps the way full Edge does. Use a **native Rust BLE crate** (`btleplug`) in the Tauri backend, optionally via the **`tauri-plugin-blec`** plugin, and emit data to the frontend over Tauri events/IPC.
- **Reliability of facts:** UUIDs, packet layout, and command frames are **documented by the vendor** (high confidence). Exact sign-byte hex values, the ounce unit code, and the notification Hz are **partially documented / community-inferred** — verify with nRF Connect. The **Themis Ultra** has its own folder in the official repo, so it is documented, but it has fewer third-party integrations than the base/mini.

---

## 1. BLE GATT Services & Characteristics

Source: official `protocols.md` for both `bookoo_mini_scale` and `bookoo_ultra_scale` (<https://github.com/BooKooCode/OpenSource>).

| Role | 16-bit UUID | Full 128-bit UUID | Properties | Confidence |
|------|-------------|-------------------|------------|------------|
| Primary service | `0x0FFE` | `00000FFE-0000-1000-8000-00805F9B34FB` | — | Documented (vendor) |
| Weight / live data | `0xFF11` | `0000FF11-0000-1000-8000-00805F9B34FB` | Notify | Documented (vendor) |
| Command (control) | `0xFF12` | `0000FF12-0000-1000-8000-00805F9B34FB` | Write | Documented (vendor) |

Notes / gaps:
- **Battery** is NOT a separate GATT characteristic — battery % is embedded in the weight notification packet (byte 13). The official docs do not mention a standard Battery Service `0x180F`. **Unverified** whether the device also exposes the standard Battery Service in parallel — check with nRF Connect.
- **Device Information Service (`0x180A`)** (manufacturer, firmware rev, serial) is not documented by BOOKOO. Most BLE chipsets expose `0x180A` by default, but treat its presence as **unverified** until sniffed.
- To receive notifications you must **subscribe** (write `0x0001` to the CCCD descriptor `0x2902` of `0xFF11`). `btleplug`'s `subscribe()` handles this for you.

---

## 2. Weight Notification Packet (characteristic `0xFF11`)

Fixed **20 bytes**. Header is `03 0B`. Source: official `protocols.md` (mini + ultra).

| Byte # | Field | Meaning / Encoding |
|-------:|-------|--------------------|
| 0 | Product number | constant `0x03` |
| 1 | Type | constant `0x0B` (weight-data frame) |
| 2 | Milliseconds — high | timer, 3-byte **big-endian** unsigned int |
| 3 | Milliseconds — mid | (timer in ms) |
| 4 | Milliseconds — low | (timer in ms) |
| 5 | Weight unit | unit identifier (grams primary; ounce code unverified — see below) |
| 6 | Weight sign | `+`/`-` indicator (see note) |
| 7 | Grams×100 — high | weight, 3-byte **big-endian**; value = int/100 grams |
| 8 | Grams×100 — mid | |
| 9 | Grams×100 — low | |
| 10 | Flow-rate sign | `+`/`-` indicator |
| 11 | Flow×100 — high | flow rate, 2-byte **big-endian**; value = int/100 g/s |
| 12 | Flow×100 — low | |
| 13 | Battery % | 0–100 |
| 14 | Standby time — high | auto-off minutes, 2-byte big-endian |
| 15 | Standby time — low | |
| 16 | Buzzer gear | beep level setting |
| 17 | Flow smoothing | on/off switch state |
| 18 | Reserved | `0x00` |
| 19 | Checksum | XOR of bytes 0..18 (see §Checksum) |

> Note: the official packet description lists 21 byte positions in prose (a trailing reserved `00` plus checksum); the canonical frame length implemented by integrations is **20 bytes**. Confirm the exact length (20 vs 21) and the checksum byte index by sniffing — see Open Questions.

**Decoding live values (pseudo-Rust):**
```rust
// data: &[u8] from FF11 notification
let timer_ms = ((data[2] as u32) << 16) | ((data[3] as u32) << 8) | data[4] as u32;
let raw_g    = ((data[7] as u32) << 16) | ((data[8] as u32) << 8) | data[9] as u32;
let mut grams = raw_g as f32 / 100.0;
if data[6] == 0x2D /* '-' */ { grams = -grams; }     // sign byte: verify exact hex
let raw_flow = ((data[11] as u16) << 8) | data[12] as u16;
let mut flow = raw_flow as f32 / 100.0;
if data[10] == 0x2D { flow = -flow; }
let battery  = data[13];                              // percent
```

**What's in the packet:** weight, flow rate, timer (ms), battery %, unit, standby/auto-off, buzzer level, flow-smoothing flag — **all in the single notification**. No separate polling needed.

**Confidence / gaps:**
- Byte offsets, big-endian ordering, and ×100 scaling: **documented (vendor)** — high confidence.
- **Sign byte exact hex** (`0x2B` for `+`, `0x2D` for `-` is the natural ASCII guess and is what some implementations assume) is **inferred, not confirmed** in the doc. Some firmwares use `0x00`/`0x01` instead. **Verify by sniffing** (put a known weight on, read byte 6).
- **Unit byte values:** the ultra summary noted "01 = Ounce, 02 = Gram" in one parse, but the mini doc says "current unit only supports grams." Treat the ounce code as **unverified**.

---

## 3. Commands (write to characteristic `0xFF12`)

Fixed **6-byte** frame: `[0x03][0x0A][CMD][DATA1][DATA2][CHECKSUM]`. Checksum = XOR of the first 5 bytes. Source: official `protocols.md`.

| Function | CMD | Full bytes (hex) | Notes | Confidence |
|----------|-----|------------------|-------|------------|
| **Tare / zero** | `01` | `03 0A 01 00 00 08` | fixed | Documented |
| Beep level | `02` | `03 0A 02 00 <0x00–0x05> <cksum>` | DATA2 = level | Documented |
| Auto-off minutes | `03` | `03 0A 03 00 <0x05–0x1E> <cksum>` | DATA2 = minutes (5–30) | Documented |
| **Start timer** | `04` | `03 0A 04 00 00 0A` | fixed | Documented |
| **Stop timer** | `05` | `03 0A 05 00 00 0D` | fixed | Documented |
| **Reset timer** | `06` | `03 0A 06 00 00 0C` | fixed | Documented |
| **Tare + start timer** | `07` | `03 0A 07 00 00 00` | fixed (one-shot brew start) | Documented |
| Flow smoothing | `08` | `03 0A 08 <0x00/0x01> 00 <cksum>` | DATA1 = off/on | Documented |
| Calibrate | `09` | `03 0A 09 00 00 00` | fixed; use with care | Documented |
| Auto-mode stop | `0B` | `03 0A 0B <0x00/0x01> 00 <cksum>` | DATA1: 0=flow-stop, 1=container-removed (ultra) | Documented (ultra) |

Checksum example: for tare `03 ^ 0A ^ 01 ^ 00 ^ 00 = 0x08` ✓. For start `03 ^ 0A ^ 04 ^ 00 ^ 00 = 0x0D`? → `03^0A=09, 09^04=0D` — note the doc lists `0A` for start; the canonical fixed bytes above are taken verbatim from the official doc. **If a command is rejected, recompute checksum as XOR of the first 5 bytes and compare to the documented constant; the doc's listed constants take precedence — verify by trial.**

> Write type: try **write-with-response** first; if `0xFF12` only supports write-without-response, fall back to that. `btleplug` exposes both via `WriteType`.

---

## 4. Notification cadence / update rate

- The official `protocols.md` does **not** state a numeric refresh rate.
- Community/coffee integrations (Acaia-style scale gateways, Gaggiuino/flow-control use cases) treat these scales as **high-rate, roughly ~10 Hz** so flow rate is usable for real-time profiling. This is **community-reported / inferred**, not vendor-documented.
- **To confirm:** subscribe to `0xFF11` and timestamp 100 notifications; divide. Expect somewhere in the 5–15 Hz range.

---

## 5. Open-source / reverse-engineering references

| Source | What it is | Reliability |
|--------|------------|-------------|
| **BooKooCode/OpenSource** — <https://github.com/BooKooCode/OpenSource> | **Official vendor** BLE protocol. Has `bookoo_mini_scale/protocols.md` and `bookoo_ultra_scale/protocols.md` plus `espresso_monitor`. | **Authoritative.** Start here. Read the ultra folder for your model. |
| **makerwolf/bookoo** — <https://github.com/makerwolf/bookoo> | Home Assistant (HACS) integration: weight/flow/timer sensors + tare/start/stop/reset buttons. Depends on PyPI lib **`aiobookoo==0.1.0`**. | Reliable, actively used. Good Python reference for parsing + commands. |
| **aiobookoo** (PyPI) — <https://pypi.org/project/aiobookoo/> | Async Python BLE library powering the HA integration. Contains the actual decode/encode code. | Reliable; best place to crib parsing logic and confirm sign/unit bytes. |
| **Zer0-bit/esp-arduino-ble-scales** — <https://github.com/Zer0-bit/esp-arduino-ble-scales> | ESP32/Arduino multi-scale library; lists **Bookoo Themis (incl. Ultra)** as tested. Part of the Gaggiuino ecosystem (Zer0-bit = Gaggiuino author). | Reliable C++ reference for real-time use. |
| **kstam/esp-arduino-ble-scales** — <https://github.com/kstam/esp-arduino-ble-scales> | Upstream of the above. | Reliable. |
| **tatemazer/AcaiaArduinoBLE** — <https://github.com/tatemazer/AcaiaArduinoBLE> | Acaia + Bookoo scale gateway for ESP32/Arduino. | Reliable; cross-check for command framing. |
| Apps: **Beanconqueror**, **BOOKOO N**, **Odyssey Espresso** | Officially listed compatible apps (vendor help center). | Vendor-stated compatibility. |

---

## 6. Implementation on Windows (Tauri + Rust + Web)

### Web Bluetooth — NOT recommended here
- Tauri's frontend on Windows runs in **WebView2** (Chromium/Edge engine). While full Microsoft Edge supports Web Bluetooth (since Edge 79), **WebView2 does not expose `navigator.bluetooth` to host apps** by default — the device-chooser/permission broker that Web Bluetooth needs is not wired up in embedded WebView2. So a Tauri Windows app **cannot rely on `navigator.bluetooth`**. (Unverified edge cases aside, do not architect around it.)

### Recommended: native Rust BLE in the Tauri backend
- Use **`btleplug`** — <https://github.com/deviceplug/btleplug> — cross-platform Rust BLE (Windows 10+/macOS/Linux). On Windows it uses the WinRT `Bluetooth` APIs.
- Easiest integration: **`tauri-plugin-blec`** — <https://github.com/MnlPhlp/tauri-plugin-blec> — wraps btleplug for Tauri (scan/connect/subscribe/write from the frontend via the plugin's JS API). Alternative: **`tauri-plugin-bluetooth`** (<https://crates.io/crates/tauri-plugin-bluetooth>).
- Flow:
  1. Backend scans, finds device advertising service `0x0FFE` (or by name containing "BOOKOO"/"Themis").
  2. Connect; discover service `0x0FFE`.
  3. `subscribe()` to `0xFF11` → parse 20-byte packets → `emit` weight/flow/timer/battery to the frontend as Tauri events.
  4. Frontend buttons call `invoke()` → backend `write()` 6-byte command frames to `0xFF12`.

### Windows BLE caveats (btleplug / WinRT)
- **Windows 10 build 1809+ / Windows 11** required for the WinRT BLE APIs; your machine (Win 11) is fine.
- The PC must have a working BLE adapter and **Bluetooth turned on**; the scale typically must be **paired or at least bonded once** — but for GATT-only peripherals, btleplug can usually connect without OS pairing. If connection fails, pair once via Windows Settings.
- WinRT GATT can be **finicky about caching**: after firmware changes the OS may cache stale services. If discovery is wrong, toggle Bluetooth or remove/re-add the device.
- **Only one central can be connected at a time** — close the BOOKOO mobile app / nRF Connect before connecting from your app.
- Run scanning on the async runtime; btleplug is fully async (Tokio).

---

## 7. Documented vs. inferred — honest status

**Documented by the vendor (high confidence):**
- Service `0x0FFE`, notify `0xFF11`, write `0xFF12`.
- 20-byte weight packet header `03 0B`, big-endian fields, weight/flow ×100, battery at byte 13, timer ms at bytes 2–4.
- 6-byte command frames with the listed CMD codes and the fixed tare/timer constants; XOR checksum.
- Themis **Ultra** is explicitly covered (its own folder `bookoo_ultra_scale/`).

**Partially documented / community-inferred (verify):**
- Exact **sign-byte hex** for + / − (ASCII `0x2B`/`0x2D` assumed; could be `0x00`/`0x01`).
- **Ounce unit code** (one parse said `01=oz, 02=g`; mini doc says grams-only).
- **Notification Hz** (~10 Hz community estimate; not in spec).
- Exact **frame length** edge (20 vs 21 bytes) and **checksum byte index**.

**Not documented (assume absent until sniffed):**
- Standard Battery Service `0x180F` and Device Information Service `0x180A`.
- Write-with-response vs write-without-response on `0xFF12`.

---

## 8. Open questions / how to verify

Use **nRF Connect** (mobile or desktop) or a btleplug scan utility:

1. **Confirm GATT table:** connect, dump all services/characteristics; verify `0x0FFE`/`0xFF11`/`0xFF12` and whether `0x180A`/`0x180F` also appear.
2. **Confirm packet length & checksum:** enable notifications on `0xFF11`, capture raw hex; check whether frames are 20 or 21 bytes and which byte is the XOR checksum.
3. **Confirm sign byte:** put +50 g on, read byte 6; lift to a negative reading (tare then remove), read byte 6 again. Record the two hex values.
4. **Confirm units:** if the scale supports ounce mode, switch it and read byte 5.
5. **Confirm Hz:** timestamp ~100 notifications; compute rate.
6. **Confirm command write type & checksum constants:** send tare `03 0A 01 00 00 08`; if rejected, try write-without-response and re-derive checksum.
7. **Cross-check code:** read `aiobookoo` source (the HA dependency) for the canonical parse/encode that already handles the above.

---

## Sources

- Official BOOKOO protocol (mini + **ultra**): <https://github.com/BooKooCode/OpenSource>
  - `bookoo_ultra_scale/protocols.md`, `bookoo_mini_scale/protocols.md`
- Home Assistant integration: <https://github.com/makerwolf/bookoo> (uses `aiobookoo==0.1.0`)
- aiobookoo (PyPI): <https://pypi.org/project/aiobookoo/>
- ESP32 scale libraries: <https://github.com/Zer0-bit/esp-arduino-ble-scales>, <https://github.com/kstam/esp-arduino-ble-scales>
- Acaia/Bookoo Arduino gateway: <https://github.com/tatemazer/AcaiaArduinoBLE>
- btleplug (Rust BLE): <https://github.com/deviceplug/btleplug>
- Tauri BLE plugin: <https://github.com/MnlPhlp/tauri-plugin-blec> ; alt <https://crates.io/crates/tauri-plugin-bluetooth>
- Vendor product/compatibility: <https://bookoocoffee.com/products/bookoo-themis-ultra-coffee-scale>, <https://help.bookoocoffee.com/content/what-devices-is-the-themis-mini-scale-compatible-with>
