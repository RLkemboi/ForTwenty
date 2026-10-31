-- Step 5b: numbers the owner has blocked from ordering. Additive, safe to apply before the new code deploys.
CREATE TABLE IF NOT EXISTS blocked_phones (
  phone TEXT PRIMARY KEY,
  reason TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
