-- Migration: Create record_type_configs table
-- This table configures record types (categories/subtypes) for entities per tenant

CREATE TABLE record_type_configs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  record_type TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  color TEXT,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  allowed_transitions JSONB,
  validation_rules JSONB,
  workflow_rules JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT,
  
  -- Ensure unique constraint per tenant, entity, and record type
  CONSTRAINT tenant_entity_type_unique UNIQUE (tenant_id, entity_type, record_type)
);

-- Create indexes for common query patterns
CREATE INDEX idx_record_type_configs_tenant_entity ON record_type_configs(tenant_id, entity_type);
CREATE INDEX idx_record_type_configs_entity_type ON record_type_configs(entity_type);
CREATE INDEX idx_record_type_configs_is_active ON record_type_configs(is_active);
CREATE INDEX idx_record_type_configs_sort_order ON record_type_configs(sort_order);

-- Add comment explaining the table's purpose
COMMENT ON TABLE record_type_configs IS 'Configures record types (categories/subtypes) for entities on a per-tenant basis. Enables tenant-specific categorization and workflow configuration.';

COMMENT ON COLUMN record_type_configs.entity_type IS 'The entity type this record type belongs to, e.g., "organizations", "contacts"';
COMMENT ON COLUMN record_type_configs.record_type IS 'Internal identifier for the record type, e.g., "school", "college", "business", "parent", "guardian"';
COMMENT ON COLUMN record_type_configs.display_name IS 'User-friendly display name for this record type';
COMMENT ON COLUMN record_type_configs.is_default IS 'Whether this is the default type for new records of this entity';
COMMENT ON COLUMN record_type_configs.is_active IS 'Whether this record type is active and available for use';
COMMENT ON COLUMN record_type_configs.sort_order IS 'Controls display ordering in type selection lists';
COMMENT ON COLUMN record_type_configs.allowed_transitions IS 'Array of record_type values this type can transition to (for workflow)';
COMMENT ON COLUMN record_type_configs.validation_rules IS 'Type-specific validation rules (JSON schema)';
COMMENT ON COLUMN record_type_configs.workflow_rules IS 'Type-specific workflow configuration (states, transitions, permissions)';
COMMENT ON COLUMN record_type_configs.metadata IS 'Additional type-specific metadata (key-value pairs)';