-- Reverse of 0030_tenant_owner_flags_up.sql
ALTER TABLE tenants
  DROP COLUMN IF EXISTS byok_enabled,
  DROP COLUMN IF EXISTS ai_diagnosis_enabled;
