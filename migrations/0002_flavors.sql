-- Run once on an existing database (the live one already had products 1 and 2).
CREATE TABLE IF NOT EXISTS flavors (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  blurb TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#444444',
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);
ALTER TABLE products ADD COLUMN flavor_id INTEGER REFERENCES flavors(id);
ALTER TABLE products ADD COLUMN size TEXT;
-- Placeholder flavors: real names come from the client.
INSERT OR IGNORE INTO flavors (id, name, blurb, color, sort) VALUES
  (1, 'Double Apple', 'Sweet and sharp, the classic.', '#b3261e', 1),
  (2, 'Mint', 'Cool and clean.', '#1b7f5a', 2),
  (3, 'Grape', 'Rich and fruity.', '#5b3a9a', 3),
  (4, 'Watermelon', 'Light and juicy.', '#c2410c', 4);
UPDATE products SET flavor_id = 1, size = 'sample', name = 'Double Apple, sample' WHERE id = 1;
UPDATE products SET flavor_id = 1, size = 'packet', name = 'Double Apple, packet' WHERE id = 2;
INSERT OR IGNORE INTO products (id, name, price_kes, flavor_id, size) VALUES
  (3, 'Mint, sample', 100, 2, 'sample'), (4, 'Mint, packet', 600, 2, 'packet'),
  (5, 'Grape, sample', 100, 3, 'sample'), (6, 'Grape, packet', 600, 3, 'packet'),
  (7, 'Watermelon, sample', 100, 4, 'sample'), (8, 'Watermelon, packet', 600, 4, 'packet');
