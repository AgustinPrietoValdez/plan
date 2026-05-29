-- Compras module Fase B: per-user settings (configured on desktop, synced to phone).

create table if not exists public.compras_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade unique,
  meal_times jsonb not null default '{"desayuno":"08:00","almuerzo":"13:00","merienda":"17:00","cena":"21:00"}'::jsonb,
  expiry_warn_days integer not null default 2,
  notifications_enabled boolean not null default false,
  dkk_per_usd double precision not null default 6.9,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create index if not exists compras_settings_user_idx on public.compras_settings (user_id);
create index if not exists compras_settings_user_updated_idx on public.compras_settings (user_id, updated_at);

create trigger compras_settings_bump_meta
before update on public.compras_settings
for each row execute function public.bump_row_meta();

alter table public.compras_settings enable row level security;
create policy "compras_settings_select_own" on public.compras_settings for select using (user_id = auth.uid());
create policy "compras_settings_insert_own" on public.compras_settings for insert with check (user_id = auth.uid());
create policy "compras_settings_update_own" on public.compras_settings for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "compras_settings_delete_own" on public.compras_settings for delete using (user_id = auth.uid());
alter publication supabase_realtime add table public.compras_settings;
