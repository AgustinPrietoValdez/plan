-- Compras module A4: weekly meal plan (local mirror).

CREATE TABLE IF NOT EXISTS meal_plan_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  week_start TEXT NOT NULL,
  recipe_id TEXT NOT NULL,
  target_servings INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS meal_plan_entries_user_idx ON meal_plan_entries(user_id);
CREATE INDEX IF NOT EXISTS meal_plan_entries_user_week_idx ON meal_plan_entries(user_id, week_start);
CREATE INDEX IF NOT EXISTS meal_plan_entries_user_updated_idx ON meal_plan_entries(user_id, updated_at);
