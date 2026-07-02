-- Listas de compras pasan a ser por semana (como Presupuesto es por mes).
-- Los items existentes (la unica lista plana que habia) quedan en la semana
-- actual al momento de esta migracion.

alter table public.shopping_items add column if not exists week_start date not null default '2026-06-29';
create index if not exists shopping_items_week_idx on public.shopping_items (week_start);
