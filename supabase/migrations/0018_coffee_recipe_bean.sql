-- Receta especifica por café (server). Idempotente.
alter table if exists coffee_recipes add column if not exists bean_id text;
alter table if exists coffee_recipes add column if not exists base_recipe_id text;
