-- ORCA Ireland: Real-time timing live state
-- Run this in Supabase SQL Editor before using /timing-live

-- Single table: one row per active event session
-- Upserted by the timing admin page on every crossing
CREATE TABLE IF NOT EXISTS timing_live (
  id            TEXT PRIMARY KEY DEFAULT 'current',  -- always 'current', single row
  event_name    TEXT,
  event_date    DATE,
  sess_key      TEXT,
  sess_label    TEXT,
  sess_type     TEXT,                                -- 'qual' | 'heat' | 'final'
  timer_remaining INTEGER DEFAULT 0,
  timer_total     INTEGER DEFAULT 0,
  timer_running   BOOLEAN DEFAULT FALSE,
  qual_method   TEXT DEFAULT 'best3consec',
  leaderboard   JSONB DEFAULT '[]',                  -- [{pos,name,class,bestConsec,bestLap,laps,sessLaps,gap,delta}]
  crossings     JSONB DEFAULT '[]',                  -- last 20 crossings [{name,lapTime,isPB,isOverallBest,lapN,ts}]
  heat_timers   JSONB DEFAULT '{}',                  -- {driverId: {remaining,laps,finished}} for heat mode
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security but allow public reads (anon key)
ALTER TABLE timing_live ENABLE ROW LEVEL SECURITY;

-- Anyone can read (anon key — needed for live page without login)
CREATE POLICY "public_read_timing" ON timing_live
  FOR SELECT USING (true);

-- Only service role can write (admin timing page goes via Netlify function with service key)
-- No INSERT/UPDATE policy needed for anon — only server-side writes

-- Enable Realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE timing_live;

-- Seed initial row so the live page always has something to subscribe to
INSERT INTO timing_live (id) VALUES ('current')
ON CONFLICT (id) DO NOTHING;

SELECT 'timing_live table ready' as status;
