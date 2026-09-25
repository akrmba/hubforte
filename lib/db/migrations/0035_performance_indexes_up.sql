-- Index for login: every auth lookup scans users by email
CREATE INDEX IF NOT EXISTS idx_users_email
  ON users(email);

-- Index for import duplicate detection: every imported row checks by email
CREATE INDEX IF NOT EXISTS idx_contacts_email
  ON contacts(email)
  WHERE email IS NOT NULL;

-- Index for contacts list filtering by status
CREATE INDEX IF NOT EXISTS idx_contacts_status
  ON contacts(tenant_id, status);

-- Index for contacts list filtering/sorting by created_at
CREATE INDEX IF NOT EXISTS idx_contacts_created_at
  ON contacts(tenant_id, created_at DESC);

-- Bonus: organizations by name (used in import org lookup and search)
CREATE INDEX IF NOT EXISTS idx_organizations_name
  ON organizations(tenant_id, name);
