-- Holdings: one net-worth snapshot per user per calendar month (server mirror of local 0035).

create table if not exists public.net_worth_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month text not null,
  amount numeric(16, 2) not null default 0,
  currency text not null default 'DKK',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create index if not exists net_worth_snapshots_user_idx on public.net_worth_snapshots (user_id);
create unique index if not exists net_worth_snapshots_uk
  on public.net_worth_snapshots (user_id, month)
  where deleted_at is null;

create trigger net_worth_snapshots_bump_meta
before update on public.net_worth_snapshots
for each row execute function public.bump_row_meta();

alter table public.net_worth_snapshots enable row level security;
create policy "net_worth_snapshots_select_own" on public.net_worth_snapshots for select using (user_id = auth.uid());
create policy "net_worth_snapshots_insert_own" on public.net_worth_snapshots for insert with check (user_id = auth.uid());
create policy "net_worth_snapshots_update_own" on public.net_worth_snapshots for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "net_worth_snapshots_delete_own" on public.net_worth_snapshots for delete using (user_id = auth.uid());
alter publication supabase_realtime add table public.net_worth_snapshots;
