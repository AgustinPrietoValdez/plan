-- Savings goals: active/inactive status (separate from purchasedAt) + priority flag
-- for "bought before reaching the target, need to recover the fronted money".

ALTER TABLE savings_goals ADD COLUMN active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE savings_goals ADD COLUMN priority INTEGER NOT NULL DEFAULT 0;
