-- ============================================================================
-- Migration 0013: LMS Column Extensions
-- UP migration — adds LMS-specific columns to existing CRM tables
-- All new columns are nullable for zero-downtime deployment
-- Does NOT create new tables (see 0014)
-- ============================================================================

BEGIN;

-- programme_cohorts: LMS lifecycle and PM assignment
ALTER TABLE programme_cohorts
  ADD COLUMN IF NOT EXISTS programme_type TEXT,
  ADD COLUMN IF NOT EXISTS programme_manager_id TEXT REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS lead_teacher_name TEXT,
  ADD COLUMN IF NOT EXISTS min_attendance_sessions INTEGER DEFAULT 6,
  ADD COLUMN IF NOT EXISTS lms_lifecycle_status TEXT;

-- students: coach assignment, care experience, survey access code, withdrawal tracking
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS coach_id TEXT REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS care_experienced_flag BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS personal_access_code TEXT,
  ADD COLUMN IF NOT EXISTS withdrawn_at_session TEXT;

-- Tenant-scoped uniqueness for personal_access_code (not global)
ALTER TABLE students
  ADD CONSTRAINT uq_students_tenant_personal_access_code UNIQUE (tenant_id, personal_access_code);

-- programme_sessions: semantic session type for business logic
ALTER TABLE programme_sessions
  ADD COLUMN IF NOT EXISTS session_type TEXT;

-- Indexes for commonly queried LMS columns
CREATE INDEX IF NOT EXISTS idx_programme_cohorts_programme_manager ON programme_cohorts(programme_manager_id);
CREATE INDEX IF NOT EXISTS idx_programme_cohorts_lms_lifecycle ON programme_cohorts(lms_lifecycle_status);
CREATE INDEX IF NOT EXISTS idx_students_coach_id ON students(coach_id);
CREATE INDEX IF NOT EXISTS idx_students_personal_access_code ON students(tenant_id, personal_access_code);
CREATE INDEX IF NOT EXISTS idx_programme_sessions_session_type ON programme_sessions(session_type);

COMMIT;
