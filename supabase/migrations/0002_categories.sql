-- categories table — per-user, editable, soft-deletable
-- Seeded client-side on first login so existing users without a category
-- row get the 7 defaults retroactively.

create table public.categories (
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

create index categories_user_id_idx on public.categories (user_id);
create index categories_user_position_idx on public.categories (user_id, position);
create index categories_user_updated_idx on public.categories (user_id, updated_at);

create trigger categories_bump_meta
before update on public.categories
for each row execute function public.bump_row_meta();

alter table public.categories enable row level security;

create policy "categories_select_own" on public.categories
  for select using (user_id = auth.uid());
create policy "categories_insert_own" on public.categories
  for insert with check (user_id = auth.uid());
create policy "categories_update_own" on public.categories
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "categories_delete_own" on public.categories
  for delete using (user_id = auth.uid());

-- Tasks now reference category by uuid string (not the old hardcoded text id).
-- Existing rows from migration 0001 used text ids ('design', 'eng', etc.) —
-- these stay as-is until the client re-categorizes them. categoryFor() will
-- fall back gracefully when category_id is not found.

alter publication supabase_realtime add table public.categories;
