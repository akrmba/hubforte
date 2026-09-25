-- Migration: Create safeguarding_notes and safeguarding_access_log tables
-- These tables support safeguarding case management with comprehensive access logging

-- Create enum types
CREATE TYPE safeguarding_category AS ENUM ('CONCERN', 'INCIDENT', 'DISCLOSURE', 'MEDICAL', 'BEHAVIORAL', 'OTHER');
CREATE TYPE severity_level AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE safeguarding_status AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'ESCALATED');
CREATE TYPE confidentiality_level AS ENUM ('STANDARD', 'RESTRICTED', 'HIGHLY_RESTRICTED');
CREATE TYPE access_type AS ENUM ('VIEW', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT');

-- Create safeguarding_notes table
CREATE TABLE safeguarding_notes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category safeguarding_category NOT NULL,
  severity severity_level NOT NULL DEFAULT 'MEDIUM',
  status safeguarding_status NOT NULL DEFAULT 'OPEN',
  confidentiality_level confidentiality_level NOT NULL DEFAULT 'STANDARD',
  reported_date TEXT NOT NULL,
  reported_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  assigned_to_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  next_review_date TEXT,
  resolution_notes TEXT,
  resolution_date TEXT,
  related_entities JSONB NOT NULL DEFAULT '[]',
  attachments JSONB NOT NULL DEFAULT '[]',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create safeguarding_access_log table
CREATE TABLE safeguarding_access_log (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  safeguarding_note_id TEXT NOT NULL REFERENCES safeguarding_notes(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access_type access_type NOT NULL,
  access_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address TEXT,
  user_agent TEXT,
  accessed_fields JSONB NOT NULL DEFAULT '[]',
  reason_for_access TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'
);

-- Create indexes for safeguarding_notes
CREATE INDEX idx_safeguarding_notes_tenant_id ON safeguarding_notes(tenant_id);
CREATE INDEX idx_safeguarding_notes_student_id ON safeguarding_notes(student_id);
CREATE INDEX idx_safeguarding_notes_category ON safeguarding_notes(category);
CREATE INDEX idx_safeguarding_notes_severity ON safeguarding_notes(severity);
CREATE INDEX idx_safeguarding_notes_status ON safeguarding_notes(status);
CREATE INDEX idx_safeguarding_notes_confidentiality_level ON safeguarding_notes(confidentiality_level);
CREATE INDEX idx_safeguarding_notes_reported_date ON safeguarding_notes(reported_date);
CREATE INDEX idx_safeguarding_notes_assigned_to_user_id ON safeguarding_notes(assigned_to_user_id);
CREATE INDEX idx_safeguarding_notes_next_review_date ON safeguarding_notes(next_review_date);
CREATE INDEX idx_safeguarding_notes_created_at ON safeguarding_notes(created_at);

-- Create indexes for safeguarding_access_log
CREATE INDEX idx_safeguarding_access_log_tenant_id ON safeguarding_access_log(tenant_id);
CREATE INDEX idx_safeguarding_access_log_safeguarding_note_id ON safeguarding_access_log(safeguarding_note_id);
CREATE INDEX idx_safeguarding_access_log_user_id ON safeguarding_access_log(user_id);
CREATE INDEX idx_safeguarding_access_log_access_type ON safeguarding_access_log(access_type);
CREATE INDEX idx_safeguarding_access_log_access_timestamp ON safeguarding_access_log(access_timestamp);
CREATE INDEX idx_safeguarding_access_log_tenant_user_timestamp ON safeguarding_access_log(tenant_id, user_id, access_timestamp DESC);

-- Add comments
COMMENT ON TABLE safeguarding_notes IS 'Stores safeguarding concerns, incidents, and disclosures with workflow management';
COMMENT ON TABLE safeguarding_access_log IS 'Audit log of all accesses to safeguarding notes for compliance and accountability';

COMMENT ON COLUMN safeguarding_notes.confidentiality_level IS 'Access control level: STANDARD (authorized staff), RESTRICTED (safeguarding team only), HIGHLY_RESTRICTED (DSL/lead only)';
COMMENT ON COLUMN safeguarding_notes.related_entities IS 'Array of related entity references (e.g., programmes, sessions, staff, other students)';
COMMENT ON COLUMN safeguarding_notes.attachments IS 'Array of attachment metadata (file names, URLs, upload dates)';

COMMENT ON COLUMN safeguarding_access_log.accessed_fields IS 'Array of field names that were accessed during VIEW operations';
COMMENT ON COLUMN safeguarding_access_log.reason_for_access IS 'Optional reason provided by user for accessing the safeguarding note';