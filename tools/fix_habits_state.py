#!/usr/bin/env python3
"""
fix_habits_state.py - migracion de datos puntual (one-off) para el estado de habitos.

Contexto: la app marcaba habitos no hechos como atrasados ("not finished", rojo) y
dejaba colgadas las instancias viejas (leftovers congelados por roll-forward). Decidido
con el usuario 2026-06-09: un habito no se atrasa; un dia saltado simplemente lapsa y lo
unico que importa es done/no-done por dia, que vive en el tracker (habit_logs).

Este script:
  1) BACKFILL: pone is_habit=1 en todas las tareas vivas de los proyectos de habito
     (COSAS DIARIAS, CUIDADO PERSONAL, APRENDER C++) que tengan is_habit=0.
  2) LIMPIEZA: soft-delete de los leftovers viejos = tareas vivas de esos proyectos con
     done=0, day < hoy y sin recurrencia activa (instancias congeladas). El tracker ya
     guarda el done/no-done por dia, asi que estas no aportan nada y solo ensucian.

Reusa la logica de outbox de plan_cli.py (bump updated_at+version + encolar outbox) para
no romper la sync con Supabase. App abierta OK (busy_timeout).

Uso:
  python tools/fix_habits_state.py            # DRY-RUN: muestra que haria, no toca nada
  python tools/fix_habits_state.py --apply    # aplica los cambios
"""

import argparse
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import plan_cli as pc  # noqa: E402

HABIT_PROJECTS = ["COSAS DIARIAS", "CUIDADO PERSONAL", "APRENDER C++"]


def main():
    ap = argparse.ArgumentParser(description="Fix estado de habitos (backfill is_habit + limpieza leftovers)")
    ap.add_argument("--apply", action="store_true", help="aplica los cambios (sin esto = dry-run)")
    args = ap.parse_args()

    con = pc.connect()
    today = datetime.now().strftime("%Y-%m-%d")
    dry = not args.apply
    print(f"{'DRY-RUN (no se toca nada)' if dry else 'APLICANDO CAMBIOS'} | hoy={today}\n")

    backfilled = 0
    cleaned = 0

    for name in HABIT_PROJECTS:
        proj = pc.resolve_project(con, name)
        pid = proj["id"]

        # 1) BACKFILL is_habit=1
        to_flag = list(con.execute(
            "SELECT * FROM tasks WHERE deleted_at IS NULL AND project_id=? AND is_habit=0",
            (pid,)))
        print(f"[{name}] backfill is_habit=1: {len(to_flag)} tareas")
        for r in to_flag:
            if not dry:
                pc.patch_task(con, r, is_habit=1)
            backfilled += 1

        # 2) LIMPIEZA de leftovers viejos (done=0, dia pasado, sin recurrencia activa)
        leftovers = list(con.execute(
            "SELECT * FROM tasks WHERE deleted_at IS NULL AND project_id=? AND done=0 "
            "AND day < ? AND (recurrence IS NULL OR recurrence='')",
            (pid, today)))
        rng = (min((r["day"] for r in leftovers), default="-"),
               max((r["day"] for r in leftovers), default="-"))
        print(f"[{name}] soft-delete leftovers: {len(leftovers)} (rango {rng[0]}..{rng[1]})")
        for r in leftovers:
            if not dry:
                pc.patch_task(con, r, deleted_at=pc.now_iso())
            cleaned += 1
        print()

    print(f"TOTAL: backfill={backfilled}  limpieza={cleaned}")
    if dry:
        print("\n(esto fue un dry-run; corre con --apply para ejecutar)")


if __name__ == "__main__":
    main()
