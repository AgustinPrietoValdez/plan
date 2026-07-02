-- Holdings: one net-worth snapshot per user per calendar month (not daily —
-- taken lazily when a completed month has none yet, using current balances/rates).

CREATE TABLE IF NOT EXISTS net_worth_snapshots (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  month TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'DKK',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS net_worth_snapshots_user_idx ON net_worth_snapshots(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS net_worth_snapshots_uk
  ON net_worth_snapshots(user_id, month)
  WHERE deleted_at IS NULL;
