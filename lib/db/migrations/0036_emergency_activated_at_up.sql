-- Add emergency_activated_at column to users table.
-- This column was defined in the Drizzle schema (users.ts) alongside is_emergency_account
-- but was never included in migration 0023_emergency_account_up.sql.
ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_activated_at TIMESTAMPTZ NULL;
