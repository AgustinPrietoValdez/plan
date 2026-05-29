-- Compras module A5: inventory + meal log (local mirror).

CREATE TABLE IF NOT EXISTS inventory (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  ingredient_id TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 0,
  expires_on TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS inventory_user_idx ON inventory(user_id);
CREATE INDEX IF NOT EXISTS inventory_ingredient_idx ON inventory(ingredient_id);
CREATE INDEX IF NOT EXISTS inventory_user_updated_idx ON inventory(user_id, updated_at);

CREATE TABLE IF NOT EXISTS meal_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  eaten_on TEXT NOT NULL,
  meal_slot TEXT NOT NULL DEFAULT 'almuerzo',
  recipe_id TEXT NOT NULL,
  servings REAL NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS meal_log_user_idx ON meal_log(user_id);
CREATE INDEX IF NOT EXISTS meal_log_user_day_idx ON meal_log(user_id, eaten_on);
CREATE INDEX IF NOT EXISTS meal_log_user_updated_idx ON meal_log(user_id, updated_at);
