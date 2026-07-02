-- Savings goals: active/inactive status (separate from purchasedAt) + priority flag
-- for "bought before reaching the target, need to recover the fronted money".

alter table public.savings_goals add column if not exists active boolean not null default true;
alter table public.savings_goals add column if not exists priority boolean not null default false;
