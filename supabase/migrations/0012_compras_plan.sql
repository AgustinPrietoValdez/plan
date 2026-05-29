-- Compras module A4: weekly meal plan (a pool of recipes + target servings).

create table if not exists public.meal_plan_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  target_servings integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create index if not exists meal_plan_entries_user_idx on public.meal_plan_entries (user_id);
create index if not exists meal_plan_entries_user_week_idx on public.meal_plan_entries (user_id, week_start);
create index if not exists meal_plan_entries_user_updated_idx on public.meal_plan_entries (user_id, updated_at);

create trigger meal_plan_entries_bump_meta
before update on public.meal_plan_entries
for each row execute function public.bump_row_meta();

alter table public.meal_plan_entries enable row level security;
create policy "meal_plan_entries_select_own" on public.meal_plan_entries for select using (user_id = auth.uid());
create policy "meal_plan_entries_insert_own" on public.meal_plan_entries for insert with check (user_id = auth.uid());
create policy "meal_plan_entries_update_own" on public.meal_plan_entries for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "meal_plan_entries_delete_own" on public.meal_plan_entries for delete using (user_id = auth.uid());
alter publication supabase_realtime add table public.meal_plan_entries;
