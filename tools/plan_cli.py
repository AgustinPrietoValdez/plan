#!/usr/bin/env python3
"""
plan_cli.py - CLI de tareas de la app "Plan" (calendar-app). Vive en este repo (tools/).

Para que Claude (o el usuario) levante / actualice las tareas de CUALQUIER proyecto
que viven en la app, SIN abrir la app y SIN romper la sync.
(Hasta 2026-06-06 vivia en cargo_bot_ws/tools/; movido aca, resuelve el issue #2.)

La app es offline-first (Tauri + SQLite + Supabase) con patron OUTBOX:
  - toda mutacion local hace UPDATE en la tabla + INSERT en `outbox`
  - al abrir la app, `drainOutbox` empuja el outbox al server (upsert)
  - el pull del server usa `updated_at > last_sync`, asi que filas viejas no pisan
    lo que escribimos aca (ver docs/PLAN_TASKS.md / notas de diseno).
Este script REPLICA ese patron: cada mutacion bumpea updated_at=now + version+1 y
encola la fila en `outbox`. Asi la app sincroniza como si lo hubieras tocado vos.

IMPORTANTE: corre esto con la app Plan CERRADA (SQLite WAL: un solo escritor).

DB: %APPDATA%\\com.agusp.calendarapp\\calendar.db
Proyectos: TODOS por default; filtrar con -p/--project <nombre|substring> (ej -p CARGO_BOT).

Uso:
  python tools/plan_cli.py show                 # pendientes de TODOS los proyectos
  python tools/plan_cli.py show --today         # solo las de HOY + atrasadas no-habito
  python tools/plan_cli.py show -p CARGO_BOT    # solo un proyecto
  python tools/plan_cli.py show --all           # incluye completadas
  python tools/plan_cli.py task <substr>        # detalle + subtareas (busca en todos)
  python tools/plan_cli.py check <substr> <i>   # marca subtarea i como hecha
  python tools/plan_cli.py uncheck <substr> <i>
  python tools/plan_cli.py complete <substr>    # marca la tarea como done
  python tools/plan_cli.py reopen <substr>      # vuelve la tarea a pendiente
  python tools/plan_cli.py set-subtasks <substr> <json-array>   # reemplaza subtareas
"""

import argparse
import json
import os
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

NO_PROJECT = "(sin proyecto)"


def db_path() -> Path:
    appdata = os.environ.get("APPDATA")
    base = Path(appdata) if appdata else (Path.home() / "AppData" / "Roaming")
    p = base / "com.agusp.calendarapp" / "calendar.db"
    if not p.exists():
        sys.exit(f"No encuentro la DB en {p}")
    return p


def now_iso() -> str:
    # mismo formato que el now() de la app: new Date().toISOString() -> ...Z
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + \
        f"{datetime.now(timezone.utc).microsecond // 1000:03d}Z"


def connect() -> sqlite3.Connection:
    con = sqlite3.connect(str(db_path()))
    con.row_factory = sqlite3.Row
    return con


def project_names(con):
    """Mapa id -> nombre de proyectos vivos."""
    return {r["id"]: r["name"] for r in con.execute(
        "SELECT id, name FROM projects WHERE deleted_at IS NULL")}


def resolve_project(con, name):
    """Devuelve la fila del proyecto que matchea `name` (exacto o substring, case-insensitive)."""
    rows = list(con.execute("SELECT * FROM projects WHERE deleted_at IS NULL"))
    exact = [r for r in rows if r["name"].lower() == name.lower()]
    if exact:
        return exact[0]
    hits = [r for r in rows if name.lower() in r["name"].lower()]
    if len(hits) == 1:
        return hits[0]
    nombres = ", ".join(r["name"] for r in rows)
    if not hits:
        sys.exit(f"No existe proyecto que matchee '{name}'. Disponibles: {nombres}")
    sys.exit(f"'{name}' matchea varios proyectos: {', '.join(r['name'] for r in hits)}")


def list_tasks(con, project=None, include_done=False):
    """Tareas (todas, o de un proyecto si `project` viene). Devuelve filas de tasks."""
    q = "SELECT * FROM tasks WHERE deleted_at IS NULL"
    params = []
    if project:
        proj = resolve_project(con, project)
        q += " AND project_id = ?"
        params.append(proj["id"])
    if not include_done:
        q += " AND done = 0"
    q += " ORDER BY done, day, created_at"
    return list(con.execute(q, params))


def find_task(con, substr, project=None):
    rows = list_tasks(con, project=project, include_done=True)
    hits = [r for r in rows if substr.lower() in (r["title"] or "").lower()]
    if not hits:
        sys.exit(f"Ninguna tarea matchea '{substr}'.")
    if len(hits) > 1:
        names = project_names(con)
        # desambiguar: preferir pendientes si las completadas duplican el titulo
        pending = [r for r in hits if not r["done"]]
        if len(pending) == 1:
            return pending[0]
        titles = "\n  - ".join(
            f"[{names.get(r['project_id'], NO_PROJECT)}] {r['title']} (dia={r['day']})"
            for r in hits)
        sys.exit(f"'{substr}' matchea varias tareas, se mas especifico o usa -p:\n  - {titles}")
    return hits[0]


def parse_subtasks(raw):
    if not raw:
        return []
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return []


def task_to_wire(t: dict, subtasks):
    """Payload de outbox identico al taskToWire() del front (snake_case, tipos JS)."""
    def b(v):  # int 0/1 -> bool
        return bool(v)
    return {
        "id": t["id"],
        "user_id": t["user_id"],
        "title": t["title"],
        "project_id": t["project_id"],
        "category_id": t["category_id"],
        "priority": t["priority"],
        "duration": t["duration"],
        "actual_duration": t["actual_duration"],
        "day": t["day"],
        "due": t["due"],
        "recurring": b(t["recurring"]),
        "recurrence": json.loads(t["recurrence"]) if t["recurrence"] else None,
        "recurrence_parent_id": t["recurrence_parent_id"],
        "notes": t["notes"],
        "subtasks": subtasks,
        "done": b(t["done"]),
        "is_habit": b(t["is_habit"]),
        "completed_at": t["completed_at"],
        "created_at": t["created_at"],
        "updated_at": t["updated_at"],
        "deleted_at": t["deleted_at"],
        "version": t["version"],
    }


def patch_task(con, row, **changes):
    """Replica patchTask(): UPDATE (updated_at=now, version+1) + enqueue outbox 'update'."""
    t = dict(row)
    subtasks = changes.pop("subtasks", parse_subtasks(t["subtasks"]))
    t.update(changes)
    t["updated_at"] = now_iso()
    t["version"] = (t["version"] or 0) + 1

    con.execute(
        """UPDATE tasks SET
             title=?, project_id=?, category_id=?, priority=?, duration=?,
             actual_duration=?, day=?, due=?, recurring=?, recurrence=?,
             recurrence_parent_id=?, notes=?, subtasks=?, done=?,
             is_habit=?, completed_at=?, updated_at=?, deleted_at=?, version=?
           WHERE id=? AND user_id=?""",
        (
            t["title"], t["project_id"], t["category_id"], t["priority"], t["duration"],
            t["actual_duration"], t["day"], t["due"], t["recurring"], t["recurrence"],
            t["recurrence_parent_id"], t["notes"], json.dumps(subtasks), t["done"],
            t["is_habit"], t["completed_at"], t["updated_at"], t["deleted_at"], t["version"],
            t["id"], t["user_id"],
        ),
    )
    payload = task_to_wire(t, subtasks)
    con.execute(
        "INSERT INTO outbox (user_id, op, entity, entity_id, payload, created_at) "
        "VALUES (?, 'update', 'tasks', ?, ?, ?)",
        (t["user_id"], t["id"], json.dumps(payload), now_iso()),
    )
    con.commit()
    return t


# ---------- comandos ----------

def cmd_show(args):
    con = connect()
    rows = list_tasks(con, project=args.project, include_done=args.all)
    today = datetime.now().strftime("%Y-%m-%d")
    if args.today:
        # vista del dia: lo de HOY + atrasadas NO-habito (los habitos viejos son recurrencias vencidas, ruido)
        rows = [r for r in rows if not r["done"] and r["day"] and (
            r["day"] == today or (r["day"] < today and not r["is_habit"]))]
    if not rows:
        print("Sin tareas.")
        return
    names = project_names(con)
    # agrupar por proyecto
    groups = {}
    for r in rows:
        groups.setdefault(names.get(r["project_id"], NO_PROJECT), []).append(r)
    total = len(rows)
    print(f"{total} tareas en {len(groups)} proyectos" + ("  (vista HOY)" if args.today else "") + "\n")
    for pname in sorted(groups):
        print(f"=== {pname} ===")
        for r in groups[pname]:
            subs = parse_subtasks(r["subtasks"])
            done_subs = sum(1 for s in subs if s.get("done"))
            mark = "[x]" if r["done"] else "[ ]"
            tag = ""
            if not r["done"] and r["day"]:
                if r["day"] == today:
                    tag = "  <== HOY"
                elif r["day"] < today:
                    tag = "  (atrasada)"
            prog = f"  ({done_subs}/{len(subs)} subtareas)" if subs else ""
            print(f"{mark} {r['title']}{tag}")
            print(f"      dia={r['day']}  prioridad={r['priority']}  dur={r['duration']}min{prog}")
            if args.notes and r["notes"]:
                for line in r["notes"].splitlines():
                    print(f"      | {line}")
        print()


def cmd_task(args):
    con = connect()
    r = find_task(con, args.substr, project=args.project)
    subs = parse_subtasks(r["subtasks"])
    names = project_names(con)
    print(f"[{names.get(r['project_id'], NO_PROJECT)}]")
    print(f"{'[x]' if r['done'] else '[ ]'} {r['title']}")
    print(f"  dia={r['day']}  prioridad={r['priority']}  dur={r['duration']}min  done={bool(r['done'])}")
    print(f"  id={r['id']}")
    if r["notes"]:
        print("  notas:")
        for line in r["notes"].splitlines():
            print(f"    {line}")
    print("  subtareas:")
    if not subs:
        print("    (ninguna)")
    for i, s in enumerate(subs):
        print(f"    [{i}] {'[x]' if s.get('done') else '[ ]'} {s.get('title','')}")


def cmd_check(args, value):
    con = connect()
    r = find_task(con, args.substr, project=args.project)
    subs = parse_subtasks(r["subtasks"])
    if not (0 <= args.index < len(subs)):
        sys.exit(f"Indice {args.index} fuera de rango (0..{len(subs)-1}).")
    subs[args.index]["done"] = value
    patch_task(con, r, subtasks=subs)
    state = "hecha" if value else "pendiente"
    print(f"Subtarea [{args.index}] '{subs[args.index].get('title','')}' -> {state}.")
    # auto-completar la tarea si todas las subtareas estan hechas
    if subs and all(s.get("done") for s in subs) and not r["done"]:
        print("(todas las subtareas estan hechas; podes 'complete' la tarea)")


def cmd_complete(args, done):
    con = connect()
    r = find_task(con, args.substr, project=args.project)
    patch_task(con, r, done=1 if done else 0,
               completed_at=now_iso() if done else None)
    print(f"Tarea '{r['title']}' -> {'completada' if done else 'reabierta (pendiente)'}.")


def cmd_set_subtasks(args):
    con = connect()
    r = find_task(con, args.substr, project=args.project)
    try:
        subs = json.loads(args.json)
        assert isinstance(subs, list)
    except (json.JSONDecodeError, AssertionError):
        sys.exit("El argumento json debe ser un array JSON.")
    # normaliza: cada item necesita id/title/done
    norm = []
    for i, s in enumerate(subs):
        if isinstance(s, str):
            s = {"title": s}
        norm.append({
            "id": s.get("id") or f"cli_{int(datetime.now().timestamp()*1000)}_{i}",
            "title": s.get("title", ""),
            "done": bool(s.get("done", False)),
        })
    patch_task(con, r, subtasks=norm)
    print(f"Tarea '{r['title']}': {len(norm)} subtareas seteadas.")


def main():
    p = argparse.ArgumentParser(description="CLI tareas app Plan (todos los proyectos)")
    sub = p.add_subparsers(dest="cmd", required=True)

    def add_project_arg(sp):
        sp.add_argument("-p", "--project", default=None,
                        help="filtrar por proyecto (nombre o substring); default = todos")

    sp = sub.add_parser("show")
    sp.add_argument("--all", action="store_true", help="incluye completadas")
    sp.add_argument("--today", action="store_true", help="solo HOY + atrasadas no-habito")
    sp.add_argument("--notes", action="store_true", help="imprime las notas (default NO)")
    add_project_arg(sp)
    sp = sub.add_parser("task"); sp.add_argument("substr"); add_project_arg(sp)
    sp = sub.add_parser("check"); sp.add_argument("substr"); sp.add_argument("index", type=int); add_project_arg(sp)
    sp = sub.add_parser("uncheck"); sp.add_argument("substr"); sp.add_argument("index", type=int); add_project_arg(sp)
    sp = sub.add_parser("complete"); sp.add_argument("substr"); add_project_arg(sp)
    sp = sub.add_parser("reopen"); sp.add_argument("substr"); add_project_arg(sp)
    sp = sub.add_parser("set-subtasks"); sp.add_argument("substr"); sp.add_argument("json"); add_project_arg(sp)

    args = p.parse_args()
    if args.cmd == "show": cmd_show(args)
    elif args.cmd == "task": cmd_task(args)
    elif args.cmd == "check": cmd_check(args, True)
    elif args.cmd == "uncheck": cmd_check(args, False)
    elif args.cmd == "complete": cmd_complete(args, True)
    elif args.cmd == "reopen": cmd_complete(args, False)
    elif args.cmd == "set-subtasks": cmd_set_subtasks(args)


if __name__ == "__main__":
    main()
