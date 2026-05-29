-- Compras module A3: shopping_items link columns + saved_lists (local mirror).

ALTER TABLE shopping_items ADD COLUMN ingredient_id TEXT;
ALTER TABLE shopping_items ADD COLUMN presentation_id TEXT;
ALTER TABLE shopping_items ADD COLUMN unit TEXT;

CREATE TABLE IF NOT EXISTS saved_lists (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  items TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS saved_lists_user_idx ON saved_lists(user_id);
CREATE INDEX IF NOT EXISTS saved_lists_user_updated_idx ON saved_lists(user_id, updated_at);
