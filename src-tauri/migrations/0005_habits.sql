-- Habit tracking: flag tasks as habits and log daily completions.

ALTER TABLE tasks ADD COLUMN is_habit INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS habit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  day TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS habit_logs_unique_idx
  ON habit_logs(user_id, task_id, day);
CREATE INDEX IF NOT EXISTS habit_logs_user_idx ON habit_logs(user_id);
CREATE INDEX IF NOT EXISTS habit_logs_user_day_idx ON habit_logs(user_id, day);
CREATE INDEX IF NOT EXISTS habit_logs_user_updated_idx
  ON habit_logs(user_id, updated_at);
