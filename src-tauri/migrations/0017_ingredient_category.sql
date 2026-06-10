CREATE TABLE IF NOT EXISTS ingredient_categories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  hue INTEGER NOT NULL DEFAULT 180,
  position INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS ingredient_categories_user ON ingredient_categories(user_id);

ALTER TABLE ingredients ADD COLUMN category_id TEXT REFERENCES ingredient_categories(id);
