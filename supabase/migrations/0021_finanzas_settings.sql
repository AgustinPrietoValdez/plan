-- Finanzas: multi-currency FX settings (server mirror of local 0033).
-- One row per user, configured/refreshed from the Finanzas > Holdings screen.

create table if not exists public.finanzas_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade unique,
  base_currency text not null default 'DKK' check (base_currency in ('DKK', 'USD', 'EUR', 'ARS')),
  rate_dkk_per_usd double precision not null default 6.9,
  rate_eur_per_usd double precision not null default 0.92,
  rate_ars_per_usd double precision not null default 1000,
  rates_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create index if not exists finanzas_settings_user_idx on public.finanzas_settings (user_id);
create index if not exists finanzas_settings_user_updated_idx on public.finanzas_settings (user_id, updated_at);

create trigger finanzas_settings_bump_meta
before update on public.finanzas_settings
for each row execute function public.bump_row_meta();

alter table public.finanzas_settings enable row level security;
create policy "finanzas_settings_select_own" on public.finanzas_settings for select using (user_id = auth.uid());
create policy "finanzas_settings_insert_own" on public.finanzas_settings for insert with check (user_id = auth.uid());
create policy "finanzas_settings_update_own" on public.finanzas_settings for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "finanzas_settings_delete_own" on public.finanzas_settings for delete using (user_id = auth.uid());
alter publication supabase_realtime add table public.finanzas_settings;
