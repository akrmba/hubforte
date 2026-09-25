-- ============================================================================
-- Migration 0013: LMS Column Extensions
-- DOWN migration — removes LMS columns from existing CRM tables
-- ============================================================================

BEGIN;

DROP INDEX IF EXISTS idx_programme_sessions_session_type;
DROP INDEX IF EXISTS idx_students_personal_access_code;
DROP INDEX IF EXISTS idx_students_coach_id;
DROP INDEX IF EXISTS idx_programme_cohorts_lms_lifecycle;
DROP INDEX IF EXISTS idx_programme_cohorts_programme_manager;

ALTER TABLE students
  DROP CONSTRAINT IF EXISTS uq_students_tenant_personal_access_code;

ALTER TABLE programme_sessions
  DROP COLUMN IF EXISTS session_type;

ALTER TABLE students
  DROP COLUMN IF EXISTS withdrawn_at_session,
  DROP COLUMN IF EXISTS personal_access_code,
  DROP COLUMN IF EXISTS care_experienced_flag,
  DROP COLUMN IF EXISTS coach_id;

ALTER TABLE programme_cohorts
  DROP COLUMN IF EXISTS lms_lifecycle_status,
  DROP COLUMN IF EXISTS min_attendance_sessions,
  DROP COLUMN IF EXISTS lead_teacher_name,
  DROP COLUMN IF EXISTS programme_manager_id,
  DROP COLUMN IF EXISTS programme_type;

COMMIT;
