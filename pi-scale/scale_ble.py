"""BLE connect/reconnect loop for the BOOKOO Themis Ultra scale.

GATT layout from COFFEE_SCALE_SPIKE.md (vendor-documented):
  service 0x0FFE, notify 0xFF11 (weight/flow data), write 0xFF12 (commands).
Uses bleak (async, cross-platform BLE) — unrelated to the Android
Kotlin+JNI workaround the phone app needs (that was a WebView2/tauri-plugin
issue specific to Android; the Pi has no such constraint).
"""

import asyncio
import logging

from bleak import BleakClient, BleakScanner

logger = logging.getLogger("scale_ble")

SERVICE_UUID = "00000ffe-0000-1000-8000-00805f9b34fb"
NOTIFY_UUID = "0000ff11-0000-1000-8000-00805f9b34fb"
WRITE_UUID = "0000ff12-0000-1000-8000-00805f9b34fb"

SCAN_TIMEOUT_S = 10.0
INITIAL_BACKOFF_S = 2.0
MAX_BACKOFF_S = 30.0


async def find_scale(timeout: float = SCAN_TIMEOUT_S):
    devices = await BleakScanner.discover(timeout=timeout, service_uuids=[SERVICE_UUID])
    if devices:
        return devices[0]
    # fallback: some adapters don't surface service UUIDs in the scan
    # response, only the device name.
    devices = await BleakScanner.discover(timeout=timeout)
    for d in devices:
        name = (d.name or "").lower()
        if "bookoo" in name or "themis" in name:
            return d
    return None


class ScaleConnection:
    """Runs forever: scan, connect, subscribe, wait for disconnect, repeat
    with capped exponential backoff. Disconnects are the normal case (the
    scale auto-powers-off), not an error."""

    def __init__(self, on_notification, on_disconnect):
        self._on_notification = on_notification
        self._on_disconnect = on_disconnect

    def _handle_notification(self, _characteristic, data: bytearray):
        self._on_notification(bytes(data))

    async def run(self):
        backoff = INITIAL_BACKOFF_S
        while True:
            client = None
            try:
                device = await find_scale()
                if device is None:
                    logger.info("scale not found, retrying in %.0fs", backoff)
                    await asyncio.sleep(backoff)
                    backoff = min(backoff * 2, MAX_BACKOFF_S)
                    continue

                disconnected = asyncio.Event()

                def _on_disc(_client):
                    disconnected.set()

                # Manual connect/disconnect (not `async with`) so a shutdown
                # mid-connection (Ctrl+C, systemd stop) can't let a failing
                # disconnect() D-Bus call mask a clean CancelledError with a
                # scary traceback — see finally block below.
                client = BleakClient(device, disconnected_callback=_on_disc)
                await client.connect()
                logger.info("connected to %s", device.address)
                backoff = INITIAL_BACKOFF_S
                await client.start_notify(NOTIFY_UUID, self._handle_notification)
                await disconnected.wait()
                logger.info("disconnected from %s", device.address)
            except asyncio.CancelledError:
                logger.info("shutting down")
                raise
            except Exception:
                logger.exception("BLE connection error")
            finally:
                self._on_disconnect()
                if client is not None:
                    try:
                        await client.disconnect()
                    except Exception:
                        pass  # best-effort teardown; nothing actionable here

            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, MAX_BACKOFF_S)
