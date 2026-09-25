-- Phase 9C: Add status_page_incident_id to incidents table
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS status_page_incident_id TEXT;
