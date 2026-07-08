-- Automations were entirely local-only (repo/local.ts explicitly commented
-- "local-only — no enqueue"): never pushed to Supabase, never synced across
-- devices, and permanently lost on reinstall/device loss. This creates the
-- missing server-side mirror so they sync like every other entity.

create table if not exists public.automations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid,
  name text not null default '',
  kind text not null default '',
  config jsonb not null default '{}'::jsonb,
  trigger text not null default 'manual',
  schedule text,
  enabled boolean not null default true,
  notes text not null default '',
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create index if not exists automations_user_idx on public.automations (user_id);
create index if not exists automations_user_updated_idx on public.automations (user_id, updated_at);

create trigger automations_bump_meta
before update on public.automations
for each row execute function public.bump_row_meta();

alter table public.automations enable row level security;
create policy "automations_select_own" on public.automations for select using (user_id = auth.uid());
create policy "automations_insert_own" on public.automations for insert with check (user_id = auth.uid());
create policy "automations_update_own" on public.automations for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "automations_delete_own" on public.automations for delete using (user_id = auth.uid());
alter publication supabase_realtime add table public.automations;
