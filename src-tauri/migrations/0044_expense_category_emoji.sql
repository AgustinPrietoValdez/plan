-- Presupuesto: emoji opcional por categoría de gasto. Lo edita el manager del
-- escritorio y lo consume el grid de categorías de Finanzas en mobile.
-- Nullable a propósito: todas las categorías existentes arrancan sin emoji.

ALTER TABLE expense_categories ADD COLUMN emoji TEXT;
