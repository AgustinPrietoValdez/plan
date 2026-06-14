#!/usr/bin/env python3
"""
coffee_cli.py - CLI de cafe de la app "Plan". Hermano de plan_cli.py.

Para que Claude (desde la terminal del boton "Analizar") escriba en la app SIN romper
la sync: replica el patron OUTBOX (UPDATE/INSERT en la tabla + INSERT en `outbox` con
payload snake_case = *ToWire del front; bump updated_at + version). Ver plan_cli.py / AI.md.

Dos cosas que escribe el asistente:
  1) RECETA ESPECIFICA del grano: una fila de coffee_recipes con bean_id + base_recipe_id
     (version, ajustada para ese cafe, de una receta general). En el brew, al elegir la
     receta general de ese grano, la app levanta esta version.
  2) TWEAK (ultimo ajuste): coffee_beans.last_tweak (unico por grano). Lo lee la pantalla
     pre-dosis para aplicar por variable. Vos lo generas al terminar un brew; aca lo puede
     escribir el asistente cuando le pasas info de sabor.

DB: %APPDATA%\\com.agusp.calendarapp\\calendar.db

Uso:
  python tools/coffee_cli.py show <grano>                 # ficha + last_tweak + recetas del grano
  python tools/coffee_cli.py recipes                      # recetas GENERALES (id + nombre)
  python tools/coffee_cli.py add-recipe <nombre> [--coffee-type ..] [--ratio ..] [--temp ..] [--grind ..] [--notes ..] [--steps '<json-array>']
  python tools/coffee_cli.py set-tweak <grano> [--grind ..] [--temp ..] [--dose ..] [--water ..] [--notes ..] [--recipe <substr>]
  python tools/coffee_cli.py set-recipe <grano> <receta-base> [--ratio ..] [--temp ..] [--grind ..] [--notes ..] [--steps '<json-array>']
"""

import argparse
import json
import os
import sqlite3
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path


def db_path() -> Path:
    appdata = os.environ.get("APPDATA")
    base = Path(appdata) if appdata else (Path.home() / "AppData" / "Roaming")
    p = base / "com.agusp.calendarapp" / "calendar.db"
    if not p.exists():
        sys.exit(f"No encuentro la DB en {p}")
    return p


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + \
        f"{datetime.now(timezone.utc).microsecond // 1000:03d}Z"


def connect() -> sqlite3.Connection:
    con = sqlite3.connect(str(db_path()))
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA busy_timeout = 5000")
    return con


def enqueue(con, user_id, op, entity, entity_id, payload):
    con.execute(
        "INSERT INTO outbox (user_id, op, entity, entity_id, payload, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (user_id, op, entity, entity_id, json.dumps(payload), now_iso()),
    )


def find_bean(con, substr):
    rows = list(con.execute("SELECT * FROM coffee_beans WHERE deleted_at IS NULL"))
    hits = [r for r in rows if substr.lower() in (r["name"] or "").lower()]
    if not hits:
        nombres = ", ".join(r["name"] for r in rows)
        sys.exit(f"Ningun grano matchea '{substr}'. Hay: {nombres}")
    if len(hits) > 1:
        sys.exit(f"'{substr}' matchea varios: {', '.join(r['name'] for r in hits)}")
    return hits[0]


def find_general_recipe(con, substr):
    rows = list(con.execute(
        "SELECT * FROM coffee_recipes WHERE deleted_at IS NULL AND base_recipe_id IS NULL"))
    hits = [r for r in rows if substr.lower() in (r["name"] or "").lower()]
    if not hits:
        nombres = ", ".join(r["name"] for r in rows)
        sys.exit(f"Ninguna receta general matchea '{substr}'. Hay: {nombres}")
    if len(hits) > 1:
        sys.exit(f"'{substr}' matchea varias recetas: {', '.join(r['name'] for r in hits)}")
    return hits[0]


def bean_to_wire(b, last_tweak_obj, updated_at, version):
    return {
        "id": b["id"], "user_id": b["user_id"], "name": b["name"], "roaster": b["roaster"],
        "varietal": b["varietal"], "country": b["country"], "process": b["process"],
        "producer": b["producer"], "roasted_on": b["roasted_on"], "weight_grams": b["weight_grams"],
        "notes": b["notes"], "cata_inicial": b["cata_inicial"], "nota_final": b["nota_final"],
        "last_tweak": last_tweak_obj, "finished_at": b["finished_at"],
        "created_at": b["created_at"], "updated_at": updated_at,
        "deleted_at": b["deleted_at"], "version": version,
    }


def recipe_to_wire(r, steps_list, updated_at, version):
    return {
        "id": r["id"], "user_id": r["user_id"], "name": r["name"], "coffee_type": r["coffee_type"],
        "ratio": r["ratio"], "temp_celsius": r["temp_celsius"], "grind_size": r["grind_size"],
        "steps": steps_list, "notes": r["notes"],
        "bean_id": r["bean_id"], "base_recipe_id": r["base_recipe_id"],
        "created_at": r["created_at"], "updated_at": updated_at,
        "deleted_at": r["deleted_at"], "version": version,
    }


# ---------- comandos ----------

def cmd_show(args):
    con = connect()
    b = find_bean(con, args.bean)
    print(f"=== {b['name']} ({b['roaster']}) ===")
    for k in ("country", "varietal", "process", "producer", "roasted_on", "weight_grams"):
        if b[k] not in (None, "", 0):
            print(f"  {k}: {b[k]}")
    print(f"  cata_inicial: {b['cata_inicial'] or '(vacia)'}")
    print(f"  nota_final: {b['nota_final'] or '(vacia)'}")
    lt = b["last_tweak"]
    print(f"  last_tweak: {lt if lt else '(ninguno)'}")
    specs = list(con.execute(
        "SELECT * FROM coffee_recipes WHERE bean_id = ? AND deleted_at IS NULL", (b["id"],)))
    print(f"  recetas especificas de este grano: {len(specs)}")
    for r in specs:
        print(f"    - {r['name']} (base={r['base_recipe_id']}) 1:{r['ratio']} {r['temp_celsius']}C molienda={r['grind_size']}")


def cmd_recipes(args):
    con = connect()
    rows = list(con.execute(
        "SELECT * FROM coffee_recipes WHERE deleted_at IS NULL AND base_recipe_id IS NULL ORDER BY created_at"))
    if not rows:
        print("Sin recetas generales.")
        return
    for r in rows:
        print(f"{r['id']}  {r['name']}  (1:{r['ratio']} {r['temp_celsius']}C molienda={r['grind_size']})")


def cmd_add_recipe(args):
    con = connect()
    # un solo user_id en la app local; lo tomamos de cualquier fila existente
    row = con.execute("SELECT user_id FROM coffee_beans WHERE deleted_at IS NULL LIMIT 1").fetchone() \
        or con.execute("SELECT user_id FROM coffee_recipes WHERE deleted_at IS NULL LIMIT 1").fetchone()
    if not row:
        sys.exit("No encuentro user_id (no hay granos ni recetas cargadas).")
    user_id = row["user_id"]

    existing = con.execute(
        "SELECT name FROM coffee_recipes WHERE base_recipe_id IS NULL AND bean_id IS NULL "
        "AND deleted_at IS NULL AND lower(name) = lower(?) LIMIT 1", (args.name,)).fetchone()
    if existing:
        sys.exit(f"Ya existe una receta general llamada '{args.name}'.")

    steps_list = []
    if args.steps:
        try:
            steps_list = json.loads(args.steps)
            assert isinstance(steps_list, list)
        except (json.JSONDecodeError, AssertionError):
            sys.exit("--steps debe ser un array JSON valido.")
    steps_json = json.dumps(steps_list)

    ts = now_iso()
    rid = str(uuid.uuid4())
    con.execute(
        "INSERT INTO coffee_recipes (id, user_id, name, coffee_type, ratio, temp_celsius, "
        "grind_size, steps, notes, bean_id, base_recipe_id, created_at, updated_at, deleted_at, version) "
        "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (rid, user_id, args.name, args.coffee_type, args.ratio, args.temp, args.grind, steps_json,
         args.notes or "", None, None, ts, ts, None, 1),
    )
    row = {"id": rid, "user_id": user_id, "name": args.name, "coffee_type": args.coffee_type,
           "ratio": args.ratio, "temp_celsius": args.temp, "grind_size": args.grind,
           "notes": args.notes or "", "bean_id": None, "base_recipe_id": None,
           "created_at": ts, "deleted_at": None}
    enqueue(con, user_id, "insert", "coffee_recipes", rid, recipe_to_wire(row, steps_list, ts, 1))
    con.commit()
    print(f"Receta general '{args.name}' CREADA (id={rid}).")


def cmd_set_tweak(args):
    con = connect()
    b = find_bean(con, args.bean)
    recipe_id = None
    if args.recipe:
        recipe_id = find_general_recipe(con, args.recipe)["id"]
    tweak = {}
    if args.grind:
        tweak["grindSize"] = args.grind
    if args.dose is not None:
        tweak["doseGrams"] = args.dose
    if args.water is not None:
        tweak["totalWaterGrams"] = args.water
    if args.temp is not None:
        tweak["tempCelsius"] = args.temp
    tweak["notes"] = args.notes or ""
    if recipe_id:
        tweak["recipeId"] = recipe_id
    tweak["at"] = now_iso()

    ts = now_iso()
    version = (b["version"] or 0) + 1
    con.execute(
        "UPDATE coffee_beans SET last_tweak = ?, updated_at = ?, version = ? WHERE id = ? AND user_id = ?",
        (json.dumps(tweak), ts, version, b["id"], b["user_id"]),
    )
    enqueue(con, b["user_id"], "update", "coffee_beans", b["id"], bean_to_wire(b, tweak, ts, version))
    con.commit()
    print(f"Tweak de '{b['name']}' actualizado: {json.dumps(tweak, ensure_ascii=False)}")


def cmd_set_recipe(args):
    con = connect()
    b = find_bean(con, args.bean)
    base = find_general_recipe(con, args.base)

    steps = None
    if args.steps:
        try:
            steps = json.loads(args.steps)
            assert isinstance(steps, list)
        except (json.JSONDecodeError, AssertionError):
            sys.exit("--steps debe ser un array JSON valido.")

    existing = con.execute(
        "SELECT * FROM coffee_recipes WHERE bean_id = ? AND base_recipe_id = ? AND deleted_at IS NULL LIMIT 1",
        (b["id"], base["id"]),
    ).fetchone()

    ts = now_iso()
    ratio = args.ratio if args.ratio is not None else base["ratio"]
    temp = args.temp if args.temp is not None else base["temp_celsius"]
    grind = args.grind if args.grind is not None else base["grind_size"]
    notes = args.notes if args.notes is not None else base["notes"]
    steps_list = steps if steps is not None else json.loads(base["steps"] or "[]")
    steps_json = json.dumps(steps_list)

    if existing:
        version = (existing["version"] or 0) + 1
        con.execute(
            "UPDATE coffee_recipes SET ratio = ?, temp_celsius = ?, grind_size = ?, steps = ?, "
            "notes = ?, updated_at = ?, version = ? WHERE id = ? AND user_id = ?",
            (ratio, temp, grind, steps_json, notes, ts, version, existing["id"], existing["user_id"]),
        )
        merged = dict(existing)
        merged.update({"ratio": ratio, "temp_celsius": temp, "grind_size": grind, "notes": notes})
        enqueue(con, existing["user_id"], "update", "coffee_recipes", existing["id"],
                recipe_to_wire(merged, steps_list, ts, version))
        con.commit()
        print(f"Receta especifica de '{b['name']}' (base '{base['name']}') ACTUALIZADA.")
    else:
        rid = str(uuid.uuid4())
        con.execute(
            "INSERT INTO coffee_recipes (id, user_id, name, coffee_type, ratio, temp_celsius, "
            "grind_size, steps, notes, bean_id, base_recipe_id, created_at, updated_at, deleted_at, version) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (rid, b["user_id"], base["name"], base["coffee_type"], ratio, temp, grind, steps_json,
             notes, b["id"], base["id"], ts, ts, None, 1),
        )
        row = {"id": rid, "user_id": b["user_id"], "name": base["name"], "coffee_type": base["coffee_type"],
               "ratio": ratio, "temp_celsius": temp, "grind_size": grind, "notes": notes,
               "bean_id": b["id"], "base_recipe_id": base["id"], "created_at": ts, "deleted_at": None}
        enqueue(con, b["user_id"], "insert", "coffee_recipes", rid,
                recipe_to_wire(row, steps_list, ts, 1))
        con.commit()
        print(f"Receta especifica de '{b['name']}' (base '{base['name']}') CREADA.")


def main():
    p = argparse.ArgumentParser(description="CLI cafe app Plan (recetas especificas + tweaks)")
    sub = p.add_subparsers(dest="cmd", required=True)

    sp = sub.add_parser("show"); sp.add_argument("bean")
    sub.add_parser("recipes")

    sp = sub.add_parser("add-recipe"); sp.add_argument("name")
    sp.add_argument("--coffee-type", dest="coffee_type", default="v60")
    sp.add_argument("--ratio", type=float, default=None)
    sp.add_argument("--temp", type=float, default=None)
    sp.add_argument("--grind", default=None)
    sp.add_argument("--notes", default=None)
    sp.add_argument("--steps", default=None, help="array JSON de pasos")

    sp = sub.add_parser("set-tweak"); sp.add_argument("bean")
    sp.add_argument("--grind", default=None)
    sp.add_argument("--temp", type=float, default=None)
    sp.add_argument("--dose", type=float, default=None)
    sp.add_argument("--water", type=float, default=None)
    sp.add_argument("--notes", default=None)
    sp.add_argument("--recipe", default=None, help="receta base a la que aplica (substr)")

    sp = sub.add_parser("set-recipe"); sp.add_argument("bean"); sp.add_argument("base")
    sp.add_argument("--ratio", type=float, default=None)
    sp.add_argument("--temp", type=float, default=None)
    sp.add_argument("--grind", default=None)
    sp.add_argument("--notes", default=None)
    sp.add_argument("--steps", default=None, help="array JSON de pasos (reemplaza los de la base)")

    args = p.parse_args()
    if args.cmd == "show": cmd_show(args)
    elif args.cmd == "recipes": cmd_recipes(args)
    elif args.cmd == "add-recipe": cmd_add_recipe(args)
    elif args.cmd == "set-tweak": cmd_set_tweak(args)
    elif args.cmd == "set-recipe": cmd_set_recipe(args)


if __name__ == "__main__":
    main()
