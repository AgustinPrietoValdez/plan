CREATE TABLE IF NOT EXISTS brew_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  recipe_id TEXT,
  recipe_name TEXT NOT NULL DEFAULT '',
  bean_id TEXT,
  bean_name TEXT NOT NULL DEFAULT '',
  dose_grams REAL NOT NULL DEFAULT 0,
  total_water_grams REAL NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS brew_sessions_user_idx ON brew_sessions(user_id);
CREATE INDEX IF NOT EXISTS brew_sessions_recipe_idx ON brew_sessions(recipe_id);

-- Local-only telemetry: not synced to Supabase
CREATE TABLE IF NOT EXISTS brew_datapoints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  timer_ms INTEGER NOT NULL,
  weight_g REAL,
  flow_g_s REAL,
  step_idx INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS brew_datapoints_session_idx ON brew_datapoints(session_id);
