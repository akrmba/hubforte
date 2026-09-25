-- Reverses 0036_emergency_activated_at_up.sql
ALTER TABLE users DROP COLUMN IF EXISTS emergency_activated_at;
