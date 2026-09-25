-- DOWN MIGRATION: Remove provider and model columns from ai_logs
-- Reverse of 0004_ai_logs_columns.sql

ALTER TABLE "ai_logs" DROP COLUMN IF EXISTS "provider";
ALTER TABLE "ai_logs" DROP COLUMN IF EXISTS "model";
