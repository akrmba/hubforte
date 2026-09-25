-- Add owner-controlled flags to tenants table.
-- byok_enabled: PLATFORM_OWNER must explicitly enable BYOK for a tenant (default OFF).
-- ai_diagnosis_enabled: PLATFORM_OWNER must explicitly enable AI ticket diagnosis for a tenant (default OFF).
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS byok_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_diagnosis_enabled boolean NOT NULL DEFAULT false;
