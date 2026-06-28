-- Phase C: connect the budget to accounts.
--   * expenses are paid FROM an account (account_id)
--   * incomes go INTO an account (account_id)
--   * savings goals have a destination account (destination_account_id)
--   * account_transfers move money between accounts (savings / investment / plain)
-- Account balances are auto-calculated from these movements (in the repo layer).
--
-- Fresh migration number -> runs exactly once per DB, so plain ALTER is safe
-- (SQLite has no ADD COLUMN IF NOT EXISTS; prior migrations, e.g. 0016, ALTER directly).

ALTER TABLE expenses ADD COLUMN account_id TEXT;
ALTER TABLE incomes ADD COLUMN account_id TEXT;
ALTER TABLE savings_goals ADD COLUMN destination_account_id TEXT;

-- Incomes used to be UNIQUE(user_id, month). They must now allow one income per
-- (month, account). Drop the old uniqueness and re-create it keyed on the account.
-- NULL account_id = the legacy "general" income (NULLs are distinct in SQLite, so
-- the per-account upsert in the repo guards uniqueness for the null case).
DROP INDEX IF EXISTS incomes_uk;
CREATE UNIQUE INDEX IF NOT EXISTS incomes_uk
  ON incomes(user_id, month, account_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS account_transfers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  from_account_id TEXT,
  to_account_id TEXT,
  amount REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'DKK',
  transferred_on TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'transfer',
  goal_id TEXT,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS account_transfers_user_idx ON account_transfers(user_id);
CREATE INDEX IF NOT EXISTS account_transfers_user_updated_idx ON account_transfers(user_id, updated_at);
CREATE INDEX IF NOT EXISTS account_transfers_user_date_idx ON account_transfers(user_id, transferred_on);
