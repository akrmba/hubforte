-- Hubforte: Drop yf_* tables
-- Run ONLY after data migration is verified and all yf references removed from code
-- Order: children first (FK dependencies), parents last

-- Children with FK references to other yf tables
DROP TABLE IF EXISTS yf_activities CASCADE;
DROP TABLE IF EXISTS yf_placements CASCADE;
DROP TABLE IF EXISTS yf_students CASCADE;
DROP TABLE IF EXISTS yf_volunteers CASCADE;
DROP TABLE IF EXISTS yf_programmes CASCADE;
DROP TABLE IF EXISTS yf_funding_opportunities CASCADE;
DROP TABLE IF EXISTS yf_contacts CASCADE;

-- Parent tables
DROP TABLE IF EXISTS yf_schools CASCADE;
DROP TABLE IF EXISTS yf_sponsors CASCADE;
DROP TABLE IF EXISTS yf_trusts CASCADE;

DO $$
BEGIN
  RAISE NOTICE 'All 10 yf_* tables dropped successfully.';
END $$;
