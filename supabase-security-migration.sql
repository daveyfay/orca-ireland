-- ================================================================
-- ORCA Ireland — Security Migration
-- Run this in Supabase SQL Editor
-- ================================================================

-- 1. Login attempts table (rate limiting + audit trail)
CREATE TABLE IF NOT EXISTS login_attempts (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ip_address   TEXT NOT NULL,
  username     TEXT NOT NULL,
  success      BOOLEAN NOT NULL DEFAULT FALSE,
  attempted_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE login_attempts DISABLE ROW LEVEL SECURITY;

CREATE INDEX idx_login_attempts_ip      ON login_attempts(ip_address);
CREATE INDEX idx_login_attempts_at      ON login_attempts(attempted_at);

-- Auto-clean attempts older than 30 days (keep table small)
-- Run manually or schedule as a cron in Supabase
-- DELETE FROM login_attempts WHERE attempted_at < NOW() - INTERVAL '30 days';


-- 2. Add reset_token columns if not already present
ALTER TABLE members ADD COLUMN IF NOT EXISTS reset_token TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMPTZ;


-- 3. Password hash migration
-- All NEW registrations will be bcrypt-hashed automatically.
-- Existing plain-text passwords need to be migrated.
--
-- The easiest safe path: force ALL existing members to reset their password.
-- Run the UPDATE below to null out passwords, then send reset emails.
-- Members will use "Forgot Password" to set a new (hashed) password.
--
-- WARNING: This will log out all existing members.
-- Only run this once you've deployed the new code.

-- Step A: Force password reset for all existing members with plain-text passwords
-- (bcrypt hashes start with $2, plain text doesn't)
UPDATE members
SET
  reset_token = gen_random_uuid()::text,
  reset_token_expires = NOW() + INTERVAL '7 days',
  updated_at = NOW()
WHERE password_hash NOT LIKE '$2%';

-- Step B: After running Step A, run this query to see who needs a reset email:
-- SELECT username, email, reset_token FROM members WHERE reset_token IS NOT NULL;
--
-- Then send them a password reset email with the link:
-- https://orca-ireland.com/reset-password.html?token=<reset_token>
--
-- Or simply email them to use the "Forgot Password" link on the site.


-- 4. Cleanup old login attempts periodically (optional scheduled task)
-- CREATE OR REPLACE FUNCTION cleanup_login_attempts() RETURNS void AS $$
--   DELETE FROM login_attempts WHERE attempted_at < NOW() - INTERVAL '30 days';
-- $$ LANGUAGE sql;
