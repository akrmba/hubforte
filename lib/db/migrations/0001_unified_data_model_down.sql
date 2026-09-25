-- =============================================================================
-- Migration 0001: Unified Data Model for Yes Futures
-- DOWN migration — reverses all DDL changes, deletes migrated data
-- Does NOT touch yf_* tables (they were never dropped)
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 1: Delete migrated data (identified by source_table column)
-- ─────────────────────────────────────────────────────────────────────────────

-- Delete migrated activities (from yf_activities)
DELETE FROM activities WHERE source_table = 'yf_activities';

-- Delete migrated placements
DELETE FROM placements WHERE source_table = 'yf_placements';

-- Delete migrated volunteers (from yf_volunteers)
DELETE FROM volunteers WHERE source_table = 'yf_volunteers';

-- Delete contact records created for yf_volunteers
DELETE FROM contacts WHERE source_table = 'yf_volunteers_contact';

-- Delete migrated students
DELETE FROM students WHERE source_table = 'yf_students';

-- Delete migrated programmes
DELETE FROM programmes WHERE source_table = 'yf_programmes';

-- Delete migrated opportunities (from yf_funding_opportunities)
DELETE FROM opportunities WHERE source_table = 'yf_funding_opportunities';

-- Delete migrated contacts (from yf_contacts)
DELETE FROM contacts WHERE source_table = 'yf_contacts';

-- Delete migrated organizations (sponsors, schools, trusts)
DELETE FROM organizations WHERE source_table IN ('yf_sponsors', 'yf_schools', 'yf_trusts');

-- Delete the unaffiliated placeholder org
DELETE FROM organizations WHERE id = 'org_unaffiliated';

-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 2: Drop new tables
-- ─────────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS placements;
DROP TABLE IF EXISTS students;
DROP TABLE IF EXISTS programmes;

-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 3: Drop indexes added by UP migration
-- ─────────────────────────────────────────────────────────────────────────────

DROP INDEX IF EXISTS idx_organizations_type;
DROP INDEX IF EXISTS idx_organizations_parent_org_id;
DROP INDEX IF EXISTS idx_organizations_source;
DROP INDEX IF EXISTS idx_contacts_source;
DROP INDEX IF EXISTS idx_opportunities_type;
DROP INDEX IF EXISTS idx_opportunities_source;
DROP INDEX IF EXISTS idx_volunteers_organization_id;
DROP INDEX IF EXISTS idx_volunteers_source;
DROP INDEX IF EXISTS idx_activities_volunteer_id;
DROP INDEX IF EXISTS idx_activities_student_id;
DROP INDEX IF EXISTS idx_activities_programme_id;
DROP INDEX IF EXISTS idx_activities_source;

-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 4: Remove added columns from existing tables
-- ─────────────────────────────────────────────────────────────────────────────

-- activities: remove added columns
ALTER TABLE activities DROP COLUMN IF EXISTS subject;
ALTER TABLE activities DROP COLUMN IF EXISTS notes;
ALTER TABLE activities DROP COLUMN IF EXISTS next_action;
ALTER TABLE activities DROP COLUMN IF EXISTS next_action_date;
ALTER TABLE activities DROP COLUMN IF EXISTS volunteer_id;
ALTER TABLE activities DROP COLUMN IF EXISTS student_id;
ALTER TABLE activities DROP COLUMN IF EXISTS programme_id;
ALTER TABLE activities DROP COLUMN IF EXISTS metadata;
ALTER TABLE activities DROP COLUMN IF EXISTS created_by;
ALTER TABLE activities DROP COLUMN IF EXISTS source_table;
ALTER TABLE activities DROP COLUMN IF EXISTS source_id;

-- volunteers: remove added columns, restore constraints
ALTER TABLE volunteers DROP COLUMN IF EXISTS first_name;
ALTER TABLE volunteers DROP COLUMN IF EXISTS last_name;
ALTER TABLE volunteers DROP COLUMN IF EXISTS email;
ALTER TABLE volunteers DROP COLUMN IF EXISTS phone;
ALTER TABLE volunteers DROP COLUMN IF EXISTS organization_id;
ALTER TABLE volunteers DROP COLUMN IF EXISTS status;
ALTER TABLE volunteers DROP COLUMN IF EXISTS metadata;
ALTER TABLE volunteers DROP COLUMN IF EXISTS created_by;
ALTER TABLE volunteers DROP COLUMN IF EXISTS source_table;
ALTER TABLE volunteers DROP COLUMN IF EXISTS source_id;
-- Restore NOT NULL and UNIQUE on contact_id
ALTER TABLE volunteers ALTER COLUMN contact_id SET NOT NULL;
ALTER TABLE volunteers ADD CONSTRAINT volunteers_contact_id_unique UNIQUE (contact_id);

-- opportunities: remove added columns
ALTER TABLE opportunities DROP COLUMN IF EXISTS opportunity_type;
ALTER TABLE opportunities DROP COLUMN IF EXISTS metadata;
ALTER TABLE opportunities DROP COLUMN IF EXISTS created_by;
ALTER TABLE opportunities DROP COLUMN IF EXISTS source_table;
ALTER TABLE opportunities DROP COLUMN IF EXISTS source_id;

-- contacts: remove added columns, restore constraints
ALTER TABLE contacts DROP COLUMN IF EXISTS title;
ALTER TABLE contacts DROP COLUMN IF EXISTS department;
ALTER TABLE contacts DROP COLUMN IF EXISTS preferred_contact_method;
ALTER TABLE contacts DROP COLUMN IF EXISTS metadata;
ALTER TABLE contacts DROP COLUMN IF EXISTS created_by;
ALTER TABLE contacts DROP COLUMN IF EXISTS source_table;
ALTER TABLE contacts DROP COLUMN IF EXISTS source_id;
-- Restore NOT NULL constraints
ALTER TABLE contacts ALTER COLUMN email SET NOT NULL;
ALTER TABLE contacts ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE contacts ALTER COLUMN owner_id SET NOT NULL;

-- organizations: remove added columns
ALTER TABLE organizations DROP COLUMN IF EXISTS website;
ALTER TABLE organizations DROP COLUMN IF EXISTS phone;
ALTER TABLE organizations DROP COLUMN IF EXISTS address;
ALTER TABLE organizations DROP COLUMN IF EXISTS postcode;
ALTER TABLE organizations DROP COLUMN IF EXISTS region;
ALTER TABLE organizations DROP COLUMN IF EXISTS email;
ALTER TABLE organizations DROP COLUMN IF EXISTS relationship_status;
ALTER TABLE organizations DROP COLUMN IF EXISTS metadata;
ALTER TABLE organizations DROP COLUMN IF EXISTS parent_org_id;
ALTER TABLE organizations DROP COLUMN IF EXISTS created_by;
ALTER TABLE organizations DROP COLUMN IF EXISTS source_table;
ALTER TABLE organizations DROP COLUMN IF EXISTS source_id;

-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 5: Remove added enum values
-- NOTE: PostgreSQL does not support removing enum values directly.
-- The added values (TRUST, SPONSOR, PARTNER on org_type; SITE_VISIT, WHATSAPP,
-- OTHER on activity_type; opportunity_type type) will remain in the database
-- but will not be used by any data after rollback.
-- To fully remove them requires recreating the enum type, which is destructive.
-- This is documented as a known limitation of the rollback.
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop the opportunity_type enum (standalone type, safe to drop)
DROP TYPE IF EXISTS opportunity_type;

COMMIT;
