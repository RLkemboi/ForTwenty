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
