-- Step 3/4: payment provider (M-Pesa or Airtel Money) and the customer's map pin.
-- Additive only: old code keeps working if this is applied before the new code deploys.
ALTER TABLE orders ADD COLUMN provider TEXT NOT NULL DEFAULT 'mpesa';
ALTER TABLE orders ADD COLUMN lat REAL;
ALTER TABLE orders ADD COLUMN lng REAL;
