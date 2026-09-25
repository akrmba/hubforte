-- Migration 0038: Add tenant_id to request_logs and error_logs, add error_ref_id to error_logs
-- Purpose: Enable tenant-aware incident summaries (founder incident model requires tenant_id on every log row)
--          Separate customer-facing error reference (error_ref_id) from internal correlation (request_id)

ALTER TABLE request_logs
  ADD COLUMN IF NOT EXISTS tenant_id TEXT;

CREATE INDEX IF NOT EXISTS request_logs_tenant_id_idx ON request_logs (tenant_id);

ALTER TABLE error_logs
  ADD COLUMN IF NOT EXISTS tenant_id TEXT,
  ADD COLUMN IF NOT EXISTS error_ref_id TEXT;

CREATE INDEX IF NOT EXISTS error_logs_tenant_id_idx ON error_logs (tenant_id);
CREATE INDEX IF NOT EXISTS error_logs_error_ref_id_idx ON error_logs (error_ref_id);

-- Down migration: 0038_tenant_id_and_error_ref_id_down.sql
