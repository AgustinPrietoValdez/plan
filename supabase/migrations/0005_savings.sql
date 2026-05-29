-- Savings goals + per-month contributions.
-- The user decides each month how much to put into each goal — no preset
-- monthly contribution. Overspend is not auto-deducted; the user simply
-- contributes less when they need to.

------------------------------------------------------------------------------
-- savings_goals
------------------------------------------------------------------------------
create table public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  target_amount numeric(14, 2) check (target_amount is null or target_amount > 0),
  position integer not null default 0,
  purchased_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create index savings_goals_user_idx on public.savings_goals (user_id);
create index savings_goals_user_pos_idx on public.savings_goals (user_id, position);
create index savings_goals_user_updated_idx on public.savings_goals (user_id, updated_at);

create trigger savings_goals_bump_meta
before update on public.savings_goals
for each row execute function public.bump_row_meta();

alter table public.savings_goals enable row level security;

create policy "savings_goals_select_own" on public.savings_goals
  for select using (user_id = auth.uid());
create policy "savings_goals_insert_own" on public.savings_goals
  for insert with check (user_id = auth.uid());
create policy "savings_goals_update_own" on public.savings_goals
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "savings_goals_delete_own" on public.savings_goals
  for delete using (user_id = auth.uid());

------------------------------------------------------------------------------
-- savings_contributions (one per goal per month)
------------------------------------------------------------------------------
create table public.savings_contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null references public.savings_goals(id) on delete cascade,
  month text not null,
  amount numeric(14, 2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  unique (user_id, goal_id, month)
);

create index savings_contrib_user_idx on public.savings_contributions (user_id);
create index savings_contrib_user_month_idx on public.savings_contributions (user_id, month);
create index savings_contrib_user_updated_idx on public.savings_contributions (user_id, updated_at);

create trigger savings_contrib_bump_meta
before update on public.savings_contributions
for each row execute function public.bump_row_meta();

alter table public.savings_contributions enable row level security;

create policy "savings_contrib_select_own" on public.savings_contributions
  for select using (user_id = auth.uid());
create policy "savings_contrib_insert_own" on public.savings_contributions
  for insert with check (user_id = auth.uid());
create policy "savings_contrib_update_own" on public.savings_contributions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "savings_contrib_delete_own" on public.savings_contributions
  for delete using (user_id = auth.uid());

alter publication supabase_realtime add table public.savings_goals;
alter publication supabase_realtime add table public.savings_contributions;
