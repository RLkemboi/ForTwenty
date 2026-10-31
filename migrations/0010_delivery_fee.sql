-- Step 9: distance-based delivery fee. The fee is paid to the rider; it is stored on the order so later price changes never alter old orders.
ALTER TABLE orders ADD COLUMN delivery_fee_kes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN distance_km REAL;
