-- Phase 10: Remove lead_score from contacts
ALTER TABLE contacts DROP COLUMN IF EXISTS lead_score;
ALTER TABLE contacts DROP COLUMN IF EXISTS lead_score_label;
ALTER TABLE contacts DROP COLUMN IF EXISTS lead_score_explanation;
ALTER TABLE contacts DROP COLUMN IF EXISTS lead_score_updated_at;
