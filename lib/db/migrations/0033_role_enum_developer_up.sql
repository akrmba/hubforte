-- Phase 12: Add DEVELOPER and PLATFORM_BUILDER to the role enum.
-- These are system-level roles that cannot access tenant CRM data.
ALTER TYPE role ADD VALUE IF NOT EXISTS 'DEVELOPER';
ALTER TYPE role ADD VALUE IF NOT EXISTS 'PLATFORM_BUILDER';
