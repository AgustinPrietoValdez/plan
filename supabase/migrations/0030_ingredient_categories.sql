-- Ingredient categories: existe en el SQLite local (migraciones 0018/0019) pero
-- nunca se migro a Supabase. Sin esto, todo insert/update de "ingredients" con
-- category_id falla en el server (PGRST204 "Could not find the 'category_id'
-- column") y el outbox lo descarta despues de 5 intentos sin sincronizar nunca
-- (issue #20 / sesion 2026-07-04).

create table public.ingredient_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  hue integer not null check (hue >= 0 and hue < 360),
  position integer not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create index ingredient_categories_user_id_idx on public.ingredient_categories (user_id);
create index ingredient_categories_user_position_idx on public.ingredient_categories (user_id, position);
create index ingredient_categories_user_updated_idx on public.ingredient_categories (user_id, updated_at);

create trigger ingredient_categories_bump_meta
before update on public.ingredient_categories
for each row execute function public.bump_row_meta();

alter table public.ingredient_categories enable row level security;

create policy "ingredient_categories_select_own" on public.ingredient_categories
  for select using (user_id = auth.uid());
create policy "ingredient_categories_insert_own" on public.ingredient_categories
  for insert with check (user_id = auth.uid());
create policy "ingredient_categories_update_own" on public.ingredient_categories
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "ingredient_categories_delete_own" on public.ingredient_categories
  for delete using (user_id = auth.uid());

alter publication supabase_realtime add table public.ingredient_categories;

alter table public.ingredients
  add column category_id uuid references public.ingredient_categories(id);

create index ingredients_category_idx on public.ingredients (category_id);
