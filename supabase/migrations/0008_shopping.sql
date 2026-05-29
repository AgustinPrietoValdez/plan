-- Shopping list: a single per-user list of items to buy (name + quantity + bought).

create table if not exists public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  quantity integer not null default 1,
  bought boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create index if not exists shopping_items_user_idx on public.shopping_items (user_id);
create index if not exists shopping_items_user_updated_idx on public.shopping_items (user_id, updated_at);

create trigger shopping_items_bump_meta
before update on public.shopping_items
for each row execute function public.bump_row_meta();

alter table public.shopping_items enable row level security;

create policy "shopping_items_select_own" on public.shopping_items
  for select using (user_id = auth.uid());
create policy "shopping_items_insert_own" on public.shopping_items
  for insert with check (user_id = auth.uid());
create policy "shopping_items_update_own" on public.shopping_items
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "shopping_items_delete_own" on public.shopping_items
  for delete using (user_id = auth.uid());

alter publication supabase_realtime add table public.shopping_items;
