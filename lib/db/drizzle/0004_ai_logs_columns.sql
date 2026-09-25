-- Migration: Add provider and model columns to ai_logs table
-- These columns track which AI provider and model was used for each interaction.

-- UP MIGRATION
-- ============

ALTER TABLE "ai_logs" ADD COLUMN IF NOT EXISTS "provider" text;
ALTER TABLE "ai_logs" ADD COLUMN IF NOT EXISTS "model" text;
