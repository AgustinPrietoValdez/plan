"""One-time interactive login: signs in as Agustin's own Supabase user and
persists the session (access + refresh token) so the unattended service can
authenticate on every restart without a human typing a password.

Decision: persisted user session, not the service_role key — RLS on
brew_sessions requires user_id = auth.uid(), and a stolen/compromised Pi
should only be able to touch Agustin's own rows (same blast radius he
already has), not the whole database.

Run this manually:
  - the first time, before the service can upload anything
  - again whenever the refresh token gets invalidated (password change,
    manual revoke, or the Pi being off for long enough that Supabase expires
    the refresh token — verify how long that is in practice)
"""

import getpass
import json
import os

from supabase import ClientOptions, create_client

from config import SESSION_DIR, SESSION_FILE, SUPABASE_ANON_KEY, SUPABASE_URL


def main():
    email = input("Email de Supabase: ").strip()
    password = getpass.getpass("Password: ")

    # auto_refresh_token=False: ver la nota en sb.py — evita que gotrue-py
    # rote el refresh token en un timer de fondo que nunca se persiste aca.
    client = create_client(
        SUPABASE_URL, SUPABASE_ANON_KEY, options=ClientOptions(auto_refresh_token=False)
    )
    response = client.auth.sign_in_with_password({"email": email, "password": password})

    SESSION_DIR.mkdir(parents=True, exist_ok=True)
    payload = {
        "access_token": response.session.access_token,
        "refresh_token": response.session.refresh_token,
        "expires_at": response.session.expires_at,
        "user_id": response.user.id,
    }
    tmp = SESSION_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(payload))
    os.chmod(tmp, 0o600)
    tmp.replace(SESSION_FILE)
    print(f"Sesion guardada en {SESSION_FILE}. Ya podes correr el servicio (main.py).")


if __name__ == "__main__":
    main()
