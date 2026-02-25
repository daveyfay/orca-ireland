-- Run this in your Supabase SQL Editor
-- Go to: supabase.com → your project → SQL Editor → New Query

CREATE TABLE members (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  membership_type TEXT NOT NULL CHECK (membership_type IN ('full', 'junior')),
  expiry_date   DATE NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX idx_members_email    ON members(email);
CREATE INDEX idx_members_username ON members(username);
CREATE INDEX idx_members_expiry   ON members(expiry_date);

-- Disable Row Level Security so the service key can read/write freely
-- (the service key is only used server-side in Netlify Functions, never exposed to browsers)
ALTER TABLE members DISABLE ROW LEVEL SECURITY;
