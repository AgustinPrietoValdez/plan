"""Entry point: connect to the scale, detect brew start/end, save the
finished brew locally as JSON (audit trail) and upload it to Supabase.
If the upload fails (no network), the row is spooled to captures/pending/
and retried every RETRY_INTERVAL_S.

Run manually on the Pi first (see README.md) to bench-test against the real
BOOKOO Themis Ultra before installing the systemd service.
"""

import asyncio
import dataclasses
import json
import logging
import time
from pathlib import Path

import uploader
from detector import BrewDetector, FinishedBrew
from packet import parse_weight_packet
from sb import SupabaseSession
from scale_ble import ScaleConnection

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("main")

CAPTURES_DIR = Path(__file__).parent / "captures"
RETRY_INTERVAL_S = 5 * 60


def save_local_copy(brew: FinishedBrew) -> Path:
    CAPTURES_DIR.mkdir(exist_ok=True)
    ts = time.strftime("%Y%m%dT%H%M%S", time.localtime())
    path = CAPTURES_DIR / f"brew_{ts}.json"
    payload = {
        "duration_ms": brew.duration_ms,
        "total_water_grams": brew.total_water_grams,
        "end_reason": brew.end_reason,
        "datapoints": [dataclasses.asdict(p) for p in brew.datapoints],
        "captured_at": time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime()),
    }
    path.write_text(json.dumps(payload, indent=2))
    return path


def handle_finished(sb: SupabaseSession, brew: FinishedBrew):
    local_path = save_local_copy(brew)
    row = uploader.build_row(sb.user_id, brew)
    uploaded = uploader.try_upload(sb, row)
    if not uploaded:
        uploader.spool(row)
    logger.info(
        "brew: %s (duration=%.1fs water=%.1fg reason=%s) uploaded=%s local=%s",
        row["id"],
        brew.duration_ms / 1000,
        brew.total_water_grams,
        brew.end_reason,
        uploaded,
        local_path.name,
    )


async def retry_pending_loop(sb: SupabaseSession):
    while True:
        await asyncio.sleep(RETRY_INTERVAL_S)
        uploader.retry_pending(sb)


async def main():
    sb = SupabaseSession()
    detector = BrewDetector()

    def on_notification(data: bytes):
        sample = parse_weight_packet(data)
        if sample is None:
            return  # bad checksum / short frame, drop it
        finished = detector.feed(sample)
        if finished is not None:
            handle_finished(sb, finished)

    def on_disconnect():
        finished = detector.on_disconnect()
        if finished is not None:
            handle_finished(sb, finished)

    conn = ScaleConnection(on_notification=on_notification, on_disconnect=on_disconnect)
    retry_task = asyncio.create_task(retry_pending_loop(sb))
    try:
        await conn.run()
    finally:
        retry_task.cancel()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("detenido (Ctrl+C)")
    except RuntimeError as e:
        # Raised with an actionable message (e.g. dead Supabase session) —
        # log just that, not a full traceback burying it in journalctl.
        logger.error(str(e))
        raise SystemExit(1)
