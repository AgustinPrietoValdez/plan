create table if not exists public.coffee_wishlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  roaster text not null default '',
  process text not null default '',
  price_kr double precision,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create index if not exists coffee_wishlist_items_user_idx on public.coffee_wishlist_items (user_id);

create trigger coffee_wishlist_items_bump_meta
before update on public.coffee_wishlist_items
for each row execute function public.bump_row_meta();

alter table public.coffee_wishlist_items enable row level security;
create policy "coffee_wishlist_items_select_own" on public.coffee_wishlist_items for select using (user_id = auth.uid());
create policy "coffee_wishlist_items_insert_own" on public.coffee_wishlist_items for insert with check (user_id = auth.uid());
create policy "coffee_wishlist_items_update_own" on public.coffee_wishlist_items for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "coffee_wishlist_items_delete_own" on public.coffee_wishlist_items for delete using (user_id = auth.uid());
alter publication supabase_realtime add table public.coffee_wishlist_items;
