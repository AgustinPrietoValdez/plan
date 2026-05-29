-- Compras module A1: ingredient catalog with multiple presentations (local mirror).

CREATE TABLE IF NOT EXISTS ingredients (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  dimension TEXT NOT NULL DEFAULT 'count',
  shelf_life_days INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS ingredients_user_idx ON ingredients(user_id);
CREATE INDEX IF NOT EXISTS ingredients_user_updated_idx ON ingredients(user_id, updated_at);

CREATE TABLE IF NOT EXISTS ingredient_presentations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  ingredient_id TEXT NOT NULL,
  label TEXT NOT NULL,
  size REAL NOT NULL DEFAULT 1,
  price REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS ingredient_presentations_user_idx ON ingredient_presentations(user_id);
CREATE INDEX IF NOT EXISTS ingredient_presentations_ingredient_idx ON ingredient_presentations(ingredient_id);
CREATE INDEX IF NOT EXISTS ingredient_presentations_user_updated_idx ON ingredient_presentations(user_id, updated_at);
