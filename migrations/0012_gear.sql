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
