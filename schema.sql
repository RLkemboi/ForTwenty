CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  price_kes INTEGER NOT NULL CHECK (price_kes > 0),
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS riders (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  busy INTEGER NOT NULL DEFAULT 0
);

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
  delivered_at INTEGER
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
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS health (id INTEGER PRIMARY KEY CHECK (id = 1), ts INTEGER NOT NULL);

-- Placeholders: real names, prices and riders come from the client.
INSERT OR IGNORE INTO products (id, name, price_kes) VALUES (1, 'Flavor sample (small roll)', 100), (2, 'Flavor packet', 600);
INSERT OR IGNORE INTO riders (id, name, phone) VALUES (1, 'Demo rider 1', '254700000001'), (2, 'Demo rider 2', '254700000002');
