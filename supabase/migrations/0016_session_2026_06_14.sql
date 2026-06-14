-- Session 2026-06-14: server-side schema for features #10, #13, #14, #9.
-- Idempotent / re-runnable (IF NOT EXISTS / DROP NOT NULL no-ops / guarded publication).

------------------------------------------------------------------------------
-- #10 Diario de cata: cata columns on coffee_beans
-- (coffee_beans was created out-of-band; ADD COLUMN IF NOT EXISTS is safe.)
------------------------------------------------------------------------------
alter table public.coffee_beans add column if not exists cata_inicial text not null default '';
alter table public.coffee_beans add column if not exists nota_final   text not null default '';
alter table public.coffee_beans add column if not exists last_tweak   jsonb;

------------------------------------------------------------------------------
-- #13 Tracker de Proyectos: objetivo / estado / milestones on projects
------------------------------------------------------------------------------
alter table public.projects add column if not exists objetivo   text  not null default '';
alter table public.projects add column if not exists estado     text  not null default 'activo';
alter table public.projects add column if not exists milestones jsonb not null default '[]'::jsonb;

------------------------------------------------------------------------------
-- #14 Recetas genericas: category slot on recipe_ingredients
------------------------------------------------------------------------------
alter table public.recipe_ingredients alter column ingredient_id drop not null;
alter table public.recipe_ingredients add column if not exists category_id uuid;

------------------------------------------------------------------------------
-- #9 Telemetria: brew_sessions header + datapoints JSON blob
------------------------------------------------------------------------------
create table if not exists public.brew_sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  recipe_id uuid,
  recipe_name text not null default '',
  bean_id uuid,
  bean_name text not null default '',
  dose_grams double precision not null default 0,
  total_water_grams double precision not null default 0,
  duration_ms integer not null default 0,
  notes text not null default '',
  datapoints jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create index if not exists brew_sessions_user_idx on public.brew_sessions (user_id);
create index if not exists brew_sessions_user_updated_idx on public.brew_sessions (user_id, updated_at);

drop trigger if exists brew_sessions_bump_meta on public.brew_sessions;
create trigger brew_sessions_bump_meta
  before update on public.brew_sessions
  for each row execute function public.bump_row_meta();

alter table public.brew_sessions enable row level security;

drop policy if exists "brew_sessions_select_own" on public.brew_sessions;
drop policy if exists "brew_sessions_insert_own" on public.brew_sessions;
drop policy if exists "brew_sessions_update_own" on public.brew_sessions;
drop policy if exists "brew_sessions_delete_own" on public.brew_sessions;
create policy "brew_sessions_select_own" on public.brew_sessions for select using (user_id = auth.uid());
create policy "brew_sessions_insert_own" on public.brew_sessions for insert with check (user_id = auth.uid());
create policy "brew_sessions_update_own" on public.brew_sessions for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "brew_sessions_delete_own" on public.brew_sessions for delete using (user_id = auth.uid());

-- add to realtime publication only if not already a member
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'brew_sessions'
  ) then
    alter publication supabase_realtime add table public.brew_sessions;
  end if;
end $$;
