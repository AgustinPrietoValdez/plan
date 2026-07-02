-- Link an expense to the savings goal it purchases ("Registrar compra" in Ahorros).

alter table public.expenses add column if not exists goal_id uuid;
