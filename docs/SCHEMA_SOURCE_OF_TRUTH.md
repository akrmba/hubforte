# Hubforte — Schema Source of Truth
**Last updated:** 2026-05-02
**Status:** Active — update this file when schema changes

---

## Rules

1. **Never use `drizzle-kit push` in production.** All schema changes must use SQL migration files.
2. **Every schema change = a new SQL migration file** in `lib/db/migrations/`.
3. **Every `_up.sql` must have a matching `_down.sql`** for rollback support.
4. **Migrations are tracked** in the `hubforte_migrations` table — already-applied migrations are skipped on deploy.
5. **Never rename DB role enum values** — they are stored in Postgres and referenced throughout the codebase.

---

## Migration File Naming

```
NNNN_description_up.sql    ← forward migration
NNNN_description_down.sql  ← reverse migration
```

Example: `0038_tenant_id_and_error_ref_id_up.sql` / `0038_tenant_id_and_error_ref_id_down.sql`

---

## Schema Files Location

All Drizzle ORM schema files live in `lib/db/src/schema/`.
One file per table. The `index.ts` re-exports all tables.

---

## Core Tables by Category

### Users & Auth
- `users` — all users across all tenants
- `tenants` — tenant/workspace records
- `sessions` — user sessions
- `password_resets` — password reset tokens
- `user_backup_codes` — 2FA backup codes

### CRM Core
- `contacts` — people (students, parents, staff, volunteers, donors)
- `organizations` — schools, trusts, sponsors, other orgs
- `activities` — meetings, calls, emails, interactions
- `notes` — free-text notes on records
- `tasks` — to-do items assigned to users
- `funding_opportunities` — deals/pipeline

### Engagement
- `campaigns` — outreach campaigns
- `templates` — email templates
- `support` — support tickets + comments
- `notifications` — in-app notifications

### People
- `funders` — funder/donor records
- `volunteers` — volunteer records
- `placements` — volunteer placements
- `students` — LMS student records

### Compliance
- `safeguarding_notes` — HIGHLY SENSITIVE. Encrypted at rest. Excluded from report engine and standard export.
- `safeguarding_access_log` — every access to safeguarding notes is logged
- `consent_records` — consent management
- `parent_guardians` — parent/guardian records
- `outcome_frameworks` — outcome measurement frameworks
- `outcome_records` — individual outcome records

### Feature Flags & Config
- `feature_flags` — global module defaults
- `tenant_feature_flags` — per-tenant module overrides
- `record_type_configs` — configurable record types per tenant
- `tenant_field_visibility` — field-level visibility controls

### Monitoring & Observability
- `request_logs` — every API request (includes `tenant_id`, `user_id`)
- `error_logs` — all errors with deduplication (includes `tenant_id`, `error_ref_id`)
- `audit_logs` — sensitive action audit trail
- `change_events` — entity mutation CDC
- `incidents` — incident records
- `remediation_policies` — auto-remediation policy definitions
- `remediation_runs` — auto-remediation execution log
- `ops_ai_reports` — AI-generated ops reports

### AI
- `ai_config` — AI provider configuration
- `ai_logs` — all AI API calls
- `tenant_ai_config` — per-tenant AI settings (BYOK, budget)

### Integrations
- `webhooks` — outgoing webhook definitions
- `webhook_delivery_log` — webhook delivery attempts
- `integration_configs` — connector credentials (AES-256 encrypted)
- `registered_apps` — standalone app registrations
- `gmail` — Gmail OAuth credentials

### LMS (19 tables)
- `programmes`, `programme_cohorts`, `programme_sessions`, `session_attendance`
- `lms_access_tokens`, `lms_student_surveys`, `lms_parent_surveys`
- `lms_coach_narratives`, `lms_cohort_narratives`, `lms_teacher_feedback`
- `lms_talent_scores`, `lms_chosen_talents`, `lms_impact_snapshots`
- `lms_ai_summaries`, `lms_reports`, `lms_public_sessions`
- `lms_forward_to_future`, `lms_trip_data`

### Analytics
- `savedReports`, `dashboards`, `reportTypes`, `report_schedules`, `fieldHistory`

### Import/Export
- `import_jobs`, `export_jobs`

### Automation
- `automationRules`

---

## Role Enum Values (Never Rename)

```sql
CREATE TYPE role AS ENUM (
  'SUPER_ADMIN',
  'ADMIN',
  'MANAGER',
  'OPERATOR',
  'VIEWER',
  'DEVELOPER',
  'PLATFORM_BUILDER'
);
```

Display aliases (frontend only, not stored in DB):
- `PLATFORM_OWNER` → displays as "Platform Owner", maps to `SUPER_ADMIN`
- `WORKSPACE_OWNER` → displays as "Workspace Owner", maps to `ADMIN`
- `WORKSPACE_ADMIN` → displays as "Workspace Admin", maps to `ADMIN`
- `TEAM_MANAGER` → displays as "Team Manager", maps to `MANAGER`
- `TEAM_MEMBER` → displays as "Team Member", maps to `OPERATOR`
- `READ_ONLY` → displays as "Read Only", maps to `VIEWER`

---

## Safeguarding Notes — Special Rules

1. Content is encrypted at rest using AES-256-GCM via `encrypt.ts`.
2. The `INTEGRATION_ENCRYPTION_KEY` env var must be set before any safeguarding notes are created.
3. Safeguarding notes are excluded from the report engine.
4. Safeguarding notes are excluded from standard CSV/JSON export.
5. Every access (view, create, update, delete) is logged to `safeguarding_access_log`.
6. A reason for access is required for every operation.
7. Search is scoped to `title` only — content cannot be searched via SQL LIKE (encrypted).
