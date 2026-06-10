-- Rebuild ingredients with category_id (replaces the old category TEXT column if present).
-- Uses table-rebuild pattern because SQLite has no ALTER TABLE ADD COLUMN IF NOT EXISTS.
CREATE TABLE ingredients_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category_id TEXT REFERENCES ingredient_categories(id),
  dimension TEXT NOT NULL DEFAULT 'count',
  shelf_life_days INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1
);

INSERT INTO ingredients_new (id, user_id, name, category_id, dimension, shelf_life_days, created_at, updated_at, deleted_at, version)
  SELECT id, user_id, name, NULL, dimension, shelf_life_days, created_at, updated_at, deleted_at, version
  FROM ingredients;

DROP TABLE ingredients;
ALTER TABLE ingredients_new RENAME TO ingredients;

CREATE INDEX IF NOT EXISTS ingredients_user_idx ON ingredients(user_id);
CREATE INDEX IF NOT EXISTS ingredients_user_updated_idx ON ingredients(user_id, updated_at);
