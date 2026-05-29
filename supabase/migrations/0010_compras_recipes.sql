-- Compras module A2: recipes (with steps) and their ingredients.

create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  servings integer not null default 1,
  meal_type text not null default 'lunch_dinner',  -- 'breakfast_snack' | 'lunch_dinner'
  steps jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create index if not exists recipes_user_idx on public.recipes (user_id);
create index if not exists recipes_user_updated_idx on public.recipes (user_id, updated_at);

create trigger recipes_bump_meta
before update on public.recipes
for each row execute function public.bump_row_meta();

alter table public.recipes enable row level security;
create policy "recipes_select_own" on public.recipes for select using (user_id = auth.uid());
create policy "recipes_insert_own" on public.recipes for insert with check (user_id = auth.uid());
create policy "recipes_update_own" on public.recipes for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "recipes_delete_own" on public.recipes for delete using (user_id = auth.uid());
alter publication supabase_realtime add table public.recipes;

create table if not exists public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  quantity double precision not null default 0,  -- base unit, total for `servings`
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create index if not exists recipe_ingredients_user_idx on public.recipe_ingredients (user_id);
create index if not exists recipe_ingredients_recipe_idx on public.recipe_ingredients (recipe_id);
create index if not exists recipe_ingredients_user_updated_idx on public.recipe_ingredients (user_id, updated_at);

create trigger recipe_ingredients_bump_meta
before update on public.recipe_ingredients
for each row execute function public.bump_row_meta();

alter table public.recipe_ingredients enable row level security;
create policy "recipe_ingredients_select_own" on public.recipe_ingredients for select using (user_id = auth.uid());
create policy "recipe_ingredients_insert_own" on public.recipe_ingredients for insert with check (user_id = auth.uid());
create policy "recipe_ingredients_update_own" on public.recipe_ingredients for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "recipe_ingredients_delete_own" on public.recipe_ingredients for delete using (user_id = auth.uid());
alter publication supabase_realtime add table public.recipe_ingredients;
