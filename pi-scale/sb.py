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
"""

import json
import logging
import os
import time

from supabase import create_client

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
        self.client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
        response = self.client.auth.set_session(saved["access_token"], saved["refresh_token"])
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
