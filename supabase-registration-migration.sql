-- Run this in Supabase SQL Editor BEFORE deploying the new registration flow
-- supabase.com → your project → SQL Editor → New Query

-- Step 1: Add phone and ICE contact fields to members table
ALTER TABLE members ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS ice_name TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS ice_phone TEXT;

-- Step 2: Pending registrations table
-- Stores incomplete registrations until email is confirmed
CREATE TABLE IF NOT EXISTS pending_registrations (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  token         TEXT NOT NULL UNIQUE,
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  email         TEXT NOT NULL,
  membership_type TEXT NOT NULL CHECK (membership_type IN ('full', 'junior')),
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE pending_registrations DISABLE ROW LEVEL SECURITY;
CREATE INDEX idx_pending_token ON pending_registrations(token);
CREATE INDEX idx_pending_email ON pending_registrations(email);
CREATE INDEX idx_pending_expires ON pending_registrations(expires_at);

-- Add is_legacy flag to pending_registrations
-- (run this if you already ran the original migration)
ALTER TABLE pending_registrations ADD COLUMN IF NOT EXISTS is_legacy BOOLEAN DEFAULT FALSE;
