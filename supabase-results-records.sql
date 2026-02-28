-- ORCA Ireland: Race Results & Track Records
-- Run in Supabase SQL Editor

-- ── Race Events (results) ─────────────────────────────────────
-- Each row is one race event with an embedded JSONB array of finishers.
-- finishers format: [{ class, position, name, fastest_lap }, ...]
CREATE TABLE IF NOT EXISTS race_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name   TEXT NOT NULL,
  event_date   DATE NOT NULL,
  finishers    JSONB NOT NULL DEFAULT '[]',
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- Index for fast date-ordered queries
CREATE INDEX IF NOT EXISTS race_events_date_idx ON race_events (event_date DESC);

-- ── Track Records (all-time best laps per class) ──────────────
-- One row per class. Upserted when a record is broken.
CREATE TABLE IF NOT EXISTS track_records (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_name   TEXT NOT NULL UNIQUE,   -- enforces one record per class
  holder_name  TEXT NOT NULL,
  lap_time     TEXT NOT NULL,          -- stored as text e.g. "16.822"
  set_at_event TEXT,                   -- e.g. "Round 3 — Oct 2023"
  updated_at   TIMESTAMPTZ DEFAULT now()
);

-- Seed with existing all-time records from old site
INSERT INTO track_records (class_name, holder_name, lap_time, set_at_event)
VALUES
  ('GT Pro',          'Jason Noonan',    '16.822', 'Legacy record'),
  ('1/8 On Road',     'Austin Elliott',  '15.204', 'Legacy record'),
  ('GT Pro Club',     'Graeme Lougheed', '17.368', 'Legacy record'),
  ('1/8 On Road Club','Austin Elliott',  '15.391', 'Legacy record'),
  ('Open Class',      'Gary Sheil',      '19.324', 'Legacy record')
ON CONFLICT (class_name) DO NOTHING;

-- Verify
SELECT * FROM track_records ORDER BY class_name;
