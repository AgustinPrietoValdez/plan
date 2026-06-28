-- Local SQLite mirror for accounts (Finanzas: Holdings / net worth).
-- balance is maintained manually in Phase B (opening balance = balance on create).

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  owner TEXT NOT NULL DEFAULT 'shared',
  type TEXT NOT NULL DEFAULT 'checking',
  currency TEXT NOT NULL DEFAULT 'DKK',
  balance REAL NOT NULL DEFAULT 0,
  opening_balance REAL NOT NULL DEFAULT 0,
  balance_as_of TEXT,
  receives_income INTEGER NOT NULL DEFAULT 0,
  pays_expenses INTEGER NOT NULL DEFAULT 0,
  is_savings_target INTEGER NOT NULL DEFAULT 0,
  is_investment_target INTEGER NOT NULL DEFAULT 0,
  sync_source TEXT NOT NULL DEFAULT 'manual',
  external_ref TEXT,
  institution TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS accounts_user_idx ON accounts(user_id);
CREATE INDEX IF NOT EXISTS accounts_user_updated_idx ON accounts(user_id, updated_at);
