-- 0002_tenant_infrastructure_down.sql
-- Rollback Phase 2 tenant infrastructure

-- Remove tenant_id from users first (foreign key dependency)
ALTER TABLE users DROP COLUMN IF EXISTS tenant_id;

-- Drop tenant_feature_flags (references tenants)
DROP TABLE IF EXISTS tenant_feature_flags;

-- Drop tenants
DROP TABLE IF EXISTS tenants;
