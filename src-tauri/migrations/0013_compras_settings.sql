-- Compras module Fase B: per-user settings (local mirror).

CREATE TABLE IF NOT EXISTS compras_settings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  meal_times TEXT NOT NULL DEFAULT '{"desayuno":"08:00","almuerzo":"13:00","merienda":"17:00","cena":"21:00"}',
  expiry_warn_days INTEGER NOT NULL DEFAULT 2,
  notifications_enabled INTEGER NOT NULL DEFAULT 0,
  dkk_per_usd REAL NOT NULL DEFAULT 6.9,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS compras_settings_user_idx ON compras_settings(user_id);
CREATE INDEX IF NOT EXISTS compras_settings_user_updated_idx ON compras_settings(user_id, updated_at);
