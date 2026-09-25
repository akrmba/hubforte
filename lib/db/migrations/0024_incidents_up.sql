CREATE TABLE IF NOT EXISTS incidents (
  id TEXT PRIMARY KEY,
  severity TEXT NOT NULL,
  condition TEXT NOT NULL,
  message TEXT NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  notifications_sent JSONB NOT NULL DEFAULT '[]',
  tenant_ids_affected JSONB NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS incidents_severity_idx ON incidents (severity);
CREATE INDEX IF NOT EXISTS incidents_detected_at_idx ON incidents (detected_at);
CREATE INDEX IF NOT EXISTS incidents_resolved_at_idx ON incidents (resolved_at);
