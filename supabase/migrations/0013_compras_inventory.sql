-- Compras module A5: inventory (what's at home) + meal log (what was eaten).

create table if not exists public.inventory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  quantity double precision not null default 0,  -- base unit
  expires_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create index if not exists inventory_user_idx on public.inventory (user_id);
create index if not exists inventory_ingredient_idx on public.inventory (ingredient_id);
create index if not exists inventory_user_updated_idx on public.inventory (user_id, updated_at);

create trigger inventory_bump_meta
before update on public.inventory
for each row execute function public.bump_row_meta();

alter table public.inventory enable row level security;
create policy "inventory_select_own" on public.inventory for select using (user_id = auth.uid());
create policy "inventory_insert_own" on public.inventory for insert with check (user_id = auth.uid());
create policy "inventory_update_own" on public.inventory for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "inventory_delete_own" on public.inventory for delete using (user_id = auth.uid());
alter publication supabase_realtime add table public.inventory;

create table if not exists public.meal_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  eaten_on date not null,
  meal_slot text not null default 'almuerzo',  -- desayuno | almuerzo | merienda | cena
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  servings double precision not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create index if not exists meal_log_user_idx on public.meal_log (user_id);
create index if not exists meal_log_user_day_idx on public.meal_log (user_id, eaten_on);
create index if not exists meal_log_user_updated_idx on public.meal_log (user_id, updated_at);

create trigger meal_log_bump_meta
before update on public.meal_log
for each row execute function public.bump_row_meta();

alter table public.meal_log enable row level security;
create policy "meal_log_select_own" on public.meal_log for select using (user_id = auth.uid());
create policy "meal_log_insert_own" on public.meal_log for insert with check (user_id = auth.uid());
create policy "meal_log_update_own" on public.meal_log for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "meal_log_delete_own" on public.meal_log for delete using (user_id = auth.uid());
alter publication supabase_realtime add table public.meal_log;
