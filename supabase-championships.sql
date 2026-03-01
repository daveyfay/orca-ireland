-- ORCA Ireland: Championship Standings
-- Run in Supabase SQL Editor

-- Championships table - one row per championship per season
CREATE TABLE IF NOT EXISTS championships (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,        -- e.g. "GT Pro Club"
  season        INTEGER NOT NULL,     -- e.g. 2026
  total_rounds  INTEGER NOT NULL DEFAULT 6,
  rounds_to_count INTEGER NOT NULL DEFAULT 4, -- best N of total_rounds count
  active        BOOLEAN DEFAULT TRUE,
  sort_order    INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(name, season)
);

-- Championship scores - one row per driver per championship
CREATE TABLE IF NOT EXISTS championship_scores (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  championship_id   UUID NOT NULL REFERENCES championships(id) ON DELETE CASCADE,
  driver_name       TEXT NOT NULL,
  club_number       TEXT,
  car_make          TEXT,
  car_model         TEXT,
  round_scores      JSONB NOT NULL DEFAULT '{}', -- {"1": 96, "2": 100, "3": null, ...}
  created_at        TIMESTAMPTZ DEFAULT now(),
  UNIQUE(championship_id, driver_name)
);

-- Seed 2026 championships
INSERT INTO championships (name, season, total_rounds, rounds_to_count, active, sort_order)
VALUES
  ('GT Pro Club',          2026, 6, 4, TRUE, 1),
  ('GT Pro National',      2026, 6, 4, TRUE, 2),
  ('1/8 On Road Club',     2026, 6, 4, TRUE, 3),
  ('1/8 On Road National', 2026, 6, 4, TRUE, 4)
ON CONFLICT (name, season) DO NOTHING;

-- Verify
SELECT id, name, season, total_rounds, rounds_to_count FROM championships ORDER BY sort_order;
