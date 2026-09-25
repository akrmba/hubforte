-- Migration: Drop attachments table

DROP TABLE IF EXISTS attachments;

DROP TYPE IF EXISTS attachment_category;
DROP TYPE IF EXISTS storage_provider;