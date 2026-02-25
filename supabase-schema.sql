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

-- ============================================================
-- ADMIN SYSTEM ADDITIONS
-- ============================================================

-- Add admin and suspended columns to members
ALTER TABLE members ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;
ALTER TABLE members ADD COLUMN IF NOT EXISTS suspended BOOLEAN DEFAULT FALSE;

-- Events table (replaces hardcoded JS array)
CREATE TABLE IF NOT EXISTS events (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name         TEXT NOT NULL,
  event_date   DATE NOT NULL,
  description  TEXT,
  location     TEXT DEFAULT 'St Anne''s Park, Dublin',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE events DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date);

-- Gallery table (replaces hardcoded HTML)
CREATE TABLE IF NOT EXISTS gallery (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  url         TEXT NOT NULL,
  caption     TEXT,
  is_large    BOOLEAN DEFAULT FALSE,
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE gallery DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_gallery_sort ON gallery(sort_order);

-- Guides table (optional CMS for guide content)
CREATE TABLE IF NOT EXISTS guides (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title       TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE guides DISABLE ROW LEVEL SECURITY;

-- Seed initial events (match the JS array)
INSERT INTO events (name, event_date, description) VALUES
  ('Round 1 — Club Championship', '2026-03-16', 'Opening round of the 2026 ORCA Ireland Club Championship.'),
  ('Round 2 — Club Championship', '2026-04-13', 'Round 2 of the 2026 ORCA Ireland Club Championship.'),
  ('Round 3 — Club Championship', '2026-05-11', 'Round 3 of the 2026 ORCA Ireland Club Championship.'),
  ('Round 4 — Club Championship', '2026-06-08', 'Round 4 of the 2026 ORCA Ireland Club Championship.')
ON CONFLICT DO NOTHING;

-- Seed gallery from existing images
INSERT INTO gallery (url, caption, is_large, sort_order) VALUES
  ('/images/gallery-1.jpg', '1/8 GT — On Track Action · St Anne''s Park', TRUE, 1),
  ('/images/gallery-2.jpg', '1/8 GT — Repsol Livery · Race Day', FALSE, 2),
  ('/images/gallery-3.jpg', 'Pit Lane — Race Prep', FALSE, 3),
  ('/images/gallery-4.jpg', 'Podium — Summer Series 2024', FALSE, 4),
  ('/images/gallery-5.jpg', 'Podium — Club Championship · St Anne''s Park', FALSE, 5),
  ('/images/gallery-6.jpg', 'Track Infield — St Anne''s Park, Dublin', FALSE, 6)
ON CONFLICT DO NOTHING;

-- To make a member an admin, run:
-- UPDATE members SET is_admin = TRUE WHERE username = 'their_username';
