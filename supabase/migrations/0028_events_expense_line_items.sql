-- Calendar events + expense line items: these were pushed from the client via the
-- generic outbox (repo/local.ts createEvent/patchEvent/deleteEvent and the expense
-- line item CRUD) but the tables never existed on Supabase, so every push has been
-- silently failing and getting dropped after drainOutbox's 5-attempt retry cap.
-- This creates the missing server-side mirrors so push (and the new pull/realtime
-- wiring in sync.ts/realtime.ts) actually works.

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '',
  day text not null,
  start_time text,
  end_time text,
  location text not null default '',
  notify_minutes_before integer,
  notes text not null default '',
  category_id uuid,
  project_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create index if not exists events_user_idx on public.events (user_id);
create index if not exists events_user_day_idx on public.events (user_id, day);
create index if not exists events_user_updated_idx on public.events (user_id, updated_at);

create trigger events_bump_meta
before update on public.events
for each row execute function public.bump_row_meta();

alter table public.events enable row level security;
create policy "events_select_own" on public.events for select using (user_id = auth.uid());
create policy "events_insert_own" on public.events for insert with check (user_id = auth.uid());
create policy "events_update_own" on public.events for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "events_delete_own" on public.events for delete using (user_id = auth.uid());
alter publication supabase_realtime add table public.events;

create table if not exists public.expense_line_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  expense_id uuid not null,
  name text not null,
  quantity numeric not null default 1,
  unit_price numeric not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create index if not exists expense_line_items_user_idx on public.expense_line_items (user_id);
create index if not exists expense_line_items_expense_idx on public.expense_line_items (expense_id);
create index if not exists expense_line_items_user_updated_idx on public.expense_line_items (user_id, updated_at);

create trigger expense_line_items_bump_meta
before update on public.expense_line_items
for each row execute function public.bump_row_meta();

alter table public.expense_line_items enable row level security;
create policy "expense_line_items_select_own" on public.expense_line_items for select using (user_id = auth.uid());
create policy "expense_line_items_insert_own" on public.expense_line_items for insert with check (user_id = auth.uid());
create policy "expense_line_items_update_own" on public.expense_line_items for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "expense_line_items_delete_own" on public.expense_line_items for delete using (user_id = auth.uid());
alter publication supabase_realtime add table public.expense_line_items;
