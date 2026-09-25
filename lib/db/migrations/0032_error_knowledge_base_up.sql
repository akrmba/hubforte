-- Phase 12: Error Knowledge Base
-- Stores deduplicated error patterns with AI explanations and developer share tokens.
CREATE TABLE IF NOT EXISTS error_knowledge_base (
  id TEXT PRIMARY KEY,
  error_log_id TEXT,
  error_pattern TEXT NOT NULL,
  plain_english TEXT,
  fix_steps TEXT,
  status TEXT NOT NULL DEFAULT 'needs_investigation',
  module TEXT,
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fixed_in_version TEXT,
  auto_fixed TEXT DEFAULT 'no',
  share_token TEXT,
  share_token_created_at TIMESTAMPTZ,
  shared_with_user_id TEXT,
  marked_fixed_at TIMESTAMPTZ,
  marked_fixed_by TEXT,
  owner_notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ekb_share_token_idx ON error_knowledge_base(share_token) WHERE share_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS ekb_status_idx ON error_knowledge_base(status);
