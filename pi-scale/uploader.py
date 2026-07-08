"""Builds the brew_sessions wire row (same shape as createBrewSession's
enqueue payload in src/lib/repo/local.ts, lines 2973-2979) and manages the
offline upload spool: if a brew finishes while the Pi has no network, the
row is written to captures/pending/ and retried later instead of lost.
"""

import json
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger("uploader")

PENDING_DIR = Path(__file__).parent / "captures" / "pending"

# The Pi only sees the scale, never the recipe/bean being used — decision:
# leave both null, desktop app prompts to assign them on next sync pull
# (any brew_sessions row with recipe_id/bean_id both null came from here).
DOSE_GRAMS_UNKNOWN = 0


def _now_iso() -> str:
    # matches `new Date().toISOString()` (src/lib/repo/local.ts `now()`),
    # e.g. "2026-07-08T21:22:10.740Z"
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def build_row(user_id: str, brew) -> dict:
    ts = _now_iso()
    return {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "recipe_id": None,
        "recipe_name": "",
        "bean_id": None,
        "bean_name": "",
        "dose_grams": DOSE_GRAMS_UNKNOWN,
        "total_water_grams": brew.total_water_grams,
        "duration_ms": brew.duration_ms,
        "notes": "Capturado por Pi",
        "datapoints": [
            {
                "timer_ms": p.timer_ms,
                "weight_g": p.weight_g,
                "flow_g_s": p.flow_g_s,
                "step_idx": p.step_idx,
            }
            for p in brew.datapoints
        ],
        "created_at": ts,
        "updated_at": ts,
        "deleted_at": None,
        "version": 1,
    }


def spool(row: dict) -> Path:
    PENDING_DIR.mkdir(parents=True, exist_ok=True)
    path = PENDING_DIR / f"{row['id']}.json"
    path.write_text(json.dumps(row))
    return path


def try_upload(sb, row: dict) -> bool:
    try:
        sb.insert_brew_session(row)
        return True
    except Exception:
        logger.exception("upload failed for brew %s", row.get("id"))
        return False


def retry_pending(sb):
    if not PENDING_DIR.exists():
        return
    for path in sorted(PENDING_DIR.glob("*.json")):
        try:
            row = json.loads(path.read_text())
        except Exception:
            logger.exception("corrupt pending file %s, leaving it for inspection", path)
            continue
        if try_upload(sb, row):
            path.unlink()
            logger.info("uploaded pending brew %s", row.get("id"))
