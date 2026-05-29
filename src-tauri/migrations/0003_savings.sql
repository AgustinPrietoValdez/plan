-- Local SQLite mirror for savings_goals + savings_contributions.

CREATE TABLE IF NOT EXISTS savings_goals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  target_amount REAL,
  position INTEGER NOT NULL DEFAULT 0,
  purchased_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS savings_goals_user_idx ON savings_goals(user_id);
CREATE INDEX IF NOT EXISTS savings_goals_user_updated_idx ON savings_goals(user_id, updated_at);

CREATE TABLE IF NOT EXISTS savings_contributions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  goal_id TEXT NOT NULL,
  month TEXT NOT NULL,
  amount REAL NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS savings_contrib_user_idx ON savings_contributions(user_id);
CREATE INDEX IF NOT EXISTS savings_contrib_user_month_idx ON savings_contributions(user_id, month);
CREATE INDEX IF NOT EXISTS savings_contrib_user_updated_idx ON savings_contributions(user_id, updated_at);
CREATE UNIQUE INDEX IF NOT EXISTS savings_contrib_uk
  ON savings_contributions(user_id, goal_id, month)
  WHERE deleted_at IS NULL;
