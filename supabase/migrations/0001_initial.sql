-- calendar-app initial schema
-- Tables: projects, tasks. Categories are client-side enum.
-- All rows are scoped per user via Row-Level Security.

------------------------------------------------------------------------------
-- helper: trigger that bumps updated_at and version on every UPDATE
------------------------------------------------------------------------------
create or replace function public.bump_row_meta()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.version := old.version + 1;
  return new;
end;
$$;

------------------------------------------------------------------------------
-- projects
------------------------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category_id text not null,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create index projects_user_id_idx on public.projects (user_id);
create index projects_user_updated_idx on public.projects (user_id, updated_at);

create trigger projects_bump_meta
before update on public.projects
for each row execute function public.bump_row_meta();

alter table public.projects enable row level security;

create policy "projects_select_own" on public.projects
  for select using (user_id = auth.uid());
create policy "projects_insert_own" on public.projects
  for insert with check (user_id = auth.uid());
create policy "projects_update_own" on public.projects
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "projects_delete_own" on public.projects
  for delete using (user_id = auth.uid());

------------------------------------------------------------------------------
-- tasks
------------------------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  project_id uuid references public.projects(id) on delete set null,
  category_id text,
  priority text not null default 'med' check (priority in ('low', 'med', 'high')),
  duration integer not null default 30 check (duration > 0),
  actual_duration integer check (actual_duration is null or actual_duration > 0),
  day date,
  due date,
  recurring boolean not null default false,
  notes text not null default '',
  subtasks jsonb not null default '[]'::jsonb,
  done boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create index tasks_user_id_idx on public.tasks (user_id);
create index tasks_user_day_idx on public.tasks (user_id, day);
create index tasks_user_updated_idx on public.tasks (user_id, updated_at);
create index tasks_user_project_idx on public.tasks (user_id, project_id);

create trigger tasks_bump_meta
before update on public.tasks
for each row execute function public.bump_row_meta();

alter table public.tasks enable row level security;

create policy "tasks_select_own" on public.tasks
  for select using (user_id = auth.uid());
create policy "tasks_insert_own" on public.tasks
  for insert with check (user_id = auth.uid());
create policy "tasks_update_own" on public.tasks
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "tasks_delete_own" on public.tasks
  for delete using (user_id = auth.uid());

------------------------------------------------------------------------------
-- realtime: enable per-row updates so other devices of the same user
-- get pushed changes. RLS still applies to realtime payloads.
------------------------------------------------------------------------------
alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.projects;
