-- ============================================================================
-- Migration 0014: LMS New Tables
-- DOWN migration — drops all 15 new LMS tables
-- Drop in reverse dependency order
-- ============================================================================

BEGIN;

-- Drop tables that reference lms_access_tokens first
DROP TABLE IF EXISTS lms_forward_to_future;
DROP TABLE IF EXISTS lms_public_sessions;
DROP TABLE IF EXISTS lms_student_surveys;
DROP TABLE IF EXISTS lms_parent_surveys;
DROP TABLE IF EXISTS lms_teacher_feedback;
DROP TABLE IF EXISTS lms_talent_scores;

-- Drop cohort-level tables
DROP TABLE IF EXISTS lms_trip_data;
DROP TABLE IF EXISTS lms_cohort_narratives;

-- Drop tables that reference lms_impact_snapshots
DROP TABLE IF EXISTS lms_reports;

-- Drop remaining LMS tables
DROP TABLE IF EXISTS lms_impact_snapshots;
DROP TABLE IF EXISTS lms_ai_summaries;
DROP TABLE IF EXISTS lms_coach_narratives;
DROP TABLE IF EXISTS lms_chosen_talents;

-- Drop lms_access_tokens last (referenced by others)
DROP TABLE IF EXISTS lms_access_tokens;

-- Drop ops table
DROP TABLE IF EXISTS ops_ai_reports;

COMMIT;
