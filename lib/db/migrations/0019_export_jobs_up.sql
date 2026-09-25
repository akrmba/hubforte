-- Create export status enum
DO $$ BEGIN
  CREATE TYPE export_status AS ENUM ('PENDING', 'PROCESSING', 'COMPLETE', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Create export_jobs table
CREATE TABLE IF NOT EXISTS export_jobs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  export_type TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'zip',
  status export_status NOT NULL DEFAULT 'PENDING',
  total_rows INTEGER DEFAULT 0,
  file_size INTEGER,
  download_token TEXT,
  expires_at TIMESTAMP,
  error TEXT,
  created_by TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE INDEX idx_export_jobs_tenant ON export_jobs(tenant_id);
CREATE INDEX idx_export_jobs_status ON export_jobs(status);
CREATE INDEX idx_export_jobs_created ON export_jobs(created_at DESC);
CREATE INDEX idx_export_jobs_token ON export_jobs(download_token);
