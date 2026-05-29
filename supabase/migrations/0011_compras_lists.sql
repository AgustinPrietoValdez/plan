-- Compras module A3: link shopping_items to ingredients/presentations + saved lists.

alter table public.shopping_items
  add column if not exists ingredient_id uuid references public.ingredients(id) on delete set null,
  add column if not exists presentation_id uuid references public.ingredient_presentations(id) on delete set null,
  add column if not exists unit text;

alter table public.shopping_items alter column quantity type double precision;

create table if not exists public.saved_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create index if not exists saved_lists_user_idx on public.saved_lists (user_id);
create index if not exists saved_lists_user_updated_idx on public.saved_lists (user_id, updated_at);

create trigger saved_lists_bump_meta
before update on public.saved_lists
for each row execute function public.bump_row_meta();

alter table public.saved_lists enable row level security;
create policy "saved_lists_select_own" on public.saved_lists for select using (user_id = auth.uid());
create policy "saved_lists_insert_own" on public.saved_lists for insert with check (user_id = auth.uid());
create policy "saved_lists_update_own" on public.saved_lists for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "saved_lists_delete_own" on public.saved_lists for delete using (user_id = auth.uid());
alter publication supabase_realtime add table public.saved_lists;
