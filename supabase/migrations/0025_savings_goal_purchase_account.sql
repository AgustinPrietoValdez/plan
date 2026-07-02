-- Savings goals: separate "cuenta de compra" (sale de aca cuando compras el goal) from
-- destination_account_id (la cuenta de ahorro/recuperacion adonde entra la plata despues).

alter table public.savings_goals add column if not exists purchase_account_id uuid;
