-- FIX 2026-06-14: el contenido anterior era `ALTER TABLE coffee_beans DROP COLUMN
-- IF EXISTS order_threshold_grams;` que es SINTAXIS INVALIDA en SQLite (no existe
-- DROP COLUMN IF EXISTS). Eso hacia fallar la migracion y dejaba la base trabada
-- en la v21 en TODOS los aparatos (nadie tiene la 22 aplicada -> sin riesgo de
-- checksum). order_threshold_grams quedo como columna no usada NOT NULL DEFAULT 0
-- en bases viejas: es inofensiva (los INSERT andan por el default), asi que NO la
-- dropeamos (evita rebuild/deadlock). En instalaciones nuevas la columna ni existe.
-- Migracion no-op valida para mantener la numeracion y destrabar 23..28.
UPDATE coffee_beans SET version = version WHERE 0;
