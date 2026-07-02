-- Listas de compras pasan a ser por semana (como Presupuesto es por mes).
-- Los items existentes (la unica lista plana que habia) quedan en la semana
-- actual al momento de esta migracion.

ALTER TABLE shopping_items ADD COLUMN week_start TEXT NOT NULL DEFAULT '2026-06-29';
CREATE INDEX IF NOT EXISTS shopping_items_week_idx ON shopping_items(week_start);
