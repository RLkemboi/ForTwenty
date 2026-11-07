-- Step 13: WhatsApp. wa_log is every message we send; wa_inbound is every message we receive (the id makes retries harmless).
-- wa_contacts.last_inbound opens WhatsApp's 24-hour window in which free-form replies are allowed; outside it only an approved template can be sent.
CREATE TABLE IF NOT EXISTS wa_log (
  id INTEGER PRIMARY KEY,
  to_phone TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS wa_inbound (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS wa_contacts (
  phone TEXT PRIMARY KEY,
  last_inbound INTEGER NOT NULL
);
