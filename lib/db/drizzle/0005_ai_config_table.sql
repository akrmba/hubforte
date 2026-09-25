-- Add ai_config table for persisting AI provider/model defaults
CREATE TABLE IF NOT EXISTS ai_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

-- Seed with sensible defaults
INSERT INTO ai_config (key, value) VALUES
  ('default_provider', 'openai'),
  ('default_model', 'gpt-4o-mini')
ON CONFLICT (key) DO NOTHING;
