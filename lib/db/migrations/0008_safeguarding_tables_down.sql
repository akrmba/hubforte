-- Migration: Drop safeguarding_notes and safeguarding_access_log tables

DROP TABLE IF EXISTS safeguarding_access_log;
DROP TABLE IF EXISTS safeguarding_notes;

DROP TYPE IF EXISTS access_type;
DROP TYPE IF EXISTS confidentiality_level;
DROP TYPE IF EXISTS safeguarding_status;
DROP TYPE IF EXISTS severity_level;
DROP TYPE IF EXISTS safeguarding_category;