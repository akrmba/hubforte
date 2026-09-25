-- Migration: Create consent_records and parent_guardians tables
-- These tables support consent management and parent/guardian contact information

-- Create enum types
CREATE TYPE consent_type AS ENUM ('PROGRAMME_PARTICIPATION', 'PHOTOGRAPHY', 'DATA_SHARING', 'MEDICAL', 'TRANSPORT', 'OTHER');
CREATE TYPE consent_scope AS ENUM ('SINGLE_PROGRAMME', 'ALL_PROGRAMMES', 'ORGANIZATION_WIDE');
CREATE TYPE consent_status AS ENUM ('PENDING', 'OBTAINED', 'EXPIRED', 'WITHDRAWN', 'REVOKED');
CREATE TYPE obtained_method AS ENUM ('PAPER_FORM', 'DIGITAL_FORM', 'VERBAL', 'EMAIL', 'OTHER');
CREATE TYPE relationship_type AS ENUM ('PARENT', 'GUARDIAN', 'GRANDPARENT', 'SIBLING', 'OTHER');
CREATE TYPE contact_method AS ENUM ('EMAIL', 'PHONE_MOBILE', 'PHONE_HOME', 'PHONE_WORK', 'POST');

-- Create parent_guardians table (must be created first due to FK reference)
CREATE TABLE parent_guardians (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  relationship relationship_type NOT NULL,
  is_primary_contact BOOLEAN NOT NULL DEFAULT FALSE,
  is_emergency_contact BOOLEAN NOT NULL DEFAULT FALSE,
  email TEXT,
  phone_mobile TEXT,
  phone_home TEXT,
  phone_work TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  postcode TEXT,
  preferred_contact_method contact_method,
  preferred_contact_time TEXT,
  communication_preferences JSONB NOT NULL DEFAULT '{}',
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create consent_records table
CREATE TABLE consent_records (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  parent_guardian_id TEXT REFERENCES parent_guardians(id) ON DELETE SET NULL,
  consent_type consent_type NOT NULL,
  consent_scope consent_scope NOT NULL DEFAULT 'SINGLE_PROGRAMME',
  programme_id TEXT REFERENCES programmes(id) ON DELETE SET NULL,
  status consent_status NOT NULL DEFAULT 'PENDING',
  obtained_date TEXT,
  obtained_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  obtained_method obtained_method,
  expiry_date TEXT,
  withdrawn_date TEXT,
  withdrawn_reason TEXT,
  document_url TEXT,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for parent_guardians
CREATE INDEX idx_parent_guardians_tenant_id ON parent_guardians(tenant_id);
CREATE INDEX idx_parent_guardians_student_id ON parent_guardians(student_id);
CREATE INDEX idx_parent_guardians_relationship ON parent_guardians(relationship);
CREATE INDEX idx_parent_guardians_is_primary_contact ON parent_guardians(is_primary_contact);
CREATE INDEX idx_parent_guardians_is_emergency_contact ON parent_guardians(is_emergency_contact);
CREATE INDEX idx_parent_guardians_email ON parent_guardians(email) WHERE email IS NOT NULL;
CREATE INDEX idx_parent_guardians_phone_mobile ON parent_guardians(phone_mobile) WHERE phone_mobile IS NOT NULL;

-- Create indexes for consent_records
CREATE INDEX idx_consent_records_tenant_id ON consent_records(tenant_id);
CREATE INDEX idx_consent_records_student_id ON consent_records(student_id);
CREATE INDEX idx_consent_records_parent_guardian_id ON consent_records(parent_guardian_id);
CREATE INDEX idx_consent_records_consent_type ON consent_records(consent_type);
CREATE INDEX idx_consent_records_consent_scope ON consent_records(consent_scope);
CREATE INDEX idx_consent_records_programme_id ON consent_records(programme_id);
CREATE INDEX idx_consent_records_status ON consent_records(status);
CREATE INDEX idx_consent_records_obtained_date ON consent_records(obtained_date) WHERE obtained_date IS NOT NULL;
CREATE INDEX idx_consent_records_expiry_date ON consent_records(expiry_date) WHERE expiry_date IS NOT NULL;
CREATE INDEX idx_consent_records_created_at ON consent_records(created_at);

-- Add unique constraint to prevent duplicate consent records for same scope
-- One active consent per student per type per scope
CREATE UNIQUE INDEX idx_consent_records_unique_active 
  ON consent_records(tenant_id, student_id, consent_type, consent_scope, programme_id) 
  WHERE status = 'OBTAINED';

-- Add comments
COMMENT ON TABLE parent_guardians IS 'Stores parent and guardian contact information for students with relationship details';
COMMENT ON TABLE consent_records IS 'Manages consent lifecycle for students across different consent types and scopes';

COMMENT ON COLUMN parent_guardians.communication_preferences IS 'JSON object storing communication preferences (e.g., newsletter_opt_in, marketing_opt_in, notification_channels)';
COMMENT ON COLUMN parent_guardians.preferred_contact_time IS 'Preferred time of day for contact (e.g., "after 5pm", "weekends only")';

COMMENT ON COLUMN consent_records.consent_scope IS 'Scope of consent: SINGLE_PROGRAMME (specific programme), ALL_PROGRAMMES (all programmes), ORGANIZATION_WIDE (all activities)';
COMMENT ON COLUMN consent_records.obtained_method IS 'Method used to obtain consent: PAPER_FORM, DIGITAL_FORM, VERBAL, EMAIL, OTHER';
COMMENT ON COLUMN consent_records.document_url IS 'URL to scanned consent form or digital signature document';