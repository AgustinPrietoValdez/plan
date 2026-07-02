-- Link an expense to the savings goal it purchases ("Registrar compra" in Ahorros).

ALTER TABLE expenses ADD COLUMN goal_id TEXT;
