-- Phase 10: Add lead_score to contacts
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lead_score INTEGER;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lead_score_label TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lead_score_explanation TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lead_score_updated_at TIMESTAMPTZ;
