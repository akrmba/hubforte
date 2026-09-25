-- Migration: Create tenant_field_visibility table
-- This table controls field-level visibility, requirements, and permissions per tenant

CREATE TABLE tenant_field_visibility (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  field_path TEXT NOT NULL,
  visible BOOLEAN NOT NULL DEFAULT TRUE,
  required BOOLEAN NOT NULL DEFAULT FALSE,
  label_override TEXT,
  help_text TEXT,
  validation_rules JSONB,
  display_order TEXT,
  visible_to_roles JSONB,
  editable_by_roles JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT,
  
  -- Ensure unique constraint per tenant, entity, and field
  CONSTRAINT tenant_entity_field_unique UNIQUE (tenant_id, entity_type, field_path)
);

-- Create index for faster tenant-specific lookups
CREATE INDEX idx_tenant_field_visibility_tenant_entity ON tenant_field_visibility(tenant_id, entity_type);
CREATE INDEX idx_tenant_field_visibility_field_path ON tenant_field_visibility(field_path);

-- Add comment explaining the table's purpose
COMMENT ON TABLE tenant_field_visibility IS 'Controls field-level visibility, requirements, labels, and permissions for each tenant. Enables tenant-specific customization of entity fields.';

COMMENT ON COLUMN tenant_field_visibility.entity_type IS 'The entity type (table name) this field belongs to, e.g., "organizations", "contacts", "students"';
COMMENT ON COLUMN tenant_field_visibility.field_path IS 'Dot notation path to the field, e.g., "name", "email", "address.street"';
COMMENT ON COLUMN tenant_field_visibility.visible IS 'Whether this field is visible to users of this tenant';
COMMENT ON COLUMN tenant_field_visibility.required IS 'Whether this field is required for this tenant';
COMMENT ON COLUMN tenant_field_visibility.label_override IS 'Custom label override for this tenant';
COMMENT ON COLUMN tenant_field_visibility.help_text IS 'Tenant-specific help text for this field';
COMMENT ON COLUMN tenant_field_visibility.validation_rules IS 'JSON schema validation rules specific to this tenant';
COMMENT ON COLUMN tenant_field_visibility.display_order IS 'Controls ordering of fields in forms for this tenant';
COMMENT ON COLUMN tenant_field_visibility.visible_to_roles IS 'Array of role names that can see this field (NULL = all roles)';
COMMENT ON COLUMN tenant_field_visibility.editable_by_roles IS 'Array of role names that can edit this field (NULL = all roles that can see it)';