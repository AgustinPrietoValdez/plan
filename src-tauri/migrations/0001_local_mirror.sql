-- Local SQLite mirror of Supabase schema + outbox + meta.
-- Booleans stored as INTEGER (0/1). Timestamps as ISO TEXT.
-- JSON fields (recurrence, subtasks) stored as TEXT.

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  project_id TEXT,
  category_id TEXT,
  priority TEXT NOT NULL DEFAULT 'med',
  duration INTEGER NOT NULL DEFAULT 30,
  actual_duration INTEGER,
  day TEXT,
  due TEXT,
  recurring INTEGER NOT NULL DEFAULT 0,
  recurrence TEXT,
  recurrence_parent_id TEXT,
  notes TEXT NOT NULL DEFAULT '',
  subtasks TEXT NOT NULL DEFAULT '[]',
  done INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS tasks_user_idx ON tasks(user_id);
CREATE INDEX IF NOT EXISTS tasks_user_day_idx ON tasks(user_id, day);
CREATE INDEX IF NOT EXISTS tasks_user_updated_idx ON tasks(user_id, updated_at);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category_id TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS projects_user_idx ON projects(user_id);
CREATE INDEX IF NOT EXISTS projects_user_updated_idx ON projects(user_id, updated_at);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  hue INTEGER NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS categories_user_idx ON categories(user_id);
CREATE INDEX IF NOT EXISTS categories_user_updated_idx ON categories(user_id, updated_at);

-- Pending mutations to be drained to Supabase when online.
-- op: 'insert' | 'update' | 'delete'
-- entity: 'tasks' | 'projects' | 'categories'
-- payload: JSON. For insert and update, it's the full local row. For delete it's null.
CREATE TABLE IF NOT EXISTS outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  op TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  payload TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);
CREATE INDEX IF NOT EXISTS outbox_user_idx ON outbox(user_id);

-- key/value store. Keys: last_sync:<userId>:<entity> = ISO timestamp
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
