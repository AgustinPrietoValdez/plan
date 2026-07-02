-- Presupuesto: toggle per category to hide it from the SpendingPie chart/legend
-- totals without archiving it (the category keeps working normally everywhere else).

alter table public.expense_categories add column if not exists hidden_from_chart boolean not null default false;
