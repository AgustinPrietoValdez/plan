-- Phase C: connect the budget to accounts (server-side mirror of local 0032).
-- Idempotent / re-runnable. NOT applied automatically — file only.

------------------------------------------------------------------------------
-- link columns
------------------------------------------------------------------------------
alter table public.expenses      add column if not exists account_id             uuid;
alter table public.incomes       add column if not exists account_id             uuid;
alter table public.savings_goals add column if not exists destination_account_id uuid;

------------------------------------------------------------------------------
-- relax incomes uniqueness: one income per (user_id, month, account)
-- The original table declared `unique (user_id, month)` (constraint
-- incomes_user_id_month_key). Drop it and re-create keyed on the account.
-- NULLs are distinct in a plain unique index, so coalesce to a sentinel uuid so
-- the legacy "general" (null-account) income stays unique per month too.
------------------------------------------------------------------------------
alter table public.incomes drop constraint if exists incomes_user_id_month_key;
drop index if exists public.incomes_user_month_account_uk;
create unique index if not exists incomes_user_month_account_uk
  on public.incomes (user_id, month, coalesce(account_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where deleted_at is null;

------------------------------------------------------------------------------
-- account_transfers
------------------------------------------------------------------------------
create table if not exists public.account_transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  from_account_id uuid,
  to_account_id uuid,
  amount numeric(16, 2) not null default 0,
  currency text not null default 'DKK' check (currency in ('DKK', 'USD')),
  transferred_on date not null,
  kind text not null default 'transfer' check (kind in ('transfer', 'savings', 'investment')),
  goal_id uuid,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create index if not exists account_transfers_user_idx on public.account_transfers (user_id);
create index if not exists account_transfers_user_updated_idx on public.account_transfers (user_id, updated_at);
create index if not exists account_transfers_user_date_idx on public.account_transfers (user_id, transferred_on);

drop trigger if exists account_transfers_bump_meta on public.account_transfers;
create trigger account_transfers_bump_meta
  before update on public.account_transfers
  for each row execute function public.bump_row_meta();

alter table public.account_transfers enable row level security;

drop policy if exists "account_transfers_select_own" on public.account_transfers;
drop policy if exists "account_transfers_insert_own" on public.account_transfers;
drop policy if exists "account_transfers_update_own" on public.account_transfers;
drop policy if exists "account_transfers_delete_own" on public.account_transfers;
create policy "account_transfers_select_own" on public.account_transfers
  for select using (user_id = auth.uid());
create policy "account_transfers_insert_own" on public.account_transfers
  for insert with check (user_id = auth.uid());
create policy "account_transfers_update_own" on public.account_transfers
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "account_transfers_delete_own" on public.account_transfers
  for delete using (user_id = auth.uid());

-- add to realtime publication only if not already a member
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'account_transfers'
  ) then
    alter publication supabase_realtime add table public.account_transfers;
  end if;
end $$;
