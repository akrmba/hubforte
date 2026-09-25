-- =============================================================================
-- Migration 0001: Unified Data Model for Yes Futures
-- UP migration — adds columns, creates tables, migrates data from yf_* tables
-- Does NOT drop yf_* tables (kept as backup until validated)
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 1: DDL — Extend enums, add columns, create new tables
-- ─────────────────────────────────────────────────────────────────────────────

-- 1a. Extend org_type enum with new values
ALTER TYPE org_type ADD VALUE IF NOT EXISTS 'TRUST';
ALTER TYPE org_type ADD VALUE IF NOT EXISTS 'SPONSOR';
ALTER TYPE org_type ADD VALUE IF NOT EXISTS 'PARTNER';

-- 1b. Add new columns to organizations
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS website text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS postcode text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS region text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS relationship_status text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS parent_org_id text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS source_table text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS source_id text;

-- 1c. Add new columns to contacts (YF contact fields)
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS department text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS preferred_contact_method text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS source_table text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS source_id text;

-- Make contacts.email nullable (YF contacts may not have email)
ALTER TABLE contacts ALTER COLUMN email DROP NOT NULL;

-- Make contacts.organization_id nullable (some contacts may not have an org)
ALTER TABLE contacts ALTER COLUMN organization_id DROP NOT NULL;

-- Make contacts.owner_id nullable (YF contacts use created_by instead)
ALTER TABLE contacts ALTER COLUMN owner_id DROP NOT NULL;

-- 1d. Create opportunity_type enum and extend opportunities table
DO $$ BEGIN
  CREATE TYPE opportunity_type AS ENUM ('SCHOOL_OUTREACH', 'FUNDING', 'GENERAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS opportunity_type text DEFAULT 'GENERAL';
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}';
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS source_table text;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS source_id text;

-- 1e. Add new columns to volunteers
ALTER TABLE volunteers ADD COLUMN IF NOT EXISTS first_name text;
ALTER TABLE volunteers ADD COLUMN IF NOT EXISTS last_name text;
ALTER TABLE volunteers ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE volunteers ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE volunteers ADD COLUMN IF NOT EXISTS organization_id text;
ALTER TABLE volunteers ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE volunteers ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}';
ALTER TABLE volunteers ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE volunteers ADD COLUMN IF NOT EXISTS source_table text;
ALTER TABLE volunteers ADD COLUMN IF NOT EXISTS source_id text;

-- Make volunteers.contact_id nullable (YF volunteers are standalone, not linked to CRM contacts)
ALTER TABLE volunteers ALTER COLUMN contact_id DROP NOT NULL;
-- Drop the unique constraint on contact_id so multiple null values are allowed
ALTER TABLE volunteers DROP CONSTRAINT IF EXISTS volunteers_contact_id_unique;

-- 1f. Extend activity_type enum with new values
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'SITE_VISIT';
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'WHATSAPP';
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'OTHER';

-- Add new columns to activities
ALTER TABLE activities ADD COLUMN IF NOT EXISTS subject text;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS next_action text;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS next_action_date text;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS volunteer_id text;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS student_id text;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS programme_id text;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}';
ALTER TABLE activities ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS source_table text;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS source_id text;

-- 1g. Create programmes table
CREATE TABLE IF NOT EXISTS programmes (
  id text PRIMARY KEY,
  school_id text NOT NULL,
  funding_opportunity_id text,
  programme_name text NOT NULL,
  programme_type text,
  year_group text,
  start_date text,
  end_date text,
  status text DEFAULT 'PLANNED',
  student_count integer DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by text,
  source_table text,
  source_id text
);

-- 1h. Create students table
CREATE TABLE IF NOT EXISTS students (
  id text PRIMARY KEY,
  school_id text NOT NULL,
  programme_id text,
  first_name text NOT NULL,
  last_name text NOT NULL,
  year_group text,
  consent_status text DEFAULT 'PENDING',
  attendance_count integer DEFAULT 0,
  safeguarding_flag boolean DEFAULT false,
  support_notes text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by text,
  source_table text,
  source_id text
);

-- 1i. Create placements table
CREATE TABLE IF NOT EXISTS placements (
  id text PRIMARY KEY,
  volunteer_id text NOT NULL,
  programme_id text NOT NULL,
  start_date text,
  end_date text,
  hours_delivered real DEFAULT 0,
  status text DEFAULT 'CONFIRMED',
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by text,
  source_table text,
  source_id text
);

-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 2: DATA MIGRATION — Move yf_* data into unified tables
-- ─────────────────────────────────────────────────────────────────────────────

-- Helper: safe text-to-timestamptz cast. Returns NULL on invalid input instead
-- of aborting the transaction. Used for yf_volunteers.dbs_expiry and
-- yf_activities.date which are text columns with no format validation.
CREATE OR REPLACE FUNCTION pg_temp.safe_to_timestamptz(val text)
RETURNS timestamptz AS $$
BEGIN
  IF val IS NULL OR val = '' THEN RETURN NULL; END IF;
  RETURN val::timestamptz;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 2a. Migrate yf_trusts → organizations (type = 'TRUST')
-- Guard: skip rows where the YF id already exists as a PK in organizations
INSERT INTO organizations (
  id, name, type, status, location, owner_id, notes,
  website, phone, address, postcode, region, email,
  relationship_status, metadata, parent_org_id,
  created_at, updated_at, created_by, source_table, source_id
)
SELECT
  t.id,
  t.trust_name,
  'TRUST'::org_type,
  CASE t.relationship_status
    WHEN 'ACTIVE' THEN 'ACTIVE'::org_status
    WHEN 'LAPSED' THEN 'INACTIVE'::org_status
    ELSE 'PROSPECT'::org_status
  END,
  t.head_office_address,
  COALESCE(t.created_by, 'system'),
  t.notes,
  t.website,
  t.phone,
  t.head_office_address,
  t.postcode,
  t.region,
  t.email,
  t.relationship_status,
  jsonb_build_object(
    'trustType', t.trust_type,
    'ceo', t.ceo,
    'educationLead', t.education_lead,
    'safeguardingLead', t.safeguarding_lead,
    'numberOfSchools', t.number_of_schools
  ),
  NULL,
  COALESCE(t.created_at, now()),
  COALESCE(t.updated_at, now()),
  t.created_by,
  'yf_trusts',
  t.id
FROM yf_trusts t
WHERE NOT EXISTS (SELECT 1 FROM organizations o WHERE o.source_id = t.id AND o.source_table = 'yf_trusts')
  AND NOT EXISTS (SELECT 1 FROM organizations o WHERE o.id = t.id);

-- 2b. Migrate yf_schools → organizations (type = 'SCHOOL')
-- parent_org_id links to the trust (which was just migrated with the same id)
INSERT INTO organizations (
  id, name, type, status, location, owner_id, notes,
  website, phone, address, postcode, region, email,
  relationship_status, metadata, parent_org_id,
  created_at, updated_at, created_by, source_table, source_id
)
SELECT
  s.id,
  s.school_name,
  'SCHOOL'::org_type,
  CASE s.relationship_status
    WHEN 'ACTIVE' THEN 'ACTIVE'::org_status
    WHEN 'LAPSED' THEN 'INACTIVE'::org_status
    ELSE 'PROSPECT'::org_status
  END,
  s.address,
  COALESCE(s.created_by, 'system'),
  s.notes,
  s.website,
  s.phone,
  s.address,
  s.postcode,
  NULL,
  NULL,
  s.relationship_status,
  jsonb_build_object(
    'urn', s.urn,
    'phase', s.phase,
    'headteacher', s.headteacher,
    'dsl', s.dsl,
    'senco', s.senco,
    'headOfSixthForm', s.head_of_sixth_form,
    'careersLead', s.careers_lead,
    'deliveryStatus', s.delivery_status
  ),
  s.trust_id,
  COALESCE(s.created_at, now()),
  COALESCE(s.updated_at, now()),
  s.created_by,
  'yf_schools',
  s.id
FROM yf_schools s
WHERE NOT EXISTS (SELECT 1 FROM organizations o WHERE o.source_id = s.id AND o.source_table = 'yf_schools')
  AND NOT EXISTS (SELECT 1 FROM organizations o WHERE o.id = s.id);

-- 2c. Migrate yf_sponsors → organizations (type = 'SPONSOR')
INSERT INTO organizations (
  id, name, type, status, location, owner_id, notes,
  website, phone, address, postcode, region, email,
  relationship_status, metadata, parent_org_id,
  created_at, updated_at, created_by, source_table, source_id
)
SELECT
  sp.id,
  sp.organisation_name,
  'SPONSOR'::org_type,
  CASE sp.relationship_status
    WHEN 'ACTIVE' THEN 'ACTIVE'::org_status
    WHEN 'LAPSED' THEN 'INACTIVE'::org_status
    ELSE 'PROSPECT'::org_status
  END,
  NULL,
  COALESCE(sp.created_by, 'system'),
  sp.notes,
  sp.website,
  NULL,
  NULL,
  NULL,
  sp.region,
  NULL,
  sp.relationship_status,
  jsonb_build_object(
    'sector', sp.sector,
    'csrPriority', sp.csr_priority,
    'employeeVolunteeringInterest', sp.employee_volunteering_interest
  ),
  NULL,
  COALESCE(sp.created_at, now()),
  COALESCE(sp.updated_at, now()),
  sp.created_by,
  'yf_sponsors',
  sp.id
FROM yf_sponsors sp
WHERE NOT EXISTS (SELECT 1 FROM organizations o WHERE o.source_id = sp.id AND o.source_table = 'yf_sponsors')
  AND NOT EXISTS (SELECT 1 FROM organizations o WHERE o.id = sp.id);

-- 2d. Create "Unaffiliated" placeholder organization for volunteers without a sponsor
INSERT INTO organizations (id, name, type, status, owner_id, notes, created_at, updated_at)
SELECT 'org_unaffiliated', 'Unaffiliated', 'OTHER'::org_type, 'ACTIVE'::org_status, 'system', 'Placeholder for volunteers not linked to a sponsor', now(), now()
WHERE NOT EXISTS (SELECT 1 FROM organizations WHERE id = 'org_unaffiliated');

-- 2e. Migrate yf_contacts → contacts
-- Link to the organization via school_id, trust_id, or sponsor_id (in that priority order)
INSERT INTO contacts (
  id, first_name, last_name, email, phone, status,
  organization_id, owner_id, title, department,
  preferred_contact_method, metadata,
  created_at, updated_at, created_by, source_table, source_id
)
SELECT
  c.id,
  c.first_name,
  c.last_name,
  c.email,
  c.phone,
  'ACTIVE'::contact_status,
  COALESCE(c.school_id, c.trust_id, c.sponsor_id),
  c.created_by,
  c.job_title,
  c.department,
  c.preferred_contact_method,
  jsonb_build_object(
    'isDecisionMaker', COALESCE(c.is_decision_maker, false),
    'isFirstOutreachContact', COALESCE(c.is_first_outreach_contact, false),
    'isDeliveryContact', COALESCE(c.is_delivery_contact, false),
    'isSafeguardingRelevant', COALESCE(c.is_safeguarding_relevant, false),
    'yearGroupsRelevant', c.year_groups_relevant
  ),
  COALESCE(c.created_at, now()),
  COALESCE(c.updated_at, now()),
  c.created_by,
  'yf_contacts',
  c.id
FROM yf_contacts c
WHERE NOT EXISTS (SELECT 1 FROM contacts ct WHERE ct.source_id = c.id AND ct.source_table = 'yf_contacts')
  AND NOT EXISTS (SELECT 1 FROM contacts ct WHERE ct.id = c.id);

-- 2f. Migrate yf_funding_opportunities → opportunities (opportunity_type = 'FUNDING')
INSERT INTO opportunities (
  id, name, value, stage, funder_id, organization_id, owner_id,
  expected_close_date, description, notes,
  opportunity_type, metadata,
  created_at, updated_at, created_by, source_table, source_id
)
SELECT
  fo.id,
  COALESCE(sp.organisation_name, 'Unknown') || ' Funding',
  fo.amount::numeric,
  CASE fo.stage
    WHEN 'PROSPECT' THEN 'PROSPECT'::opportunity_stage
    WHEN 'PROPOSAL_SENT' THEN 'APPROACH'::opportunity_stage
    WHEN 'AGREED' THEN 'AWARDED'::opportunity_stage
    WHEN 'ACTIVE' THEN 'AWARDED'::opportunity_stage
    WHEN 'COMPLETED' THEN 'AWARDED'::opportunity_stage
    WHEN 'DECLINED' THEN 'DECLINED'::opportunity_stage
    ELSE 'PROSPECT'::opportunity_stage
  END,
  NULL,
  fo.sponsor_id,
  COALESCE(fo.created_by, 'system'),
  NULL,
  NULL,
  fo.notes,
  'FUNDING',
  jsonb_build_object(
    'fundingType', fo.funding_type,
    'renewalDate', fo.renewal_date,
    'reportingRequired', COALESCE(fo.reporting_required, false),
    'reportingDeadline', fo.reporting_deadline,
    'originalStage', fo.stage
  ),
  COALESCE(fo.created_at, now()),
  COALESCE(fo.updated_at, now()),
  fo.created_by,
  'yf_funding_opportunities',
  fo.id
FROM yf_funding_opportunities fo
LEFT JOIN yf_sponsors sp ON sp.id = fo.sponsor_id
WHERE NOT EXISTS (SELECT 1 FROM opportunities o WHERE o.source_id = fo.id AND o.source_table = 'yf_funding_opportunities')
  AND NOT EXISTS (SELECT 1 FROM opportunities o WHERE o.id = fo.id);

-- 2g. Migrate yf_programmes → programmes
INSERT INTO programmes (
  id, school_id, funding_opportunity_id, programme_name, programme_type,
  year_group, start_date, end_date, status, student_count, notes,
  created_at, updated_at, created_by, source_table, source_id
)
SELECT
  p.id,
  p.school_id,
  p.funding_opportunity_id,
  p.programme_name,
  p.programme_type,
  p.year_group,
  p.start_date,
  p.end_date,
  p.status,
  p.student_count,
  p.notes,
  COALESCE(p.created_at, now()),
  COALESCE(p.updated_at, now()),
  p.created_by,
  'yf_programmes',
  p.id
FROM yf_programmes p
WHERE NOT EXISTS (SELECT 1 FROM programmes pr WHERE pr.source_id = p.id AND pr.source_table = 'yf_programmes')
  AND NOT EXISTS (SELECT 1 FROM programmes pr WHERE pr.id = p.id);

-- 2h. Migrate yf_students → students
INSERT INTO students (
  id, school_id, programme_id, first_name, last_name, year_group,
  consent_status, attendance_count, safeguarding_flag, support_notes, notes,
  created_at, updated_at, created_by, source_table, source_id
)
SELECT
  s.id,
  s.school_id,
  s.programme_id,
  s.first_name,
  s.last_name,
  s.year_group,
  s.consent_status,
  s.attendance_count,
  COALESCE(s.safeguarding_flag, false),
  s.support_notes,
  s.notes,
  COALESCE(s.created_at, now()),
  COALESCE(s.updated_at, now()),
  s.created_by,
  'yf_students',
  s.id
FROM yf_students s
WHERE NOT EXISTS (SELECT 1 FROM students st WHERE st.source_id = s.id AND st.source_table = 'yf_students')
  AND NOT EXISTS (SELECT 1 FROM students st WHERE st.id = s.id);

-- 2i. Migrate yf_volunteers → volunteers
-- Creates a contact record for each YF volunteer, then creates the volunteer record
-- Step 1: Create contact records for YF volunteers
INSERT INTO contacts (
  id, first_name, last_name, email, phone, status,
  organization_id, owner_id,
  created_at, updated_at, created_by, source_table, source_id
)
SELECT
  'cnt_' || v.id,
  v.first_name,
  v.last_name,
  v.email,
  v.phone,
  CASE v.status
    WHEN 'ACTIVE' THEN 'ACTIVE'::contact_status
    WHEN 'INACTIVE' THEN 'INACTIVE'::contact_status
    ELSE 'PROSPECT'::contact_status
  END,
  COALESCE(v.sponsor_id, 'org_unaffiliated'),
  v.created_by,
  COALESCE(v.created_at, now()),
  COALESCE(v.updated_at, now()),
  v.created_by,
  'yf_volunteers_contact',
  v.id
FROM yf_volunteers v
WHERE NOT EXISTS (SELECT 1 FROM contacts ct WHERE ct.source_id = v.id AND ct.source_table = 'yf_volunteers_contact')
  AND NOT EXISTS (SELECT 1 FROM contacts ct WHERE ct.id = 'cnt_' || v.id);

-- Step 2: Create volunteer records linked to those contacts
INSERT INTO volunteers (
  id, contact_id, dbs_status, dbs_expires_at,
  availability, skills, internal_notes,
  first_name, last_name, email, phone,
  organization_id, status, metadata,
  created_at, updated_at, created_by, source_table, source_id
)
SELECT
  v.id,
  'cnt_' || v.id,
  CASE v.dbs_status
    WHEN 'CLEAR' THEN 'CLEAR'::dbs_status
    WHEN 'PENDING' THEN 'PENDING'::dbs_status
    WHEN 'EXPIRED' THEN 'EXPIRED'::dbs_status
    ELSE 'NOT_CHECKED'::dbs_status
  END,
  CASE WHEN v.dbs_expiry IS NOT NULL AND v.dbs_expiry != '' THEN pg_temp.safe_to_timestamptz(v.dbs_expiry) ELSE NULL END,
  v.availability,
  CASE WHEN v.skills IS NOT NULL AND v.skills != '' THEN ARRAY[v.skills] ELSE ARRAY[]::text[] END,
  v.notes,
  v.first_name,
  v.last_name,
  v.email,
  v.phone,
  COALESCE(v.sponsor_id, 'org_unaffiliated'),
  v.status,
  jsonb_build_object(
    'safeguardingTrainingDate', v.safeguarding_training_date,
    'assignedCoordinator', v.assigned_coordinator
  ),
  COALESCE(v.created_at, now()),
  COALESCE(v.updated_at, now()),
  v.created_by,
  'yf_volunteers',
  v.id
FROM yf_volunteers v
WHERE NOT EXISTS (SELECT 1 FROM volunteers vol WHERE vol.source_id = v.id AND vol.source_table = 'yf_volunteers')
  AND NOT EXISTS (SELECT 1 FROM volunteers vol WHERE vol.id = v.id);

-- 2j. Migrate yf_placements → placements
INSERT INTO placements (
  id, volunteer_id, programme_id, start_date, end_date,
  hours_delivered, status, notes,
  created_at, updated_at, created_by, source_table, source_id
)
SELECT
  p.id,
  p.volunteer_id,
  p.programme_id,
  p.start_date,
  p.end_date,
  COALESCE(p.hours_delivered, 0),
  p.status,
  p.notes,
  COALESCE(p.created_at, now()),
  COALESCE(p.updated_at, now()),
  p.created_by,
  'yf_placements',
  p.id
FROM yf_placements p
WHERE NOT EXISTS (SELECT 1 FROM placements pl WHERE pl.source_id = p.id AND pl.source_table = 'yf_placements')
  AND NOT EXISTS (SELECT 1 FROM placements pl WHERE pl.id = p.id);

-- 2k. Migrate yf_activities → activities
-- Map polymorphic links to the unified columns
INSERT INTO activities (
  id, type, summary, date,
  contact_id, organization_id, opportunity_id,
  user_id, subject, notes,
  next_action, next_action_date,
  volunteer_id, student_id, programme_id,
  created_at, created_by, source_table, source_id
)
SELECT
  a.id,
  CASE a.activity_type
    WHEN 'CALL' THEN 'CALL'::activity_type
    WHEN 'EMAIL' THEN 'EMAIL'::activity_type
    WHEN 'MEETING' THEN 'MEETING'::activity_type
    WHEN 'SITE_VISIT' THEN 'SITE_VISIT'::activity_type
    WHEN 'WHATSAPP' THEN 'WHATSAPP'::activity_type
    ELSE 'OTHER'::activity_type
  END,
  a.subject,
  COALESCE(pg_temp.safe_to_timestamptz(a.date), now()),
  NULL,
  COALESCE(a.linked_school_id, a.linked_trust_id, a.linked_sponsor_id),
  NULL,
  a.owner_id,
  a.subject,
  a.notes,
  a.next_action,
  a.next_action_date,
  a.linked_volunteer_id,
  a.linked_student_id,
  a.linked_programme_id,
  COALESCE(a.created_at, now()),
  a.created_by,
  'yf_activities',
  a.id
FROM yf_activities a
WHERE NOT EXISTS (SELECT 1 FROM activities act WHERE act.source_id = a.id AND act.source_table = 'yf_activities')
  AND NOT EXISTS (SELECT 1 FROM activities act WHERE act.id = a.id);

-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 3: INDEXES for new columns
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_organizations_type ON organizations(type);
CREATE INDEX IF NOT EXISTS idx_organizations_parent_org_id ON organizations(parent_org_id);
CREATE INDEX IF NOT EXISTS idx_organizations_source ON organizations(source_table, source_id);
CREATE INDEX IF NOT EXISTS idx_contacts_source ON contacts(source_table, source_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_type ON opportunities(opportunity_type);
CREATE INDEX IF NOT EXISTS idx_opportunities_source ON opportunities(source_table, source_id);
CREATE INDEX IF NOT EXISTS idx_volunteers_organization_id ON volunteers(organization_id);
CREATE INDEX IF NOT EXISTS idx_volunteers_source ON volunteers(source_table, source_id);
CREATE INDEX IF NOT EXISTS idx_activities_volunteer_id ON activities(volunteer_id);
CREATE INDEX IF NOT EXISTS idx_activities_student_id ON activities(student_id);
CREATE INDEX IF NOT EXISTS idx_activities_programme_id ON activities(programme_id);
CREATE INDEX IF NOT EXISTS idx_activities_source ON activities(source_table, source_id);
CREATE INDEX IF NOT EXISTS idx_programmes_school_id ON programmes(school_id);
CREATE INDEX IF NOT EXISTS idx_programmes_funding_opportunity_id ON programmes(funding_opportunity_id);
CREATE INDEX IF NOT EXISTS idx_students_school_id ON students(school_id);
CREATE INDEX IF NOT EXISTS idx_students_programme_id ON students(programme_id);
CREATE INDEX IF NOT EXISTS idx_placements_volunteer_id ON placements(volunteer_id);
CREATE INDEX IF NOT EXISTS idx_placements_programme_id ON placements(programme_id);

COMMIT;
