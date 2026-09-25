-- Migration: Create attachments table
-- This table supports polymorphic file attachments for any entity in the system

-- Create enum types
CREATE TYPE storage_provider AS ENUM ('LOCAL', 'S3', 'AZURE_BLOB', 'GOOGLE_CLOUD_STORAGE');
CREATE TYPE attachment_category AS ENUM ('DOCUMENT', 'IMAGE', 'AUDIO', 'VIDEO', 'ARCHIVE', 'OTHER');

-- Create attachments table
CREATE TABLE attachments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  storage_path TEXT NOT NULL,
  storage_provider storage_provider NOT NULL DEFAULT 'LOCAL',
  category attachment_category NOT NULL DEFAULT 'DOCUMENT',
  description TEXT,
  uploaded_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  access_control JSONB NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for polymorphic queries
CREATE INDEX idx_attachments_tenant_id ON attachments(tenant_id);
CREATE INDEX idx_attachments_entity_type ON attachments(entity_type);
CREATE INDEX idx_attachments_entity_id ON attachments(entity_id);
CREATE INDEX idx_attachments_entity_type_id ON attachments(entity_type, entity_id);
CREATE INDEX idx_attachments_uploaded_by_user_id ON attachments(uploaded_by_user_id);
CREATE INDEX idx_attachments_uploaded_at ON attachments(uploaded_at DESC);
CREATE INDEX idx_attachments_category ON attachments(category);
CREATE INDEX idx_attachments_file_type ON attachments(file_type);
CREATE INDEX idx_attachments_is_public ON attachments(is_public) WHERE is_public = TRUE;
CREATE INDEX idx_attachments_storage_provider ON attachments(storage_provider);

-- Add composite index for common query pattern: tenant + entity
CREATE INDEX idx_attachments_tenant_entity ON attachments(tenant_id, entity_type, entity_id);

-- Add comments
COMMENT ON TABLE attachments IS 'Polymorphic file attachments that can link to any entity in the system';

COMMENT ON COLUMN attachments.entity_type IS 'Type of entity this attachment belongs to (e.g., "students", "programmes", "consent_records")';
COMMENT ON COLUMN attachments.entity_id IS 'ID of the entity this attachment belongs to';
COMMENT ON COLUMN attachments.file_type IS 'MIME type or file extension (e.g., "image/jpeg", "application/pdf", ".docx")';
COMMENT ON COLUMN attachments.file_size IS 'File size in bytes';
COMMENT ON COLUMN attachments.storage_path IS 'Path to the file in the storage system (S3 key, local file path, etc.)';
COMMENT ON COLUMN attachments.storage_provider IS 'Storage provider where the file is stored';
COMMENT ON COLUMN attachments.access_control IS 'JSON object defining fine-grained access control rules (roles, permissions, expiry)';
COMMENT ON COLUMN attachments.is_public IS 'Whether the file is publicly accessible (true) or requires authentication (false)';