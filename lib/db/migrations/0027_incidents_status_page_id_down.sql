-- Phase 9C: Rollback status_page_incident_id column
ALTER TABLE incidents DROP COLUMN IF EXISTS status_page_incident_id;
