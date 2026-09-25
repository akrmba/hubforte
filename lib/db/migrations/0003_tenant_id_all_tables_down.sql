DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organizations' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE organizations DROP COLUMN tenant_id;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE contacts DROP COLUMN tenant_id;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'activities' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE activities DROP COLUMN tenant_id;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE tasks DROP COLUMN tenant_id;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notes' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE notes DROP COLUMN tenant_id;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'email_templates' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE email_templates DROP COLUMN tenant_id;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaigns' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE campaigns DROP COLUMN tenant_id;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaign_contacts' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE campaign_contacts DROP COLUMN tenant_id;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'outbound_emails' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE outbound_emails DROP COLUMN tenant_id;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'gmail_credentials' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE gmail_credentials DROP COLUMN tenant_id;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'volunteers' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE volunteers DROP COLUMN tenant_id;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'funders' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE funders DROP COLUMN tenant_id;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'funder_contacts' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE funder_contacts DROP COLUMN tenant_id;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'opportunities' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE opportunities DROP COLUMN tenant_id;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'opportunity_activities' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE opportunity_activities DROP COLUMN tenant_id;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'support_tickets' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE support_tickets DROP COLUMN tenant_id;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ticket_updates' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE ticket_updates DROP COLUMN tenant_id;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_ticket_diagnoses' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE ai_ticket_diagnoses DROP COLUMN tenant_id;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'remediation_policies' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE remediation_policies DROP COLUMN tenant_id;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'remediation_runs' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE remediation_runs DROP COLUMN tenant_id;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notifications' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE notifications DROP COLUMN tenant_id;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'programmes' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE programmes DROP COLUMN tenant_id;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'students' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE students DROP COLUMN tenant_id;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'placements' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE placements DROP COLUMN tenant_id;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_logs' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE audit_logs DROP COLUMN tenant_id;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_logs' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE ai_logs DROP COLUMN tenant_id;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'yf_schools' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE yf_schools DROP COLUMN tenant_id;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'yf_trusts' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE yf_trusts DROP COLUMN tenant_id;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'yf_sponsors' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE yf_sponsors DROP COLUMN tenant_id;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'yf_contacts' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE yf_contacts DROP COLUMN tenant_id;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'yf_funding_opportunities' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE yf_funding_opportunities DROP COLUMN tenant_id;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'yf_programmes' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE yf_programmes DROP COLUMN tenant_id;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'yf_students' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE yf_students DROP COLUMN tenant_id;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'yf_volunteers' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE yf_volunteers DROP COLUMN tenant_id;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'yf_placements' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE yf_placements DROP COLUMN tenant_id;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'yf_activities' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE yf_activities DROP COLUMN tenant_id;
  END IF;
END $$;
