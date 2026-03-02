-- Add payment tracking columns to members table
ALTER TABLE members ADD COLUMN IF NOT EXISTS pay_token TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS payment_clicked_at TIMESTAMPTZ;

-- Index for fast token lookups
CREATE INDEX IF NOT EXISTS idx_members_pay_token ON members(pay_token);
