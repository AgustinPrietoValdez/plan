-- Compras module A2: recipes (with steps) and their ingredients (local mirror).

CREATE TABLE IF NOT EXISTS recipes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  servings INTEGER NOT NULL DEFAULT 1,
  meal_type TEXT NOT NULL DEFAULT 'lunch_dinner',
  steps TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS recipes_user_idx ON recipes(user_id);
CREATE INDEX IF NOT EXISTS recipes_user_updated_idx ON recipes(user_id, updated_at);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  recipe_id TEXT NOT NULL,
  ingredient_id TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS recipe_ingredients_user_idx ON recipe_ingredients(user_id);
CREATE INDEX IF NOT EXISTS recipe_ingredients_recipe_idx ON recipe_ingredients(recipe_id);
CREATE INDEX IF NOT EXISTS recipe_ingredients_user_updated_idx ON recipe_ingredients(user_id, updated_at);
