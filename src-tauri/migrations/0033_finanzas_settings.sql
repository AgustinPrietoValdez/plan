-- Finanzas: multi-currency FX settings (base currency + DKK/EUR/ARS per USD),
-- fetched daily from a free API. Mirrors the compras_settings singleton-per-user pattern.

CREATE TABLE IF NOT EXISTS finanzas_settings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  base_currency TEXT NOT NULL DEFAULT 'DKK',
  rate_dkk_per_usd REAL NOT NULL DEFAULT 6.9,
  rate_eur_per_usd REAL NOT NULL DEFAULT 0.92,
  rate_ars_per_usd REAL NOT NULL DEFAULT 1000,
  rates_updated_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS finanzas_settings_user_idx ON finanzas_settings(user_id);
