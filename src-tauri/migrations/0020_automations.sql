CREATE TABLE IF NOT EXISTS automations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'custom',
  config TEXT NOT NULL DEFAULT '{}',
  trigger TEXT NOT NULL DEFAULT 'manual',
  schedule TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  notes TEXT NOT NULL DEFAULT '',
  last_run_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS automations_user_idx ON automations(user_id);
