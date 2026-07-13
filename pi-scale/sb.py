"""Supabase session management (load/refresh/persist) and the brew_sessions
insert call. See login.py for why this uses a persisted user session
instead of the service_role key.

API surface used here (supabase-py / auth-py, verified against the official
docs at supabase.com/docs/reference/python as of 2026-07):
  - auth.set_session(access_token, refresh_token) -> AuthResponse
    "If the current session is expired, set_session will take care of
    refreshing it" — so this alone recovers from an expired access token.
  - auth.refresh_session(refresh_token=None) -> AuthResponse
    Refreshes unconditionally; used here proactively before it expires.
  - auth.get_session() -> Session | None
Supabase ROTATES refresh tokens on every refresh — the old one becomes
invalid. Every place that touches the session below re-persists it
immediately after, or a restart would be locked out.

auto_refresh_token=False is load-bearing, not an optimization: gotrue-py's
default (True) spins up its own background `threading.Timer` the moment
set_session()/refresh_session() succeeds (see _save_session/
_start_auto_refresh_token in supabase_auth/_sync/gotrue_client.py). That
timer silently rotates the refresh token again ~1h later and saves the
result only to the client's in-memory/internal storage — never to
SESSION_FILE, since only THIS module's _persist() writes there. The service
runs fine in that window (the in-memory session stays valid), but the token
on disk is now stale; the next process restart (crash, reboot, systemd
Restart=) calls set_session() with that stale refresh_token, which the
server already rotated away, and the whole session dies permanently ("Corre
python login.py de nuevo"). This is exactly the "works, then breaks after a
day" pattern. Disabling it makes _ensure_fresh() below the ONLY thing that
ever refreshes the token, so every refresh is guaranteed to hit _persist().
"""

import json
import logging
import os
import time

from supabase import ClientOptions, create_client

from config import SESSION_DIR, SESSION_FILE, SUPABASE_ANON_KEY, SUPABASE_URL

logger = logging.getLogger("sb")

REFRESH_MARGIN_S = 5 * 60  # proactively refresh if less than this remains


def _load_saved() -> dict:
    if not SESSION_FILE.exists():
        raise RuntimeError(
            f"No hay sesion guardada en {SESSION_FILE}. Corre 'python login.py' primero."
        )
    return json.loads(SESSION_FILE.read_text())


def _persist(session, user_id: str):
    SESSION_DIR.mkdir(parents=True, exist_ok=True)
    payload = {
        "access_token": session.access_token,
        "refresh_token": session.refresh_token,
        "expires_at": session.expires_at,
        "user_id": user_id,
    }
    tmp = SESSION_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(payload))
    os.chmod(tmp, 0o600)
    tmp.replace(SESSION_FILE)


class SupabaseSession:
    def __init__(self):
        saved = _load_saved()
        self._user_id = saved["user_id"]
        self.client = create_client(
            SUPABASE_URL, SUPABASE_ANON_KEY, options=ClientOptions(auto_refresh_token=False)
        )
        try:
            response = self.client.auth.set_session(saved["access_token"], saved["refresh_token"])
        except Exception as e:
            # Refresh tokens are single-use — if the process died between a
            # successful refresh and persisting the new one (e.g. a reboot
            # mid-request), the saved token is now permanently dead and no
            # amount of retrying will revive it. Fail with a clear one-liner
            # instead of a raw traceback so `journalctl` points straight at
            # the fix, and so systemd's StartLimit (see plan-scale.service)
            # gives up instead of crash-looping forever on a dead token.
            raise RuntimeError(
                f"Sesion de Supabase invalida ({e}). Corre 'python login.py' de nuevo."
            ) from e
        _persist(response.session, self._user_id)
        logger.info("Supabase session restored for user %s", self._user_id)

    def _ensure_fresh(self):
        session = self.client.auth.get_session()
        if session is None:
            raise RuntimeError("Sesion de Supabase perdida; corre 'python login.py' de nuevo.")
        if session.expires_at - time.time() < REFRESH_MARGIN_S:
            response = self.client.auth.refresh_session(session.refresh_token)
            _persist(response.session, self._user_id)
            logger.info("Supabase session refreshed")

    @property
    def user_id(self) -> str:
        return self._user_id

    def insert_brew_session(self, row: dict):
        self._ensure_fresh()
        self.client.table("brew_sessions").insert(row).execute()
