-- Savings goals: separate "cuenta de compra" (sale de aca cuando compras el goal) from
-- destination_account_id (la cuenta de ahorro/recuperacion adonde entra la plata despues).

ALTER TABLE savings_goals ADD COLUMN purchase_account_id TEXT;
