-- Reverses 0016b_audit_logs_up.sql
DROP INDEX IF EXISTS idx_audit_logs_created;
DROP INDEX IF EXISTS idx_audit_logs_entity;
DROP INDEX IF EXISTS idx_audit_logs_user;
DROP INDEX IF EXISTS idx_audit_logs_tenant;

DROP TABLE IF EXISTS audit_logs;
