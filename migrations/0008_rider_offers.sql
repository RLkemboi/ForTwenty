-- Step 7: driver page. Each rider gets a private link, an on/off-duty switch, and orders can be OFFERED to a rider.
ALTER TABLE riders ADD COLUMN token TEXT;
ALTER TABLE riders ADD COLUMN on_duty INTEGER NOT NULL DEFAULT 1;
UPDATE riders SET token = lower(hex(randomblob(12))) WHERE token IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS riders_token ON riders(token);
ALTER TABLE orders ADD COLUMN offered_to INTEGER;
ALTER TABLE orders ADD COLUMN offer_expires INTEGER;
ALTER TABLE orders ADD COLUMN offer_round INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN declined_by TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN retry_at INTEGER;
ALTER TABLE orders ADD COLUMN alerted INTEGER NOT NULL DEFAULT 0;
