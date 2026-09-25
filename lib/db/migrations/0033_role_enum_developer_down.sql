-- Phase 12: Remove DEVELOPER and PLATFORM_BUILDER from the role enum — rollback.
-- PostgreSQL does not support DROP VALUE from an enum directly.
-- To roll back: recreate the enum without those values and migrate the column.
-- This migration is a no-op placeholder; manual rollback required if needed.
SELECT 1;
