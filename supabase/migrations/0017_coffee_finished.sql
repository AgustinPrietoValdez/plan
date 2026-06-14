-- #ciclo de vida del cafe: marca de terminado (no tengo mas)
alter table public.coffee_beans add column if not exists finished_at timestamptz;
