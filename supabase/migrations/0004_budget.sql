-- Budgeting feature: expense_categories, expenses, budgets.
-- Expenses support recurrence (rule + parent_id) just like tasks.
-- Currency hardcoded to DKK in v1; column kept for future flexibility.

------------------------------------------------------------------------------
-- expense_categories
------------------------------------------------------------------------------
create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  hue integer not null check (hue >= 0 and hue < 360),
  position integer not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create index expense_categories_user_idx on public.expense_categories (user_id);
create index expense_categories_user_pos_idx on public.expense_categories (user_id, position);
create index expense_categories_user_updated_idx on public.expense_categories (user_id, updated_at);

create trigger expense_categories_bump_meta
before update on public.expense_categories
for each row execute function public.bump_row_meta();

alter table public.expense_categories enable row level security;

create policy "expense_categories_select_own" on public.expense_categories
  for select using (user_id = auth.uid());
create policy "expense_categories_insert_own" on public.expense_categories
  for insert with check (user_id = auth.uid());
create policy "expense_categories_update_own" on public.expense_categories
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "expense_categories_delete_own" on public.expense_categories
  for delete using (user_id = auth.uid());

------------------------------------------------------------------------------
-- expenses
------------------------------------------------------------------------------
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(14, 2) not null check (amount >= 0),
  currency text not null default 'DKK',
  category_id uuid references public.expense_categories(id) on delete set null,
  spent_on date not null,
  note text not null default '',
  recurrence jsonb,
  recurrence_parent_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create index expenses_user_idx on public.expenses (user_id);
create index expenses_user_spent_idx on public.expenses (user_id, spent_on);
create index expenses_user_updated_idx on public.expenses (user_id, updated_at);
create index expenses_recurrence_parent_idx
  on public.expenses (user_id, recurrence_parent_id)
  where recurrence_parent_id is not null;
create index expenses_active_recurrence_idx
  on public.expenses (user_id)
  where recurrence is not null and deleted_at is null;

create trigger expenses_bump_meta
before update on public.expenses
for each row execute function public.bump_row_meta();

alter table public.expenses enable row level security;

create policy "expenses_select_own" on public.expenses
  for select using (user_id = auth.uid());
create policy "expenses_insert_own" on public.expenses
  for insert with check (user_id = auth.uid());
create policy "expenses_update_own" on public.expenses
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "expenses_delete_own" on public.expenses
  for delete using (user_id = auth.uid());

------------------------------------------------------------------------------
-- budgets (one per category per user)
------------------------------------------------------------------------------
create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references public.expense_categories(id) on delete cascade,
  monthly_amount numeric(14, 2) not null check (monthly_amount >= 0),
  currency text not null default 'DKK',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  unique (user_id, category_id)
);

create index budgets_user_idx on public.budgets (user_id);
create index budgets_user_updated_idx on public.budgets (user_id, updated_at);

create trigger budgets_bump_meta
before update on public.budgets
for each row execute function public.bump_row_meta();

alter table public.budgets enable row level security;

create policy "budgets_select_own" on public.budgets
  for select using (user_id = auth.uid());
create policy "budgets_insert_own" on public.budgets
  for insert with check (user_id = auth.uid());
create policy "budgets_update_own" on public.budgets
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "budgets_delete_own" on public.budgets
  for delete using (user_id = auth.uid());

------------------------------------------------------------------------------
-- realtime
------------------------------------------------------------------------------
alter publication supabase_realtime add table public.expense_categories;
alter publication supabase_realtime add table public.expenses;
alter publication supabase_realtime add table public.budgets;
