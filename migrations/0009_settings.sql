-- Step 8: shop settings (manual close switch). Opening hours come from OPEN_HOUR / CLOSE_HOUR in wrangler.toml.
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
