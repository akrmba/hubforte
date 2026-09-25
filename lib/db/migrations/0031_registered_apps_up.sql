-- Phase 11: Standalone App Framework
-- Creates registered_apps table for external app API key authentication.
CREATE TABLE IF NOT EXISTS registered_apps (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  app_name TEXT NOT NULL,
  app_slug TEXT NOT NULL,
  app_url TEXT,
  webhook_url TEXT,
  api_key TEXT NOT NULL,
  webhook_secret TEXT NOT NULL,
  scopes JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active',
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS registered_apps_api_key_idx ON registered_apps(api_key);
CREATE INDEX IF NOT EXISTS registered_apps_tenant_idx ON registered_apps(tenant_id);
