-- Receta especifica por café: una fila de coffee_recipes puede ser una version
-- de una receta general (base_recipe_id) ajustada para un grano (bean_id).
-- General = ambos NULL. Especifica (generada por el analisis AI) = ambos seteados.
-- SQLite no soporta ADD COLUMN IF NOT EXISTS; estas columnas son nuevas (se aplican una vez).
ALTER TABLE coffee_recipes ADD COLUMN bean_id TEXT;
ALTER TABLE coffee_recipes ADD COLUMN base_recipe_id TEXT;
