-- Step 10: wrong-password attempts on /admin and the monitor endpoint, so guessing the token can be slowed down.
CREATE TABLE IF NOT EXISTS auth_fail (ip TEXT NOT NULL, ts INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS auth_fail_ip ON auth_fail(ip, ts);
