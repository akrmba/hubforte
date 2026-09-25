-- Reverses 0006b_programme_cohorts_sessions_up.sql
DROP TABLE IF EXISTS session_attendance;
DROP TABLE IF EXISTS programme_sessions;
DROP TABLE IF EXISTS programme_cohorts;

DROP TYPE IF EXISTS attendance_status;
DROP TYPE IF EXISTS delivery_format;
DROP TYPE IF EXISTS session_status;
DROP TYPE IF EXISTS cohort_status;
