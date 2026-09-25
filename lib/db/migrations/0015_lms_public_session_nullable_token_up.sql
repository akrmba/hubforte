-- 0015_lms_public_session_nullable_token_up.sql
-- Allow lms_public_sessions.token_id to be NULL so personal-access-code sessions
-- (which have no backing lms_access_tokens row) can be stored.

ALTER TABLE lms_public_sessions
  ALTER COLUMN token_id DROP NOT NULL;
