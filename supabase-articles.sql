-- ORCA Ireland: Articles / Help Guides
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS articles (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  category     TEXT NOT NULL CHECK (category IN ('help','news','technical','raceday')),
  template     TEXT NOT NULL,  -- which template was used
  intro        TEXT,           -- opening paragraph
  content      JSONB NOT NULL DEFAULT '{}', -- template-specific fields
  author_name  TEXT,
  published    BOOLEAN DEFAULT TRUE,
  public_teaser BOOLEAN DEFAULT TRUE, -- show on main site
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

-- Index for ordering
CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category, created_at DESC);

-- Verify
SELECT COUNT(*) as articles_table_ready FROM articles;
