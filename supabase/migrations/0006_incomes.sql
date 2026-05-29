-- Monthly income (one entry per month). User edits inline in BudgetView.

create table public.incomes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month text not null,
  amount numeric(14, 2) not null check (amount >= 0),
  currency text not null default 'DKK',
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  unique (user_id, month)
);

create index incomes_user_idx on public.incomes (user_id);
create index incomes_user_month_idx on public.incomes (user_id, month);
create index incomes_user_updated_idx on public.incomes (user_id, updated_at);

create trigger incomes_bump_meta
before update on public.incomes
for each row execute function public.bump_row_meta();

alter table public.incomes enable row level security;

create policy "incomes_select_own" on public.incomes
  for select using (user_id = auth.uid());
create policy "incomes_insert_own" on public.incomes
  for insert with check (user_id = auth.uid());
create policy "incomes_update_own" on public.incomes
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "incomes_delete_own" on public.incomes
  for delete using (user_id = auth.uid());

alter publication supabase_realtime add table public.incomes;
