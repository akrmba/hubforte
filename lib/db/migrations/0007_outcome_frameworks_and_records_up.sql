-- Migration: Create outcome_frameworks and outcome_records tables
-- These tables support outcome measurement and tracking for programmes and students

-- Create enum types
CREATE TYPE scoring_method AS ENUM ('RUBRIC', 'LIKERT', 'BINARY', 'NUMERIC');
CREATE TYPE outcome_framework_status AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');
CREATE TYPE assessment_type AS ENUM ('BASELINE', 'MIDLINE', 'ENDLINE', 'FOLLOW_UP', 'AD_HOC');
CREATE TYPE outcome_record_status AS ENUM ('DRAFT', 'SUBMITTED', 'VERIFIED', 'REJECTED');

-- Create outcome_frameworks table
CREATE TABLE outcome_frameworks (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  programme_id TEXT REFERENCES programmes(id) ON DELETE SET NULL,
  is_platform_default BOOLEAN NOT NULL DEFAULT FALSE,
  dimensions JSONB NOT NULL DEFAULT '[]',
  metrics JSONB NOT NULL DEFAULT '[]',
  scoring_method scoring_method NOT NULL,
  status outcome_framework_status NOT NULL DEFAULT 'DRAFT',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Ensure framework names are unique per tenant
  CONSTRAINT tenant_framework_name_unique UNIQUE (tenant_id, name)
);

-- Create outcome_records table
CREATE TABLE outcome_records (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  outcome_framework_id TEXT NOT NULL REFERENCES outcome_frameworks(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  programme_id TEXT REFERENCES programmes(id) ON DELETE SET NULL,
  cohort_id TEXT REFERENCES programme_cohorts(id) ON DELETE SET NULL,
  session_id TEXT REFERENCES programme_sessions(id) ON DELETE SET NULL,
  assessment_date TEXT NOT NULL,
  assessor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  assessment_type assessment_type NOT NULL,
  scores JSONB NOT NULL DEFAULT '{}',
  notes TEXT,
  evidence_url TEXT,
  status outcome_record_status NOT NULL DEFAULT 'DRAFT',
  verified_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Add unique constraint to prevent duplicate assessments for same student/framework/date
  CONSTRAINT unique_assessment_per_student_framework_date 
    UNIQUE (tenant_id, student_id, outcome_framework_id, assessment_date)
);

-- Create indexes for performance
CREATE INDEX idx_outcome_frameworks_tenant_id ON outcome_frameworks(tenant_id);
CREATE INDEX idx_outcome_frameworks_programme_id ON outcome_frameworks(programme_id);
CREATE INDEX idx_outcome_frameworks_status ON outcome_frameworks(status);
CREATE INDEX idx_outcome_frameworks_is_platform_default ON outcome_frameworks(is_platform_default);

CREATE INDEX idx_outcome_records_tenant_id ON outcome_records(tenant_id);
CREATE INDEX idx_outcome_records_outcome_framework_id ON outcome_records(outcome_framework_id);
CREATE INDEX idx_outcome_records_student_id ON outcome_records(student_id);
CREATE INDEX idx_outcome_records_programme_id ON outcome_records(programme_id);
CREATE INDEX idx_outcome_records_cohort_id ON outcome_records(cohort_id);
CREATE INDEX idx_outcome_records_session_id ON outcome_records(session_id);
CREATE INDEX idx_outcome_records_assessment_date ON outcome_records(assessment_date);
CREATE INDEX idx_outcome_records_assessment_type ON outcome_records(assessment_type);
CREATE INDEX idx_outcome_records_status ON outcome_records(status);
CREATE INDEX idx_outcome_records_created_at ON outcome_records(created_at);

-- Add comments
COMMENT ON TABLE outcome_frameworks IS 'Defines outcome measurement frameworks with dimensions and metrics for assessing student progress';
COMMENT ON TABLE outcome_records IS 'Stores individual outcome assessments for students against specific frameworks';

COMMENT ON COLUMN outcome_frameworks.dimensions IS 'Array of dimension definitions (e.g., ["confidence", "resilience", "engagement"])';
COMMENT ON COLUMN outcome_frameworks.metrics IS 'Array of metric definitions with scoring details per dimension';
COMMENT ON COLUMN outcome_frameworks.scoring_method IS 'Method used for scoring outcomes: RUBRIC (1-5 scale), LIKERT (agree/disagree), BINARY (yes/no), NUMERIC (raw score)';

COMMENT ON COLUMN outcome_records.scores IS 'JSON object mapping dimension/metric IDs to assessment scores';
COMMENT ON COLUMN outcome_records.assessment_type IS 'Type of assessment: BASELINE (pre-programme), MIDLINE, ENDLINE (post-programme), FOLLOW_UP (long-term), AD_HOC';
COMMENT ON COLUMN outcome_records.status IS 'Workflow status of the outcome record';
COMMENT ON COLUMN outcome_records.evidence_url IS 'URL to supporting evidence (e.g., uploaded file, external link)';