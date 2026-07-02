-- Accounts: first-class account entity for Finanzas (Holdings / net worth).
-- balance is maintained manually in Phase B; movement-driven updates land in Phase C.

------------------------------------------------------------------------------
-- accounts
------------------------------------------------------------------------------
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  owner text not null default 'shared' check (owner in ('agus', 'sofi', 'shared')),
  type text not null default 'checking' check (type in ('checking', 'savings', 'investment', 'broker', 'cash')),
  currency text not null default 'DKK' check (currency in ('DKK', 'USD', 'EUR', 'ARS')),
  balance numeric(16, 2) not null default 0,
  opening_balance numeric(16, 2) not null default 0,
  balance_as_of date,
  receives_income boolean not null default false,
  pays_expenses boolean not null default false,
  is_savings_target boolean not null default false,
  is_investment_target boolean not null default false,
  sync_source text not null default 'manual',
  external_ref text,
  institution text not null default '',
  note text not null default '',
  position integer not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create index if not exists accounts_user_idx on public.accounts (user_id);
create index if not exists accounts_user_pos_idx on public.accounts (user_id, position);
create index if not exists accounts_user_updated_idx on public.accounts (user_id, updated_at);

drop trigger if exists accounts_bump_meta on public.accounts;
create trigger accounts_bump_meta
before update on public.accounts
for each row execute function public.bump_row_meta();

alter table public.accounts enable row level security;

drop policy if exists "accounts_select_own" on public.accounts;
create policy "accounts_select_own" on public.accounts
  for select using (user_id = auth.uid());
drop policy if exists "accounts_insert_own" on public.accounts;
create policy "accounts_insert_own" on public.accounts
  for insert with check (user_id = auth.uid());
drop policy if exists "accounts_update_own" on public.accounts;
create policy "accounts_update_own" on public.accounts
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "accounts_delete_own" on public.accounts;
create policy "accounts_delete_own" on public.accounts
  for delete using (user_id = auth.uid());

------------------------------------------------------------------------------
-- realtime
------------------------------------------------------------------------------
alter publication supabase_realtime add table public.accounts;
