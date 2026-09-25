-- DOWN MIGRATION: Drop audit_logs table
-- Reverse of 0002_audit_logs.sql

DROP INDEX IF EXISTS "audit_logs_created_at_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "audit_logs_entity_type_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "audit_logs_user_id_idx";--> statement-breakpoint
DROP TABLE IF EXISTS "audit_logs";
