-- Compras module A1: ingredient catalog with multiple presentations.

create table if not exists public.ingredients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  dimension text not null default 'count',  -- 'weight' | 'volume' | 'count'
  shelf_life_days integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create index if not exists ingredients_user_idx on public.ingredients (user_id);
create index if not exists ingredients_user_updated_idx on public.ingredients (user_id, updated_at);

create trigger ingredients_bump_meta
before update on public.ingredients
for each row execute function public.bump_row_meta();

alter table public.ingredients enable row level security;
create policy "ingredients_select_own" on public.ingredients for select using (user_id = auth.uid());
create policy "ingredients_insert_own" on public.ingredients for insert with check (user_id = auth.uid());
create policy "ingredients_update_own" on public.ingredients for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "ingredients_delete_own" on public.ingredients for delete using (user_id = auth.uid());
alter publication supabase_realtime add table public.ingredients;

create table if not exists public.ingredient_presentations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  label text not null,
  size double precision not null default 1,  -- in the ingredient's base unit
  price double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create index if not exists ingredient_presentations_user_idx on public.ingredient_presentations (user_id);
create index if not exists ingredient_presentations_ingredient_idx on public.ingredient_presentations (ingredient_id);
create index if not exists ingredient_presentations_user_updated_idx on public.ingredient_presentations (user_id, updated_at);

create trigger ingredient_presentations_bump_meta
before update on public.ingredient_presentations
for each row execute function public.bump_row_meta();

alter table public.ingredient_presentations enable row level security;
create policy "ingredient_presentations_select_own" on public.ingredient_presentations for select using (user_id = auth.uid());
create policy "ingredient_presentations_insert_own" on public.ingredient_presentations for insert with check (user_id = auth.uid());
create policy "ingredient_presentations_update_own" on public.ingredient_presentations for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "ingredient_presentations_delete_own" on public.ingredient_presentations for delete using (user_id = auth.uid());
alter publication supabase_realtime add table public.ingredient_presentations;
