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

# The wedged-kernel-discovery-state bug (see POWER_CYCLE_AT_ATTEMPT below) can
# make BlueZ's D-Bus calls (StartDiscovery/StopDiscovery/Connect) HANG
# instead of raising `org.bluez.Error.InProgress` — with no exception, the
# retry/backoff/power-cycle logic below never triggers and the whole loop
# freezes silently forever (confirmed in prod: hours of total silence from
# this logger, no "retrying" lines, nothing). Wrapping every D-Bus await
# with a timeout turns a hang into a plain TimeoutError, which the existing
# `except Exception` retry paths already handle.
DBUS_CALL_TIMEOUT_S = 15.0

# BlueZ's StartDiscovery can reply "already in progress" for a moment after
# the adapter/bluetoothd was just restarted or after another scan just
# stopped — a short, fast retry here clears it far quicker than falling all
# the way back to the outer reconnect backoff (which starts at 2s and only
# gets slower). This is separate from that backoff: it's a tight retry
# around a single flaky D-Bus call, not the whole connect cycle.
SCAN_START_ATTEMPTS = 4
SCAN_START_RETRY_S = 1.5

# After long uptime, this same error can come from the kernel's HCI/mgmt
# discovery state getting wedged rather than a passing D-Bus race — it then
# fails identically on every plain retry. `systemctl restart bluetooth` does
# NOT clear this (it only restarts the userspace bluetoothd, not the kernel
# state); only a full reboot or a power cycle of the adapter itself does.
# Root-caused via /research-fix — see memory `pi_ble_stuck_discovery_fix`
# for sources. Escalate to a `bluetoothctl power off`+`power on` cycle
# partway through the plain retries before giving up.
POWER_CYCLE_AT_ATTEMPT = 2
POWER_CYCLE_SETTLE_S = 3.0

# `bluetoothctl power off/on` (above) is a D-Bus-mediated Adapter1.Powered
# toggle — it's the "highest confidence" fix per the memory doc, but
# confirmed in prod (2026-07-13) NOT to clear every wedge (it failed once,
# same InProgress error right after). Per the memory's ranked escalation
# path, an rfkill block/unblock is a strictly deeper kernel-level reset
# (closer to what a reboot does — drives hci_dev_close()/hci_dev_open(),
# re-running the BCM43430 firmware load) that a plain daemon-level power
# toggle doesn't reach. `rfkill` (util-linux) is used over `hciconfig`
# (deprecated, not guaranteed installed on a bare Debian image) for the
# same effect. Escalate to it after this many CONSECUTIVE failed
# find_scale() rounds in the outer loop (each of which already tried its own
# power-cycle internally and still failed). Needs CAP_NET_ADMIN — see
# AmbientCapabilities in plan-scale.service.
HARD_RESET_AFTER_FAILURES = 3


async def _power_cycle_adapter():
    logger.warning("power-cycling the Bluetooth adapter to clear a possibly wedged discovery state")
    try:
        for cmd in ("power off", "power on"):
            proc = await asyncio.create_subprocess_exec(
                "bluetoothctl", *cmd.split(),
                stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
            )
            await proc.wait()
    except Exception:
        logger.exception("bluetoothctl power cycle failed, continuing anyway")
    await asyncio.sleep(POWER_CYCLE_SETTLE_S)


async def _hard_reset_adapter():
    logger.warning("rfkill block/unblock bluetooth — deeper kernel-level reset (power-cycle alone didn't clear the wedge)")
    try:
        for arg in ("block", "unblock"):
            proc = await asyncio.create_subprocess_exec(
                "rfkill", arg, "bluetooth",
                stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE,
            )
            _, stderr = await proc.communicate()
            if proc.returncode != 0:
                logger.warning(
                    "rfkill %s bluetooth exited %d: %s", arg, proc.returncode,
                    stderr.decode(errors="replace").strip(),
                )
    except Exception:
        logger.exception("rfkill reset failed, continuing anyway")
    await asyncio.sleep(POWER_CYCLE_SETTLE_S)


async def _start_scanner(scanner: BleakScanner):
    for attempt in range(1, SCAN_START_ATTEMPTS + 1):
        try:
            await asyncio.wait_for(scanner.start(), DBUS_CALL_TIMEOUT_S)
            return
        except Exception:
            if attempt == SCAN_START_ATTEMPTS:
                raise
            if attempt == POWER_CYCLE_AT_ATTEMPT:
                await _power_cycle_adapter()
            else:
                logger.warning(
                    "scanner.start() failed (attempt %d/%d), retrying in %.1fs",
                    attempt, SCAN_START_ATTEMPTS, SCAN_START_RETRY_S,
                )
                await asyncio.sleep(SCAN_START_RETRY_S)


async def _scan(timeout: float, service_uuids: list[str] | None = None):
    """Scan for `timeout` seconds, collecting devices via a callback instead
    of `BleakScanner.discover()`'s all-or-nothing return value. BlueZ has a
    well-known race (`org.bluez.Error.InProgress`) where Start/StopDiscovery
    can fail if it collides with the adapter's internal state — `discover()`
    lets that exception escape and discards every device it just found.
    Here, a failed stop() only loses the stop confirmation, never the
    devices already reported by the callback, and a failed start() gets a
    few quick retries (see `_start_scanner`) before giving up."""
    found = {}

    def _on_detect(device, _adv):
        found[device.address] = device

    scanner = BleakScanner(detection_callback=_on_detect, service_uuids=service_uuids or [])
    await _start_scanner(scanner)
    try:
        await asyncio.sleep(timeout)
    finally:
        try:
            await asyncio.wait_for(scanner.stop(), DBUS_CALL_TIMEOUT_S)
        except Exception:
            logger.warning("scanner.stop() raced with BlueZ (ignored, devices already seen are kept)")
    return list(found.values())


async def find_scale(timeout: float = SCAN_TIMEOUT_S):
    devices = await _scan(timeout, service_uuids=[SERVICE_UUID])
    if devices:
        return devices[0]
    # fallback: some adapters don't surface service UUIDs in the scan
    # response, only the device name.
    devices = await _scan(timeout)
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
        consecutive_hard_failures = 0
        while True:
            client = None
            hard_failure = False  # exception from find_scale()/connect — NOT a plain
            # "scale is just off" (device is None), which is expected and frequent
            # and shouldn't trigger an adapter reset.
            try:
                device = await find_scale()
                if device is None:
                    logger.info("scale not found, retrying in %.0fs", backoff)
                else:
                    disconnected = asyncio.Event()

                    def _on_disc(_client):
                        disconnected.set()

                    # Manual connect/disconnect (not `async with`) so a shutdown
                    # mid-connection (Ctrl+C, systemd stop) can't let a failing
                    # disconnect() D-Bus call mask a clean CancelledError with a
                    # scary traceback — see finally block below.
                    client = BleakClient(device, disconnected_callback=_on_disc)
                    await asyncio.wait_for(client.connect(), DBUS_CALL_TIMEOUT_S)
                    logger.info("connected to %s", device.address)
                    backoff = INITIAL_BACKOFF_S
                    consecutive_hard_failures = 0
                    await asyncio.wait_for(
                        client.start_notify(NOTIFY_UUID, self._handle_notification), DBUS_CALL_TIMEOUT_S
                    )
                    await disconnected.wait()
                    logger.info("disconnected from %s", device.address)
            except asyncio.CancelledError:
                logger.info("shutting down")
                raise
            except Exception:
                logger.exception("BLE connection error")
                hard_failure = True
            finally:
                self._on_disconnect()
                if client is not None:
                    try:
                        await asyncio.wait_for(client.disconnect(), DBUS_CALL_TIMEOUT_S)
                    except Exception:
                        pass  # best-effort teardown; nothing actionable here

            if hard_failure:
                consecutive_hard_failures += 1
                # Each find_scale() round already tried its own power-cycle
                # (see POWER_CYCLE_AT_ATTEMPT) and it still wasn't enough —
                # escalate to the deeper kernel-level reset periodically
                # instead of repeating the same fix that already failed.
                if consecutive_hard_failures % HARD_RESET_AFTER_FAILURES == 0:
                    await _hard_reset_adapter()
            else:
                consecutive_hard_failures = 0

            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, MAX_BACKOFF_S)
