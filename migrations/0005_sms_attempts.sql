-- Retry queue: how many times a text has been tried. Additive, safe to apply before the new code deploys.
ALTER TABLE sms_log ADD COLUMN attempts INTEGER NOT NULL DEFAULT 1;
