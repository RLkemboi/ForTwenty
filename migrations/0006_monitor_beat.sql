-- Heartbeat from the outside monitor. Additive, safe to apply before the new code deploys.
CREATE TABLE IF NOT EXISTS monitor_beat (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  ts INTEGER NOT NULL,
  ok INTEGER NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  stale_alerted INTEGER NOT NULL DEFAULT 0
);
