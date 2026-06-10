CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  day TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  location TEXT NOT NULL DEFAULT '',
  notify_minutes_before INTEGER,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_events_user_day ON events(user_id, day);
CREATE INDEX IF NOT EXISTS idx_events_user_updated ON events(user_id, updated_at);
