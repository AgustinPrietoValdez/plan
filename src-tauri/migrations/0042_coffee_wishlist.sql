CREATE TABLE IF NOT EXISTS coffee_wishlist_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  roaster TEXT NOT NULL DEFAULT '',
  process TEXT NOT NULL DEFAULT '',
  price_kr REAL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS coffee_wishlist_items_user_idx ON coffee_wishlist_items(user_id);
