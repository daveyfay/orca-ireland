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

-- ============================================================
-- GARAGE & EVENT ENTRY TABLES
-- ============================================================

-- Cars: each member can have multiple cars
CREATE TABLE IF NOT EXISTS cars (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id     UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  nickname      TEXT NOT NULL,
  make          TEXT NOT NULL,
  model         TEXT NOT NULL,
  color         TEXT NOT NULL,
  class         TEXT NOT NULL CHECK (class IN ('gt', 'gp')),
  transponder   TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cars_member ON cars(member_id);
ALTER TABLE cars DISABLE ROW LEVEL SECURITY;

-- Event entries: one entry per member per event
CREATE TABLE IF NOT EXISTS event_entries (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id      TEXT NOT NULL,
  event_name    TEXT NOT NULL,
  event_date    DATE NOT NULL,
  member_id     UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  car_id        UUID NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
  class         TEXT NOT NULL,
  transponder   TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_id, member_id)
);

CREATE INDEX idx_entries_event ON event_entries(event_id);
CREATE INDEX idx_entries_member ON event_entries(member_id);
ALTER TABLE event_entries DISABLE ROW LEVEL SECURITY;
