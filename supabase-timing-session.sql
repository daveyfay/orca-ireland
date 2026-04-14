-- ORCA Ireland: Race-day session persistence
-- Run this in Supabase SQL Editor.
--
-- Extends timing_live so that a race day is a first-class, server-side
-- "session" any admin can pick up on refresh or on a different device.
--
-- Columns added:
--   is_active       — TRUE while a day is in progress
--   state_snapshot  — full admin `state` object, rehydrated on admin login
--   started_at      — when the day was kicked off
--   finished_at     — when Finish Day was pressed (null while active)
--   started_by      — admin name who started it, for the "joined in-progress" banner

ALTER TABLE timing_live
  ADD COLUMN IF NOT EXISTS is_active      BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS state_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS started_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS finished_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS started_by     TEXT;

-- Public read policy already covers the new columns (SELECT uses true).
-- Realtime publication already covers the table (no re-add needed).

SELECT 'timing_live: session columns ready' as status;
