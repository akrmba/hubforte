CREATE TABLE IF NOT EXISTS report_schedules (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  saved_report_id TEXT NOT NULL REFERENCES saved_reports(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES users(id),
  frequency TEXT NOT NULL, -- daily | weekly | monthly
  recipient_user_ids JSONB NOT NULL DEFAULT '[]',
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS report_schedules_tenant_idx ON report_schedules (tenant_id);
CREATE INDEX IF NOT EXISTS report_schedules_next_run_idx ON report_schedules (next_run_at) WHERE enabled = TRUE;
