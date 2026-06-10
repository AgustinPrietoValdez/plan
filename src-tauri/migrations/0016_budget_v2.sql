-- Budget v2: expense name + savings percent allocation + expense line items.

ALTER TABLE expenses ADD COLUMN name TEXT NOT NULL DEFAULT '';

ALTER TABLE savings_goals ADD COLUMN savings_percent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE savings_goals ADD COLUMN is_overflow_target INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS expense_line_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expense_id TEXT NOT NULL,
  name TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1,
  unit_price REAL NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_eli_user ON expense_line_items(user_id);
CREATE INDEX IF NOT EXISTS idx_eli_expense ON expense_line_items(expense_id);
CREATE INDEX IF NOT EXISTS idx_eli_updated ON expense_line_items(user_id, updated_at);
