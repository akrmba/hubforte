-- 0015_lms_public_session_nullable_token_down.sql
-- Revert: restore NOT NULL on lms_public_sessions.token_id.
-- WARNING: will fail if any rows have token_id = NULL.

ALTER TABLE lms_public_sessions
  ALTER COLUMN token_id SET NOT NULL;
