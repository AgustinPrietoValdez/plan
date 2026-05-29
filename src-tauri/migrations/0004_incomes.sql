CREATE TABLE IF NOT EXISTS incomes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  month TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'DKK',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS incomes_user_idx ON incomes(user_id);
CREATE INDEX IF NOT EXISTS incomes_user_month_idx ON incomes(user_id, month);
CREATE INDEX IF NOT EXISTS incomes_user_updated_idx ON incomes(user_id, updated_at);
CREATE UNIQUE INDEX IF NOT EXISTS incomes_uk
  ON incomes(user_id, month)
  WHERE deleted_at IS NULL;
