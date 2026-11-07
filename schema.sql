CREATE TABLE IF NOT EXISTS flavors (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  blurb TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#444444',
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  price_kes INTEGER NOT NULL CHECK (price_kes > 0),
  active INTEGER NOT NULL DEFAULT 1,
  flavor_id INTEGER REFERENCES flavors(id),
  size TEXT
);

CREATE TABLE IF NOT EXISTS riders (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  busy INTEGER NOT NULL DEFAULT 0,
  token TEXT NOT NULL DEFAULT (lower(hex(randomblob(12)))),  -- private link /r/<token>
  on_duty INTEGER NOT NULL DEFAULT 1                         -- the rider's own switch
);
CREATE UNIQUE INDEX IF NOT EXISTS riders_token ON riders(token);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  qty INTEGER NOT NULL CHECK (qty BETWEEN 1 AND 10),
  total_kes INTEGER NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  status TEXT NOT NULL,            -- awaiting_payment | paid | assigned | delivered | payment_failed | amount_mismatch | expired
  checkout_request_id TEXT UNIQUE,
  mpesa_receipt TEXT,
  rider_id INTEGER REFERENCES riders(id),
  delivery_token TEXT UNIQUE NOT NULL,
  created_at INTEGER NOT NULL,
  paid_at INTEGER,
  delivered_at INTEGER,
  provider TEXT NOT NULL DEFAULT 'mpesa',   -- mpesa | airtel
  lat REAL,
  lng REAL,
  ip TEXT,
  offered_to INTEGER,          -- rider currently holding an offer for this order
  offer_expires INTEGER,
  offer_round INTEGER NOT NULL DEFAULT 0,
  declined_by TEXT NOT NULL DEFAULT '',  -- riders who declined or missed it this round
  retry_at INTEGER,
  alerted INTEGER NOT NULL DEFAULT 0,
  delivery_fee_kes INTEGER NOT NULL DEFAULT 0,   -- paid to the rider
  distance_km REAL
);
CREATE INDEX IF NOT EXISTS orders_status ON orders(status, created_at);

CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE REFERENCES orders(id),
  rider_id INTEGER NOT NULL REFERENCES riders(id),
  amount_kes INTEGER NOT NULL,
  paid_out INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sms_log (
  id INTEGER PRIMARY KEY,
  to_phone TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS blocked_phones (
  phone TEXT PRIMARY KEY,
  reason TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS monitor_beat (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  ts INTEGER NOT NULL,
  ok INTEGER NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  stale_alerted INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS health (id INTEGER PRIMARY KEY CHECK (id = 1), ts INTEGER NOT NULL);

-- Placeholders: real flavor names, prices and riders come from the client.
INSERT OR IGNORE INTO flavors (id, name, blurb, color, sort) VALUES
  (1, 'Double Apple', 'Sweet and sharp, the classic.', '#b3261e', 1),
  (2, 'Mint', 'Cool and clean.', '#1b7f5a', 2),
  (3, 'Grape', 'Rich and fruity.', '#5b3a9a', 3),
  (4, 'Watermelon', 'Light and juicy.', '#c2410c', 4);
INSERT OR IGNORE INTO products (id, name, price_kes, flavor_id, size) VALUES
  (1, 'Double Apple, sample', 100, 1, 'sample'), (2, 'Double Apple, packet', 600, 1, 'packet'),
  (3, 'Mint, sample', 100, 2, 'sample'), (4, 'Mint, packet', 600, 2, 'packet'),
  (5, 'Grape, sample', 100, 3, 'sample'), (6, 'Grape, packet', 600, 3, 'packet'),
  (7, 'Watermelon, sample', 100, 4, 'sample'), (8, 'Watermelon, packet', 600, 4, 'packet');
INSERT OR IGNORE INTO riders (id, name, phone) VALUES (1, 'Demo rider 1', '254700000001'), (2, 'Demo rider 2', '254700000002');

-- Step 12: hookah gear. Gear items are menu entries whose single size is 'gear', so the owner edits them in /admin Menu like flavours.
-- Placeholder names and prices: real ones come from the client.
INSERT INTO flavors (name, blurb, color, sort, active)
SELECT 'Hookah', 'Complete hookah: base, stem, tray and bowl.', '#2f6f9f', 101, 1 WHERE NOT EXISTS (SELECT 1 FROM flavors WHERE name = 'Hookah');
INSERT INTO flavors (name, blurb, color, sort, active)
SELECT 'Coals', 'Quick-light coals, 10 pieces.', '#7a3b1d', 102, 1 WHERE NOT EXISTS (SELECT 1 FROM flavors WHERE name = 'Coals');
INSERT INTO flavors (name, blurb, color, sort, active)
SELECT 'Hose', 'Washable hose with mouthpiece.', '#8a2f6b', 103, 1 WHERE NOT EXISTS (SELECT 1 FROM flavors WHERE name = 'Hose');
INSERT INTO flavors (name, blurb, color, sort, active)
SELECT 'Foil', 'Pre-cut foil, 50 sheets.', '#5d6b73', 104, 1 WHERE NOT EXISTS (SELECT 1 FROM flavors WHERE name = 'Foil');
INSERT INTO products (name, price_kes, flavor_id, size, active)
SELECT 'Hookah, gear', 3500, id, 'gear', 1 FROM flavors WHERE name = 'Hookah' AND NOT EXISTS (SELECT 1 FROM products WHERE flavor_id = flavors.id);
INSERT INTO products (name, price_kes, flavor_id, size, active)
SELECT 'Coals, gear', 300, id, 'gear', 1 FROM flavors WHERE name = 'Coals' AND NOT EXISTS (SELECT 1 FROM products WHERE flavor_id = flavors.id);
INSERT INTO products (name, price_kes, flavor_id, size, active)
SELECT 'Hose, gear', 600, id, 'gear', 1 FROM flavors WHERE name = 'Hose' AND NOT EXISTS (SELECT 1 FROM products WHERE flavor_id = flavors.id);
INSERT INTO products (name, price_kes, flavor_id, size, active)
SELECT 'Foil, gear', 100, id, 'gear', 1 FROM flavors WHERE name = 'Foil' AND NOT EXISTS (SELECT 1 FROM products WHERE flavor_id = flavors.id);

-- Step 14: hookah rentals. Rentals are menu entries whose single size is 'night'; the order quantity is the number of nights.
-- Placeholder prices (KES per night): the owner changes them in /admin Menu.
INSERT INTO flavors (name, blurb, color, sort, active)
SELECT 'Small hookah', 'Compact crystal vase hookah, for 1 to 2 people. Rented per night.', '#c2410c', 91, 1 WHERE NOT EXISTS (SELECT 1 FROM flavors WHERE name = 'Small hookah');
INSERT INTO flavors (name, blurb, color, sort, active)
SELECT 'Medium hookah', 'The all-rounder, for 3 to 5 people. Rented per night.', '#1b7f5a', 92, 1 WHERE NOT EXISTS (SELECT 1 FROM flavors WHERE name = 'Medium hookah');
INSERT INTO flavors (name, blurb, color, sort, active)
SELECT 'Large hookah', 'The party hookah, for 6 to 10 people. Rented per night.', '#5b3a9a', 93, 1 WHERE NOT EXISTS (SELECT 1 FROM flavors WHERE name = 'Large hookah');
INSERT INTO products (name, price_kes, flavor_id, size, active)
SELECT 'Small hookah, night', 800, id, 'night', 1 FROM flavors WHERE name = 'Small hookah' AND NOT EXISTS (SELECT 1 FROM products WHERE flavor_id = flavors.id);
INSERT INTO products (name, price_kes, flavor_id, size, active)
SELECT 'Medium hookah, night', 1200, id, 'night', 1 FROM flavors WHERE name = 'Medium hookah' AND NOT EXISTS (SELECT 1 FROM products WHERE flavor_id = flavors.id);
INSERT INTO products (name, price_kes, flavor_id, size, active)
SELECT 'Large hookah, night', 1800, id, 'night', 1 FROM flavors WHERE name = 'Large hookah' AND NOT EXISTS (SELECT 1 FROM products WHERE flavor_id = flavors.id);

CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS auth_fail (ip TEXT NOT NULL, ts INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS auth_fail_ip ON auth_fail(ip, ts);

-- WhatsApp (see migrations/0013_whatsapp.sql)
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
