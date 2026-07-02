-- Presupuesto: toggle per category to hide it from the SpendingPie chart/legend
-- totals without archiving it (the category keeps working normally everywhere else).

ALTER TABLE expense_categories ADD COLUMN hidden_from_chart INTEGER NOT NULL DEFAULT 0;
