DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'organizations'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organizations' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE organizations ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'contacts'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE contacts ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'activities'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'activities' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE activities ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'tasks'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE tasks ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'notes'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notes' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE notes ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'email_templates'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'email_templates' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE email_templates ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'campaigns'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaigns' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE campaigns ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'campaign_contacts'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaign_contacts' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE campaign_contacts ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'outbound_emails'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'outbound_emails' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE outbound_emails ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'gmail_credentials'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'gmail_credentials' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE gmail_credentials ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'volunteers'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'volunteers' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE volunteers ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'funders'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'funders' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE funders ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'funder_contacts'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'funder_contacts' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE funder_contacts ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'opportunities'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'opportunities' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE opportunities ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'opportunity_activities'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'opportunity_activities' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE opportunity_activities ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'support_tickets'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'support_tickets' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE support_tickets ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ticket_updates'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ticket_updates' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE ticket_updates ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ai_ticket_diagnoses'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_ticket_diagnoses' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE ai_ticket_diagnoses ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'remediation_policies'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'remediation_policies' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE remediation_policies ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'remediation_runs'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'remediation_runs' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE remediation_runs ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'notifications'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notifications' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE notifications ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'programmes'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'programmes' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE programmes ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'students'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'students' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE students ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'placements'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'placements' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE placements ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'audit_logs'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_logs' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE audit_logs ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ai_logs'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_logs' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE ai_logs ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'yf_schools'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'yf_schools' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE yf_schools ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'yf_trusts'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'yf_trusts' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE yf_trusts ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'yf_sponsors'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'yf_sponsors' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE yf_sponsors ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'yf_contacts'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'yf_contacts' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE yf_contacts ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'yf_funding_opportunities'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'yf_funding_opportunities' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE yf_funding_opportunities ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'yf_programmes'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'yf_programmes' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE yf_programmes ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'yf_students'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'yf_students' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE yf_students ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'yf_volunteers'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'yf_volunteers' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE yf_volunteers ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'yf_placements'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'yf_placements' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE yf_placements ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'yf_activities'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'yf_activities' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE yf_activities ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
  END IF;
END $$;
