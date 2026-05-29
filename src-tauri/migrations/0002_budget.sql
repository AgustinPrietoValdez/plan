-- Local SQLite mirror for the budget tables.

CREATE TABLE IF NOT EXISTS expense_categories (
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
CREATE INDEX IF NOT EXISTS expense_categories_user_idx ON expense_categories(user_id);
CREATE INDEX IF NOT EXISTS expense_categories_user_updated_idx ON expense_categories(user_id, updated_at);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'DKK',
  category_id TEXT,
  spent_on TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  recurrence TEXT,
  recurrence_parent_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS expenses_user_idx ON expenses(user_id);
CREATE INDEX IF NOT EXISTS expenses_user_spent_idx ON expenses(user_id, spent_on);
CREATE INDEX IF NOT EXISTS expenses_user_updated_idx ON expenses(user_id, updated_at);

CREATE TABLE IF NOT EXISTS budgets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  monthly_amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'DKK',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS budgets_user_idx ON budgets(user_id);
CREATE INDEX IF NOT EXISTS budgets_user_updated_idx ON budgets(user_id, updated_at);
CREATE UNIQUE INDEX IF NOT EXISTS budgets_user_category_uk ON budgets(user_id, category_id) WHERE deleted_at IS NULL;
