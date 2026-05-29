-- Shopping list: a single per-user list of items to buy (name + quantity + bought).

CREATE TABLE IF NOT EXISTS shopping_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  bought INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS shopping_items_user_idx ON shopping_items(user_id);
CREATE INDEX IF NOT EXISTS shopping_items_user_updated_idx
  ON shopping_items(user_id, updated_at);
