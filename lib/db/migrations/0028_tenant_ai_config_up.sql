-- Phase 10: tenant_ai_config — per-tenant BYOK AI configuration
CREATE TABLE IF NOT EXISTS tenant_ai_config (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL UNIQUE REFERENCES tenants(id),
  provider TEXT NOT NULL,
  encrypted_api_key TEXT NOT NULL,
  model TEXT NOT NULL,
  monthly_budget_usd REAL NOT NULL DEFAULT 10,
  usage_this_month REAL NOT NULL DEFAULT 0,
  usage_reset_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  email_composer_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  contact_summary_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  lead_score_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  next_best_action_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  nav_helper_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
