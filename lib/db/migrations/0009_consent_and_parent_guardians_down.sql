-- Migration: Drop consent_records and parent_guardians tables

DROP TABLE IF EXISTS consent_records;
DROP TABLE IF EXISTS parent_guardians;

DROP TYPE IF EXISTS contact_method;
DROP TYPE IF EXISTS relationship_type;
DROP TYPE IF EXISTS obtained_method;
DROP TYPE IF EXISTS consent_status;
DROP TYPE IF EXISTS consent_scope;
DROP TYPE IF EXISTS consent_type;