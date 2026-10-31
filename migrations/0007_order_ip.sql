-- Step 6: per-visitor order limit. Stores the visitor's IP so one person can't spam orders (and rider/customer texts).
ALTER TABLE orders ADD COLUMN ip TEXT;
CREATE INDEX IF NOT EXISTS idx_orders_ip_created ON orders (ip, created_at);
