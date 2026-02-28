-- ORCA Ireland: Marketplace Listings
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS marketplace_listings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT NOT NULL,
  price         NUMERIC(10,2) NOT NULL,
  seller_name   TEXT NOT NULL,
  seller_email  TEXT NOT NULL,   -- never exposed publicly via API
  image_url     TEXT,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Verify
SELECT COUNT(*) FROM marketplace_listings;
