-- Hubforte Data Migration ROLLBACK: Remove all migrated rows from core tables
-- Run this to undo migrate-yf-to-core.sql
-- Order: reverse of migration (children first, parents last)

DELETE FROM activities WHERE source_table = 'yf_activities';
DELETE FROM placements WHERE source_table = 'yf_placements';
DELETE FROM volunteers WHERE source_table = 'yf_volunteers';
DELETE FROM students WHERE source_table = 'yf_students';
DELETE FROM programmes WHERE source_table = 'yf_programmes';
DELETE FROM funding_opportunities WHERE source_table = 'yf_funding_opportunities';
DELETE FROM funders WHERE source_table = 'yf_sponsors';
DELETE FROM contacts WHERE source_table = 'yf_contacts';
DELETE FROM organizations WHERE source_table IN ('yf_schools', 'yf_trusts', 'yf_sponsors');

DO $$
BEGIN
  RAISE NOTICE 'Rollback complete. Verify yf_* tables still have original data.';
END $$;
