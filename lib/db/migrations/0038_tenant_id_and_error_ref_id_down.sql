-- Down migration for 0038
ALTER TABLE request_logs DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE error_logs   DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE error_logs   DROP COLUMN IF EXISTS error_ref_id;
