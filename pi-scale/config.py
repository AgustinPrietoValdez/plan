"""Shared config: Supabase project credentials + where the persisted auth
session lives. Values come from environment variables (see .env.example) —
same VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY the app itself uses
(src/lib/supabase.ts), just under plain names since this isn't a Vite app."""

import os
from pathlib import Path


def _require(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(
            f"Falta {name}. Copia .env.example a .env, completalo, y "
            f"cargalo antes de correr (ver README.md)."
        )
    return value


SUPABASE_URL = _require("SUPABASE_URL")
SUPABASE_ANON_KEY = _require("SUPABASE_ANON_KEY")

SESSION_DIR = Path.home() / ".config" / "plan-scale"
SESSION_FILE = SESSION_DIR / "session.json"
