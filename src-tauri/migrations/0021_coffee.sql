CREATE TABLE IF NOT EXISTS coffee_beans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  roaster TEXT NOT NULL DEFAULT '',
  varietal TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  process TEXT NOT NULL DEFAULT '',
  producer TEXT NOT NULL DEFAULT '',
  roasted_on TEXT,
  weight_grams REAL NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS coffee_beans_user_idx ON coffee_beans(user_id);

CREATE TABLE IF NOT EXISTS coffee_recipes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  coffee_type TEXT NOT NULL DEFAULT '',
  ratio REAL NOT NULL DEFAULT 15,
  temp_celsius REAL NOT NULL DEFAULT 93,
  grind_size TEXT NOT NULL DEFAULT '',
  steps TEXT NOT NULL DEFAULT '[]',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS coffee_recipes_user_idx ON coffee_recipes(user_id);
