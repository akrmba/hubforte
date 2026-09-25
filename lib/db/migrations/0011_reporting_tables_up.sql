-- Phase 6: Reporting Engine - Report Types, Saved Reports, and Dashboards
-- Migration: 0011_reporting_tables_up.sql

-- Report Types table
CREATE TABLE IF NOT EXISTS report_types (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenants(id),
  entity_type TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  available_fields JSONB NOT NULL DEFAULT '[]',
  available_filters JSONB NOT NULL DEFAULT '[]',
  available_groupings JSONB NOT NULL DEFAULT '[]',
  join_config JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Saved Reports table
CREATE TABLE IF NOT EXISTS saved_reports (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  report_type_id TEXT REFERENCES report_types(id),
  name TEXT NOT NULL,
  columns JSONB NOT NULL DEFAULT '[]',
  filters JSONB NOT NULL DEFAULT '[]',
  groupings JSONB NOT NULL DEFAULT '[]',
  sort_order JSONB NOT NULL DEFAULT '[]',
  chart_type TEXT,
  sharing TEXT NOT NULL DEFAULT 'PRIVATE',
  owner_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Dashboards table
CREATE TABLE IF NOT EXISTS dashboards (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  description TEXT,
  layout JSONB NOT NULL DEFAULT '[]',
  sharing TEXT NOT NULL DEFAULT 'PRIVATE',
  owner_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_report_types_tenant ON report_types(tenant_id);
CREATE INDEX IF NOT EXISTS idx_report_types_entity ON report_types(entity_type);
CREATE INDEX IF NOT EXISTS idx_saved_reports_tenant ON saved_reports(tenant_id);
CREATE INDEX IF NOT EXISTS idx_saved_reports_owner ON saved_reports(owner_id);
CREATE INDEX IF NOT EXISTS idx_saved_reports_sharing ON saved_reports(sharing);
CREATE INDEX IF NOT EXISTS idx_dashboards_tenant ON dashboards(tenant_id);
CREATE INDEX IF NOT EXISTS idx_dashboards_owner ON dashboards(owner_id);
CREATE INDEX IF NOT EXISTS idx_dashboards_sharing ON dashboards(sharing);
