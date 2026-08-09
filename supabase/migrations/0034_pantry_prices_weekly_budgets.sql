-- Espejo de src-tauri/migrations/0043_pantry_prices_weekly_budgets.sql

-- 1. Variantes a granel. En kind='bulk', `size` no se lee y `price` es el precio
--    por unidad base (g / ml / u).
alter table public.ingredient_presentations add column if not exists kind text not null default 'package';

-- 2. Comercios
create table if not exists public.merchants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  note text not null default '',
  position integer not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create index if not exists merchants_user_idx on public.merchants (user_id);

create trigger merchants_bump_meta
before update on public.merchants
for each row execute function public.bump_row_meta();

alter table public.merchants enable row level security;
create policy "merchants_select_own" on public.merchants for select using (user_id = auth.uid());
create policy "merchants_insert_own" on public.merchants for insert with check (user_id = auth.uid());
create policy "merchants_update_own" on public.merchants for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "merchants_delete_own" on public.merchants for delete using (user_id = auth.uid());
alter publication supabase_realtime add table public.merchants;

alter table public.expenses add column if not exists merchant_id uuid references public.merchants(id) on delete set null;

-- 3. Lineas de gasto ligadas al catalogo de ingredientes
alter table public.expense_line_items add column if not exists ingredient_id uuid references public.ingredients(id) on delete set null;
alter table public.expense_line_items add column if not exists presentation_id uuid references public.ingredient_presentations(id) on delete set null;
alter table public.expense_line_items add column if not exists base_quantity double precision not null default 0;
alter table public.expense_line_items add column if not exists add_to_stock boolean not null default false;
create index if not exists eli_ingredient_idx on public.expense_line_items (ingredient_id);

-- 4. Trazabilidad del lote creado desde una linea de gasto
alter table public.inventory add column if not exists source_line_item_id uuid;
create index if not exists inventory_source_line_idx on public.inventory (source_line_item_id);

-- 5. Presupuestos por periodo ('monthly' | 'weekly'); monthly_amount se lee como
--    "monto por periodo".
alter table public.budgets add column if not exists period text not null default 'monthly';

-- 6. Cantidad real para items de lista a granel (quantity es integer)
alter table public.shopping_items add column if not exists base_quantity double precision;

-- 7. Semana sabado->viernes: las week_start existentes son lunes (`date - int`
--    devuelve date en Postgres; con `interval` volveria timestamp).
update public.shopping_items set week_start = week_start - 2;
update public.meal_plan_entries set week_start = week_start - 2;
alter table public.shopping_items alter column week_start set default '2026-06-27';

-- 8. Drift local<->remoto acumulado: estas columnas existen en SQLite y
--    expenseToWire / savingsGoalToWire ya las empujan, pero ninguna migracion
--    del server las creo, asi que el push las venia descartando en silencio.
alter table public.expenses add column if not exists name text not null default '';
alter table public.savings_goals add column if not exists savings_percent integer not null default 0;
alter table public.savings_goals add column if not exists is_overflow_target boolean not null default false;
alter table public.savings_goals add column if not exists active boolean not null default true;
alter table public.savings_goals add column if not exists priority integer not null default 0;
