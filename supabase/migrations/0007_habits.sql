-- Habit tracking: flag tasks as habits and log daily completions.

alter table public.tasks add column if not exists is_habit boolean not null default false;

create table if not exists public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  day date not null,
  done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  unique (user_id, task_id, day)
);

create index if not exists habit_logs_user_idx on public.habit_logs (user_id);
create index if not exists habit_logs_user_day_idx on public.habit_logs (user_id, day);
create index if not exists habit_logs_user_updated_idx on public.habit_logs (user_id, updated_at);

create trigger habit_logs_bump_meta
before update on public.habit_logs
for each row execute function public.bump_row_meta();

alter table public.habit_logs enable row level security;

create policy "habit_logs_select_own" on public.habit_logs
  for select using (user_id = auth.uid());
create policy "habit_logs_insert_own" on public.habit_logs
  for insert with check (user_id = auth.uid());
create policy "habit_logs_update_own" on public.habit_logs
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "habit_logs_delete_own" on public.habit_logs
  for delete using (user_id = auth.uid());

alter publication supabase_realtime add table public.habit_logs;
