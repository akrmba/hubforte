-- ============================================================================
-- Migration 0014: LMS New Tables
-- UP migration — creates all 15 new LMS tables (13 domain + 2 operational)
-- Depends on: 0013 (column extensions must be applied first)
-- ============================================================================

BEGIN;

-- Table 1: lms_access_tokens
-- Must be created before tables that reference it (talent_scores, surveys, etc.)
CREATE TABLE IF NOT EXISTS lms_access_tokens (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  token_hash TEXT NOT NULL UNIQUE,
  token_type TEXT NOT NULL CHECK (token_type IN ('teacher_feedback', 'student_survey', 'parent_survey', 'student_report')),
  scope_type TEXT NOT NULL CHECK (scope_type IN ('student', 'organisation')),
  scope_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  use_count INTEGER NOT NULL DEFAULT 0,
  max_uses INTEGER NOT NULL DEFAULT 5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lms_access_tokens_tenant ON lms_access_tokens(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lms_access_tokens_token_hash ON lms_access_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_lms_access_tokens_scope ON lms_access_tokens(scope_type, scope_id);
CREATE INDEX IF NOT EXISTS idx_lms_access_tokens_expires ON lms_access_tokens(expires_at);

-- Table 2: lms_talent_scores
CREATE TABLE IF NOT EXISTS lms_talent_scores (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  student_id TEXT NOT NULL REFERENCES students(id),
  rater_type TEXT NOT NULL CHECK (rater_type IN ('student', 'coach', 'teacher')),
  time_point TEXT NOT NULL CHECK (time_point IN ('pre', 'end', 'forward_to_future')),
  confidence INTEGER CHECK (confidence >= 0 AND confidence <= 4),
  resilience INTEGER CHECK (resilience >= 0 AND resilience <= 4),
  communication INTEGER CHECK (communication >= 0 AND communication <= 4),
  self_awareness INTEGER CHECK (self_awareness >= 0 AND self_awareness <= 4),
  submitted_by TEXT REFERENCES users(id),
  submitted_via_token TEXT REFERENCES lms_access_tokens(id),
  is_complete BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, rater_type, time_point)
);
CREATE INDEX IF NOT EXISTS idx_lms_talent_scores_tenant ON lms_talent_scores(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lms_talent_scores_student ON lms_talent_scores(student_id);

-- Table 3: lms_chosen_talents
CREATE TABLE IF NOT EXISTS lms_chosen_talents (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  student_id TEXT NOT NULL UNIQUE REFERENCES students(id),
  confidence BOOLEAN NOT NULL DEFAULT true,
  resilience BOOLEAN NOT NULL DEFAULT true,
  communication BOOLEAN NOT NULL DEFAULT true,
  self_awareness BOOLEAN NOT NULL DEFAULT true,
  set_by TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lms_chosen_talents_tenant ON lms_chosen_talents(tenant_id);

-- Table 4: lms_coach_narratives
CREATE TABLE IF NOT EXISTS lms_coach_narratives (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  student_id TEXT NOT NULL UNIQUE REFERENCES students(id),
  overall_engagement TEXT CHECK (overall_engagement IN ('exceptional', 'strong', 'good', 'developing', 'limited')),
  attendance_comment TEXT,
  itw_reflection TEXT,
  wow_reflection TEXT,
  talent_progress_summary TEXT,
  overall_progress_summary TEXT,
  next_steps TEXT,
  submitted_by TEXT NOT NULL REFERENCES users(id),
  is_complete BOOLEAN NOT NULL DEFAULT false,
  last_saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lms_coach_narratives_tenant ON lms_coach_narratives(tenant_id);

-- Table 5: lms_teacher_feedback
CREATE TABLE IF NOT EXISTS lms_teacher_feedback (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  student_id TEXT NOT NULL UNIQUE REFERENCES students(id),
  aspiration_change BOOLEAN,
  attendance_change BOOLEAN,
  behaviour_change BOOLEAN,
  academic_progress_change BOOLEAN,
  free_text_reflection TEXT,
  submitted_via_token TEXT REFERENCES lms_access_tokens(id),
  is_complete BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lms_teacher_feedback_tenant ON lms_teacher_feedback(tenant_id);

-- Table 6: lms_student_surveys
CREATE TABLE IF NOT EXISTS lms_student_surveys (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  student_id TEXT NOT NULL REFERENCES students(id),
  time_point TEXT NOT NULL CHECK (time_point IN ('pre', 'end', 'forward_to_future')),
  enjoyed_programme TEXT,
  prepared_future TEXT,
  motivated_school TEXT,
  shown_skills TEXT,
  better_future_ideas TEXT,
  positive_difference TEXT,
  three_words TEXT,
  favourite_thing TEXT,
  why_favourite TEXT,
  change_one_thing TEXT,
  other_comments TEXT,
  submission_channel TEXT NOT NULL CHECK (submission_channel IN ('coach_handover', 'qr_code', 'url_code', 'email_link', 'sms_link')),
  submitted_via_token TEXT REFERENCES lms_access_tokens(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, time_point)
);
CREATE INDEX IF NOT EXISTS idx_lms_student_surveys_tenant ON lms_student_surveys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lms_student_surveys_student ON lms_student_surveys(student_id);

-- Table 7: lms_parent_surveys
CREATE TABLE IF NOT EXISTS lms_parent_surveys (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  student_id TEXT NOT NULL UNIQUE REFERENCES students(id),
  positive_difference_child TEXT,
  child_more_prepared TEXT,
  child_more_motivated TEXT,
  biggest_changes TEXT,
  submission_channel TEXT NOT NULL CHECK (submission_channel IN ('coach_handover', 'qr_code', 'url_code', 'email_link', 'sms_link')),
  submitted_via_token TEXT REFERENCES lms_access_tokens(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lms_parent_surveys_tenant ON lms_parent_surveys(tenant_id);

-- Table 8: lms_ai_summaries
-- student_id nullable for cohort-level summaries; cohort_id nullable for per-student summaries
CREATE TABLE IF NOT EXISTS lms_ai_summaries (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  student_id TEXT REFERENCES students(id),
  cohort_id TEXT REFERENCES programme_cohorts(id),
  summary_type TEXT NOT NULL CHECK (summary_type IN ('student_voice_per_student', 'teacher_reflection_per_student', 'cohort_student_voice', 'cohort_coach_summary', 'cohort_teacher_summary')),
  generated_text TEXT,
  edited_text TEXT,
  was_edited BOOLEAN NOT NULL DEFAULT false,
  is_manual BOOLEAN NOT NULL DEFAULT false,
  ai_provider TEXT,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  failed BOOLEAN NOT NULL DEFAULT false,
  failure_reason TEXT,
  edited_by TEXT REFERENCES users(id),
  edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lms_ai_summaries_tenant ON lms_ai_summaries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lms_ai_summaries_student ON lms_ai_summaries(student_id);
CREATE INDEX IF NOT EXISTS idx_lms_ai_summaries_cohort ON lms_ai_summaries(cohort_id);

-- Table 9: lms_impact_snapshots
CREATE TABLE IF NOT EXISTS lms_impact_snapshots (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  cohort_id TEXT NOT NULL REFERENCES programme_cohorts(id),
  snapshot_version INTEGER NOT NULL,
  calculated_by TEXT NOT NULL REFERENCES users(id),
  results_json JSONB NOT NULL DEFAULT '{}',
  weights_json JSONB NOT NULL DEFAULT '{}',
  is_latest BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lms_impact_snapshots_tenant ON lms_impact_snapshots(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lms_impact_snapshots_cohort ON lms_impact_snapshots(cohort_id);
CREATE INDEX IF NOT EXISTS idx_lms_impact_snapshots_latest ON lms_impact_snapshots(cohort_id, is_latest);

-- Table 10: lms_reports
-- student_id nullable: null for school report rows, set for student personal report rows
CREATE TABLE IF NOT EXISTS lms_reports (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  cohort_id TEXT NOT NULL REFERENCES programme_cohorts(id),
  student_id TEXT REFERENCES students(id),
  report_type TEXT NOT NULL CHECK (report_type IN ('school_ofsted', 'student_personal', 'internal_summary', 'forward_to_future')),
  snapshot_id TEXT NOT NULL REFERENCES lms_impact_snapshots(id),
  status TEXT NOT NULL DEFAULT 'generating' CHECK (status IN ('generating', 'ready', 'sent', 'archived')),
  file_reference TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  generated_by TEXT NOT NULL REFERENCES users(id),
  locked_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lms_reports_tenant ON lms_reports(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lms_reports_cohort ON lms_reports(cohort_id);
CREATE INDEX IF NOT EXISTS idx_lms_reports_student ON lms_reports(student_id);
CREATE INDEX IF NOT EXISTS idx_lms_reports_status ON lms_reports(status);

-- Table 11: lms_public_sessions (server-side session storage for token exchange)
CREATE TABLE IF NOT EXISTS lms_public_sessions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  token_id TEXT NOT NULL REFERENCES lms_access_tokens(id),
  token_type TEXT NOT NULL CHECK (token_type IN ('teacher_feedback', 'student_survey', 'parent_survey', 'student_report')),
  scope_type TEXT NOT NULL CHECK (scope_type IN ('student', 'organisation')),
  scope_id TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lms_public_sessions_tenant ON lms_public_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lms_public_sessions_expires ON lms_public_sessions(expires_at);

-- Table 12: ops_ai_reports (AI operations status reports)
CREATE TABLE IF NOT EXISTS ops_ai_reports (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  report_text TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('ok', 'warning', 'critical')),
  trigger TEXT NOT NULL CHECK (trigger IN ('scheduled', 'alarm')),
  input_snapshot JSONB,
  ai_provider TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ops_ai_reports_tenant ON ops_ai_reports(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ops_ai_reports_severity ON ops_ai_reports(severity);
CREATE INDEX IF NOT EXISTS idx_ops_ai_reports_created ON ops_ai_reports(created_at);

-- Table 13: lms_trip_data
-- PM-entered content for the Trips & Experiences section of the school report
CREATE TABLE IF NOT EXISTS lms_trip_data (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  cohort_id TEXT NOT NULL REFERENCES programme_cohorts(id),
  trip_type TEXT NOT NULL CHECK (trip_type IN ('itw', 'wow')),
  venue_name TEXT,
  activity_highlights JSONB, -- array of 2-3 bullet strings
  featured_student_quote TEXT,
  featured_coach_quote TEXT,
  entered_by TEXT NOT NULL REFERENCES users(id),
  entered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_complete BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (cohort_id, trip_type)
);
CREATE INDEX IF NOT EXISTS idx_lms_trip_data_tenant ON lms_trip_data(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lms_trip_data_cohort ON lms_trip_data(cohort_id);

-- Table 14: lms_cohort_narratives
-- PM-entered narrative fields for executive summary, conclusion, and future opportunities sections
CREATE TABLE IF NOT EXISTS lms_cohort_narratives (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  cohort_id TEXT NOT NULL UNIQUE REFERENCES programme_cohorts(id),
  programme_strengths TEXT,
  programme_challenges TEXT,
  overall_assessment TEXT,
  conclusion_narrative TEXT,
  featured_student_quote TEXT,
  entered_by TEXT NOT NULL REFERENCES users(id),
  last_saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lms_cohort_narratives_tenant ON lms_cohort_narratives(tenant_id);

-- Table 15: lms_forward_to_future
-- Post-programme follow-up. Field set pending from Yes Futures; payload stored in JSONB for flexibility.
-- UNIQUE on (student_id, cohort_id) — one FtF record per student per original cohort.
CREATE TABLE IF NOT EXISTS lms_forward_to_future (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  cohort_id TEXT NOT NULL REFERENCES programme_cohorts(id),
  student_id TEXT NOT NULL REFERENCES students(id),
  programme_type TEXT NOT NULL CHECK (programme_type IN ('rising_futures', 'finding_futures', 'launching_futures')),
  session_date DATE,
  responses_json JSONB NOT NULL DEFAULT '{}',
  entered_by TEXT NOT NULL REFERENCES users(id),
  entered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, cohort_id)
);
CREATE INDEX IF NOT EXISTS idx_lms_forward_to_future_tenant ON lms_forward_to_future(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lms_forward_to_future_cohort ON lms_forward_to_future(cohort_id);
CREATE INDEX IF NOT EXISTS idx_lms_forward_to_future_student ON lms_forward_to_future(student_id);

COMMIT;
