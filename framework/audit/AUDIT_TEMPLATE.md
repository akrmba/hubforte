# YESCRM — COMPREHENSIVE AUDIT TEMPLATE
### Agents fill in this file. Owner uploads it back for analysis.
**Version:** 1.0 | **Location:** framework/audit/AUDIT_TEMPLATE.md
**Before filling this in: Read AUDIT_PROTOCOL.md completely.**
**Format for every answer: CONFIRMED/MISSING/PARTIAL/ERROR — [file:line] — [exact evidence]**

---

## HOW THIS FILE WORKS

Claude fills in Column A (Claude's findings).
Codex fills in Column B (Codex's independent verification).
Where they agree: result stands.
Where they disagree: marked DISPUTED — owner decides.
Owner uploads this completed file for consolidated analysis.

---

# SECTION 1 — SECURITY FOUNDATIONS

## 1A — Credentials & Git

**CHECK 1A-1:** Is `.gitignore` at project root covering `.env`, `**/.env`, `node_modules/`, `not_required_1904_12pm/`?
- Open the actual `.gitignore` file and quote the relevant lines.
- Claude (Column A): ___
- Codex (Column B): ___

**CHECK 1A-2:** Run `git ls-files | grep "\.env$"` — are any .env files tracked by git?
- Report the exact command output.
- Claude (Column A): ___
- Codex (Column B): ___

**CHECK 1A-3:** Do `.env.example` files contain only placeholders (no real values)?
- Check: `artifacts/api-server/.env.example` and `.env.production.example`
- Claude (Column A): ___
- Codex (Column B): ___

**CHECK 1A-4:** Is `EMERGENCY_ACTIVATION_TOKEN` present as a placeholder in `.env.example`?
- Claude (Column A): ___
- Codex (Column B): ___

**CHECK 1A-5:** Is `SEED_PASSWORD` still `ChangeMe123!` or similar weak default?
- Check seed scripts AND .env.example files.
- Claude (Column A): ___
- Codex (Column B): ___

## 1B — Authentication Security

**CHECK 1B-1:** Does POST /auth/login NOT return the JWT token in the JSON response body?
- Open `artifacts/api-server/src/routes/auth.ts`, find the login success response.
- Confirm `token` is NOT in the `res.json()` call.
- Claude (Column A): ___
- Codex (Column B): ___

**CHECK 1B-2:** Is the JWT stored in an httpOnly, sameSite:strict, secure cookie?
- Quote the exact cookie options from the file.
- Claude (Column A): ___
- Codex (Column B): ___

**CHECK 1B-3:** Does POST /auth/login have rate limiting?
- Show the exact function call and file:line.
- Claude (Column A): ___
- Codex (Column B): ___

**CHECK 1B-4:** Does POST /auth/forgot-password have rate limiting?
- Claude (Column A): ___
- Codex (Column B): ___

**CHECK 1B-5:** Does GET /auth/verify check token expiry (not just existence)?
- Show the expiry check code at file:line.
- Claude (Column A): ___
- Codex (Column B): ___

**CHECK 1B-6:** Does failed login return IDENTICAL message whether email or password is wrong?
- Show the error response lines for both failure paths.
- Claude (Column A): ___
- Codex (Column B): ___

## 1C — Emergency Access System

**CHECK 1C-1:** Does `scripts/emergency-access.ts` exist?
- Claude (Column A): ___
- Codex (Column B): ___

**CHECK 1C-2:** Is the emergency account suspended by default in the seed/migration?
- Check migration file AND schema file.
- Claude (Column A): ___
- Codex (Column B): ___

**CHECK 1C-3:** Does the emergency activate endpoint check `req.ip === '127.0.0.1'`?
- Show the IP check code at file:line.
- Claude (Column A): ___
- Codex (Column B): ___

**CHECK 1C-4:** Does emergency activation write to `audit_logs` table?
- Show the audit log write call at file:line.
- Claude (Column A): ___
- Codex (Column B): ___

## 1D — Two-Factor Authentication

**CHECK 1D-1:** Are backup codes stored HASHED in `user_backup_codes.code_hash`?
- Open `lib/db/src/schema/user_backup_codes.ts` — quote the column definition.
- ALSO open the migration file for user_backup_codes — confirm the SQL.
- Schema file: ___
- Migration file: ___
- Claude (Column A): ___
- Codex (Column B): ___

**CHECK 1D-2:** Is `totp_pending_secret` cleared after 2FA is activated?
- Show the code at file:line.
- Claude (Column A): ___
- Codex (Column B): ___

**CHECK 1D-3:** Is the 2FA `tempToken` maximum 15 minutes lifetime?
- Show the expiry setting at file:line.
- Claude (Column A): ___
- Codex (Column B): ___

**CHECK 1D-4:** Does disabling 2FA require BOTH password AND TOTP code?
- Show both checks at file:line.
- Claude (Column A): ___
- Codex (Column B): ___

---

# SECTION 2 — DATABASE (MUST CHECK SCHEMA + MIGRATION SEPARATELY)

**PROTOCOL REMINDER:** For every DB check, open the schema file AND the migration file. Both must be confirmed. Checking only one = PARTIAL.

## 2A — Users Table Columns

For each column below:
- Open `lib/db/src/schema/users.ts` — quote the column definition
- Open the relevant migration in `lib/db/migrations/` — confirm the SQL ALTER TABLE

**CHECK 2A-1:** `verification_token TEXT NULL` — Schema: ___ | Migration: ___
**CHECK 2A-2:** `verification_token_expires_at TIMESTAMPTZ NULL` — Schema: ___ | Migration: ___
**CHECK 2A-3:** `totp_secret TEXT NULL` — Schema: ___ | Migration: ___
**CHECK 2A-4:** `totp_enabled BOOLEAN DEFAULT FALSE` — Schema: ___ | Migration: ___
**CHECK 2A-5:** `totp_pending_secret TEXT NULL` — Schema: ___ | Migration: ___
**CHECK 2A-6:** `is_emergency_account BOOLEAN DEFAULT FALSE` — Schema: ___ | Migration: ___
**CHECK 2A-7:** `job_title VARCHAR(100) NULL` — Schema: ___ | Migration: ___
**CHECK 2A-8:** `status TEXT DEFAULT 'active'` — Schema: ___ | Migration: ___

## 2B — Tenants Table Columns

- Open `lib/db/src/schema/tenants.ts` AND the relevant migration.

**CHECK 2B-1:** `byok_enabled BOOLEAN DEFAULT FALSE` — Schema: ___ | Migration: ___
**CHECK 2B-2:** `ai_diagnosis_enabled BOOLEAN DEFAULT FALSE` — Schema: ___ | Migration: ___
**CHECK 2B-3:** `status TEXT` (for pending_verification, active, suspended) — Schema: ___ | Migration: ___
**CHECK 2B-4:** `plan TEXT` (trial, paid etc.) — Schema: ___ | Migration: ___

## 2C — New Tables Added in Phases 1-13

For each table: open the schema file AND confirm the migration SQL file exists.

**CHECK 2C-1:** `user_backup_codes` table — Schema file: ___ | Migration file: ___
**CHECK 2C-2:** `incidents` table — Schema file: ___ | Migration file: ___
**CHECK 2C-3:** `monitoring_alerts` table — Schema file: ___ | Migration file: ___
**CHECK 2C-4:** `registered_apps` table — Schema file: ___ | Migration file: ___
**CHECK 2C-5:** `tenant_ai_config` table — Schema file: ___ | Migration file: ___
**CHECK 2C-6:** `webhooks` table — Schema file: ___ | Migration file: ___
**CHECK 2C-7:** `webhook_delivery_log` table — Schema file: ___ | Migration file: ___
**CHECK 2C-8:** `integration_configs` table — Schema file: ___ | Migration file: ___
**CHECK 2C-9:** `import_history` table — Schema file: ___ | Migration file: ___
**CHECK 2C-10:** `report_schedules` table — Schema file: ___ | Migration file: ___

## 2D — Performance Indexes

For each index: open migration 0035 AND the schema file.

**CHECK 2D-1:** `idx_users_email` on `users(email)` — Migration: ___ | Schema: ___
**CHECK 2D-2:** `idx_contacts_email` on `contacts(email) WHERE email IS NOT NULL` — Migration: ___ | Schema: ___
**CHECK 2D-3:** `idx_contacts_status` on `contacts(tenant_id, status)` — Migration: ___ | Schema: ___
**CHECK 2D-4:** `idx_contacts_created_at` on `contacts(tenant_id, created_at DESC)` — Migration: ___ | Schema: ___
**CHECK 2D-5:** `idx_organizations_name` on `organizations(tenant_id, name)` — Migration: ___ | Schema: ___

## 2E — Migration Sequence

**CHECK 2E-1:** List the last 10 migration files. Are they numbered sequentially with no gaps?
- Run: `ls lib/db/migrations/ | tail -20`
- Claude (Column A): ___
- Codex (Column B): ___

**CHECK 2E-2:** Does every `*_up.sql` have a matching `*_down.sql`?
- Report any up migrations without a down migration.
- Claude (Column A): ___
- Codex (Column B): ___

---

# SECTION 3 — BACKEND ROUTES & MODULE SYSTEM

## 3A — Module Key Cross-Check (Frontend vs Backend)

For each module below: open Layout.tsx AND routes/index.ts. Quote BOTH the frontend key AND the backend key. Confirm they match exactly.

**CHECK 3A-1:** organisations
- Frontend (Layout.tsx:line): ___
- Backend (index.ts:line): ___
- Match: YES / NO

**CHECK 3A-2:** contacts
- Frontend: ___ | Backend: ___ | Match: ___

**CHECK 3A-3:** pipeline
- Frontend: ___ | Backend: ___ | Match: ___

**CHECK 3A-4:** outreach
- Frontend: ___ | Backend: ___ | Match: ___

**CHECK 3A-5:** support
- Frontend: ___ | Backend: ___ | Match: ___

**CHECK 3A-6:** volunteers
- Frontend: ___ | Backend: ___ | Match: ___

**CHECK 3A-7:** funders
- Frontend: ___ | Backend: ___ | Match: ___

**CHECK 3A-8:** programmes
- Frontend: ___ | Backend: ___ | Match: ___

**CHECK 3A-9:** cohorts
- Frontend: ___ | Backend: ___ | Match: ___

**CHECK 3A-10:** outcomes
- Frontend: ___ | Backend: ___ | Match: ___

**CHECK 3A-11:** safeguarding
- Frontend: ___ | Backend: ___ | Match: ___

**CHECK 3A-12:** automation
- Frontend: ___ | Backend: ___ | Match: ___

**CHECK 3A-13:** attachments
- Frontend: ___ | Backend: ___ | Match: ___

**CHECK 3A-14:** reports
- Frontend: ___ | Backend: ___ | Match: ___

**CHECK 3A-15:** lms (external link — check VITE_LMS_URL is used)
- Frontend: ___ | Backend: ___ | LMS URL env var confirmed: ___

**CHECK 3A-16:** consent (was "consent_management" — confirm it was fixed)
- Frontend: ___ | Backend: ___ | Match: ___

## 3B — Route Gating Verification

**CHECK 3B-1:** `/notifications/*` — has `authMiddleware`?
- Quote the mount line from `routes/index.ts:line`: ___

**CHECK 3B-2:** `/remediation/*` — gated by `requireRole("SUPER_ADMIN")` only?
- Quote the mount line: ___

**CHECK 3B-3:** `/ai/*` — gated by `checkModuleEnabled("ai")`?
- Quote the mount line: ___

**CHECK 3B-4:** `/safeguarding-notes/*` — has BOTH `authMiddleware` AND `checkModuleEnabled("safeguarding")`?
- Quote the mount line: ___

**CHECK 3B-5:** `/lms/public/*` — correctly has NO authMiddleware (public routes)?
- Quote the mount line: ___

**CHECK 3B-6:** `/super-admin/*` — all routes gated by SUPER_ADMIN role check?
- Quote the middleware used: ___

## 3C — Tenant Isolation Spot Check

For each of these 5 endpoints, open the route file, find the list query, confirm `tenant_id` comes from `req.user.tenantId` NOT from `req.query` or `req.body`:

**CHECK 3C-1:** GET /contacts list query — `tenant_id` source: ___
**CHECK 3C-2:** GET /organizations list query — `tenant_id` source: ___
**CHECK 3C-3:** GET /opportunities list query — `tenant_id` source: ___
**CHECK 3C-4:** GET /support (tickets) list query — `tenant_id` source: ___
**CHECK 3C-5:** GET /volunteers list query — `tenant_id` source: ___

## 3D — Error Handler

**CHECK 3D-1:** In production (`NODE_ENV=production`), does the global error handler strip stack traces?
- Open `artifacts/api-server/src/app.ts` — quote the relevant condition: ___

**CHECK 3D-2:** Is a `requestId` (UUID) generated for 500 errors and written to `error_logs`?
- Quote the code at file:line: ___

**CHECK 3D-3:** Does every error response follow `{ error, code, message, requestId }` shape?
- Pick 3 different route files and check their error responses. List them: ___

---

# SECTION 4 — FRONTEND COMPLETENESS

## 4A — Pages Exist and Are Routed

For each page, open `artifacts/crm/src/App.tsx` and confirm the route is registered. Then confirm the page file exists on disk.

**CHECK 4A-1:** `/login` — Route in App.tsx: ___ | File exists: ___
**CHECK 4A-2:** `/auth/register` — Route: ___ | File: ___
**CHECK 4A-3:** `/auth/2fa` — Route: ___ | File: ___
**CHECK 4A-4:** `/forgot-password` — Route: ___ | File: ___
**CHECK 4A-5:** `/ext/dashboard` — Route: ___ | File: ___
**CHECK 4A-6:** `/super-admin/health` — Route: ___ | File: ___
**CHECK 4A-7:** `/super-admin/modules` — Route: ___ | File: ___
**CHECK 4A-8:** `/reports` — Route: ___ | File: ___
**CHECK 4A-9:** `/import` — Route: ___ | File: ___
**CHECK 4A-10:** `/admin/team` — Route: ___ | File: ___
**CHECK 4A-11:** `/admin/apps` (standalone app framework) — Route: ___ | File: ___
**CHECK 4A-12:** `/auth/login` redirect → `/login` — Route: ___
**CHECK 4A-13:** `/super-admin/knowledge-base` — Route: ___ | File: ___

## 4B — Design System

**CHECK 4B-1:** Are brand CSS variables defined in `artifacts/crm/src/index.css`?
- Quote `--brand-primary`, `--brand-secondary`, `--brand-accent` values: ___

**CHECK 4B-2:** Does `ThemeProvider.tsx` exist and wrap the app in `main.tsx`?
- ThemeProvider file: ___ | main.tsx wrap: ___

**CHECK 4B-3:** Is `ErrorBoundary.tsx` wrapping the entire app in `main.tsx`?
- Quote the relevant lines from main.tsx: ___

**CHECK 4B-4:** Does `CommandPalette.tsx` exist and is it triggered by Ctrl+K in Layout.tsx?
- File exists: ___ | Ctrl+K listener in Layout.tsx: ___

**CHECK 4B-5:** Is `sourcemap: false` set in `artifacts/crm/vite.config.ts`?
- Quote the build config: ___

**CHECK 4B-6:** Does the build produce multiple chunk files (code splitting)?
- Run `pnpm --filter @workspace/crm build` and list the output chunk files: ___

## 4C — Dashboard

**CHECK 4C-1:** Are all three original data hooks still called in `DashboardPage.tsx`?
- `useGetDashboardStats`: ___ | `useGetDashboardActivity`: ___ | `useGetTasksDue`: ___

**CHECK 4C-2:** Is the Pipeline chart using recharts `BarChart` with `layout="vertical"`?
- Quote the recharts import and component use: ___

**CHECK 4C-3:** Is there an LMS card gated by `useFeatureFlags('lms')`?
- Quote the condition: ___

**CHECK 4C-4:** Is there a System Status row visible only to `super_admin`?
- Quote the role check: ___

**CHECK 4C-5:** Do loading states use `Skeleton` (not plain text)?
- Check DashboardPage, ContactsPage, ModuleControlCentrePage — quote one example: ___

## 4D — Super Admin UI

**CHECK 4D-1:** Does `ModuleControlCentrePage` redirect non-super-admins before rendering?
- Quote the guard at file:line: ___

**CHECK 4D-2:** Does the Module Control Centre have an "AI Permissions" section with `byokEnabled` and `aiDiagnosisEnabled` toggles?
- Quote the relevant component JSX: ___

**CHECK 4D-3:** Does disabling `byokEnabled` show a confirmation dialog?
- Quote the dialog condition: ___

**CHECK 4D-4:** Does the Health Dashboard at `/super-admin/health` exist and show:
- Status banner: ___ | KPI cards: ___ | Error table: ___ | AI Explain button: ___ | Run Auto-Fix button: ___

---

# SECTION 5 — AI LAYER

**CHECK 5-1:** Does `getAIProvider(context, tenantId)` exist in `aiProvider.ts`?
- Quote the function signature at file:line: ___

**CHECK 5-2:** Does `context='system'` use Anthropic (not OpenRouter)?
- Quote the branch: ___

**CHECK 5-3:** Does `context='client'` check `tenant_ai_config` before falling back to OpenRouter?
- Quote the lookup: ___

**CHECK 5-4:** Is `byokEnabled` checked before a tenant can save their AI key?
- Open `artifacts/api-server/src/routes/settingsAi.ts` — quote the guard: ___

**CHECK 5-5:** Does `/support/tickets/:id/diagnose` use System AI (Anthropic), NOT client AI?
- Open `artifacts/api-server/src/routes/support.ts` — quote the AI call: ___

**CHECK 5-6:** Is `aiDiagnosisEnabled` checked on the ticket diagnosis route?
- Quote the check at file:line: ___

**CHECK 5-7:** Does the BYOK settings section in `SettingsPage.tsx` only show when `byokEnabled` is true for the tenant?
- Quote the condition: ___

**CHECK 5-8:** Is there a Lead Score feature on the contact detail page?
- Find the component or page — file:line: ___
- If MISSING, note: "Salesforce has Einstein Lead Scoring built-in"

**CHECK 5-9:** Is there a "Next Best Action" feature on the contact page?
- Find it — file:line: ___
- If MISSING, note: "Salesforce Einstein Next Best Action exists"

**CHECK 5-10:** Is there an AI email composer on the outreach/campaign creation page?
- Find it — file:line: ___

**CHECK 5-11:** Is there a daily owner briefing (8am email via cron)?
- Find the cron job — file:line: ___
- If MISSING, note as planned but not built

---

# SECTION 6 — MONITORING & NERVOUS SYSTEM

**CHECK 6-1:** Does `incidentDetector.ts` exist and define P1/P2/P3/P4?
- File: ___ | P1 check at line: ___ | P4 check at line: ___

**CHECK 6-2:** Is incidentDetector scheduled (cron every 5 minutes)?
- Quote the cron schedule from `artifacts/api-server/src/index.ts` or wherever it is started: ___

**CHECK 6-3:** Does `incidentNotifier.ts` send email for P1 and P2?
- Quote the email send call: ___

**CHECK 6-4:** Does incident detection deduplicate (same alert not sent within 30 min)?
- Quote the deduplication logic: ___

**CHECK 6-5:** Does the `incidents` table exist?
- Schema file: ___ | Migration file: ___

**CHECK 6-6:** Does `statusPage.ts` exist and connect to Instatus?
- File: ___ | Function that creates incidents: ___

**CHECK 6-7:** Is `INSTATUS_API_KEY` in `.env.production.example`?
- Quote the line: ___

**CHECK 6-8:** Does `SEND_CLIENT_INCIDENT_EMAILS` env var exist in `.env.example`?
- If default is false, note it must be enabled before go-live.
- Quote the line: ___

**CHECK 6-9:** Does the Health Dashboard have an "Explain (AI)" button on errors that calls an AI endpoint?
- Quote the button handler: ___

**CHECK 6-10:** Does the Error Knowledge Base page exist at `/super-admin/knowledge-base`?
- File: ___ | Route in App.tsx: ___

---

# SECTION 7 — IMPORT & EXPORT

**CHECK 7-1:** Does the import system have a field whitelist (ALLOWED_CONTACT_FIELDS etc.)?
- Open `artifacts/api-server/src/routes/import.ts` — quote the whitelist constant: ___

**CHECK 7-2:** Are `tenantId`, `id`, `createdAt`, `updatedAt` in the PROTECTED_FIELDS list?
- Quote them: ___

**CHECK 7-3:** Do BOTH `/api/import/status/:jobId` AND `/api/import/jobs/:jobId` paths exist?
- Quote both route definitions at file:line: ___

**CHECK 7-4:** Does the export ZIP include `README.md` and `schema.json`?
- Open `artifacts/api-server/src/routes/export.ts` — quote where these are added to the ZIP: ___

**CHECK 7-5:** Are `safeguarding_notes` explicitly excluded from the export?
- Quote the exclusion logic: ___

**CHECK 7-6:** Do export download links expire after 24 hours?
- Quote the expiry logic: ___

**CHECK 7-7:** Are import/export jobs processed through the background WORKER queue?
- If they run in the API process (not worker), mark as PARTIAL.
- Quote where the job is enqueued: ___

**CHECK 7-8:** Are Salesforce, HubSpot, Pipedrive field mapping presets defined?
- Open `artifacts/api-server/src/lib/importMappings.ts` — list the sources with preset mappings: ___

---

# SECTION 8 — INTEGRATIONS & STANDALONE APP FRAMEWORK

**CHECK 8-1:** Does POST `/api/apps` endpoint exist for app registration?
- Quote the route at file:line: ___

**CHECK 8-2:** Does `X-YesCRM-App-Key` header authentication exist?
- Quote the middleware: ___

**CHECK 8-3:** Do `/api/v1/*` scoped endpoints exist for external apps?
- List what endpoints are available: ___

**CHECK 8-4:** Does `docs/APP_INTEGRATION_GUIDE.md` exist?
- File exists: ___ | Does it have a quick-start example? ___

**CHECK 8-5:** Does the "Connected Apps" page exist in the UI?
- Route: ___ | File: ___

**CHECK 8-6:** Does the outgoing webhook system exist?
- `webhooks` table schema: ___ | Migration: ___ | Delivery function: ___

**CHECK 8-7:** Does `webhookDelivery.ts` exist with HMAC signing?
- File: ___ | HMAC signing code at line: ___

**CHECK 8-8:** Does the Integrations page exist with connector cards?
- Route: ___ | File: ___ | Are SendGrid and Slack shown as connectors? ___

**CHECK 8-9:** Is SendGrid actually wired up as a working connector (not just a UI card)?
- Check if there is actual SendGrid API code, not just a placeholder.
- Claude (Column A): ___
- Codex (Column B): ___

**CHECK 8-10:** Is Slack actually wired up as a working connector?
- Same check — real code or placeholder?
- Claude (Column A): ___
- Codex (Column B): ___

---

# SECTION 9 — REPORTS & ANALYTICS

**CHECK 9-1:** Are pre-built sales report templates accessible?
- Route: ___ | How are they defined (DB seeded, hardcoded, or dynamic)? ___

**CHECK 9-2:** Does the Report Builder UI have at minimum Steps 1-4 (entity, fields, filters, sort)?
- File: ___ | Quote the Step 1 entity selector: ___

**CHECK 9-3:** Is `safeguarding_notes` ABSENT from the entity type selector in the report builder?
- Quote the entity list to confirm it is not there: ___

**CHECK 9-4:** Is `safeguarding_notes` ABSENT from the `entityTables` map in the reports backend?
- Open `artifacts/api-server/src/routes/reports.ts` — quote the map to confirm it is not there: ___

**CHECK 9-5:** Does the 403 guard for safeguarding still exist BEFORE the entityTables lookup?
- Quote the guard at file:line: ___

**CHECK 9-6:** Is there scheduled report delivery (email CSV on a schedule)?
- Find the schedule feature — file:line: ___
- If MISSING, note as planned but not built.

---

# SECTION 10 — DEPLOYMENT

**CHECK 10-1:** Does `artifacts/api-server/Dockerfile` exist?
- Quote the first 3 lines: ___

**CHECK 10-2:** Does `artifacts/crm/Dockerfile` exist?
- Quote the first 3 lines: ___

**CHECK 10-3:** Does `artifacts/lms/Dockerfile` exist?
- Quote the first 3 lines: ___

**CHECK 10-4:** Does `worker/Dockerfile` exist?
- Quote the first 3 lines: ___

**CHECK 10-5:** Does `docker-compose.yml` exist at project root?
- Quote the services listed: ___

**CHECK 10-6:** Does `docker-compose.prod.yml` exist?
- Does it use environment variables (not hardcoded secrets)? Quote an example: ___

**CHECK 10-7:** Does `.github/workflows/deploy.yml` have a `typecheck` job that runs before `build`?
- Quote the `needs:` dependency line: ___

**CHECK 10-8:** Does the typecheck job check ALL 4 packages?
- List the 4 typecheck commands from the YAML: ___

**CHECK 10-9:** Does `.env.production.example` exist at project root?
- List the sections/groups it covers: ___

**CHECK 10-10:** Does `ops/OCI_SETUP.md` exist with deployment instructions?
- File exists: ___ | Does it cover nginx + SSL setup? ___

**CHECK 10-11:** Run `pnpm audit` — report the exact output:
- Claude (Column A): ___
- Codex (Column B): ___

**CHECK 10-12:** Run all 4 typechecks and report actual exit codes:
- `pnpm --filter @workspace/db build`: ___
- `pnpm --filter @workspace/api-server typecheck`: ___
- `pnpm --filter @workspace/crm typecheck`: ___
- `pnpm --filter @workspace/lms typecheck`: ___

---

# SECTION 11 — ROLE SYSTEM & TEAM ACCESS

**CHECK 11-1:** Are friendly role display names implemented? Confirm "OPERATOR" is shown as "Team Member" somewhere in the UI.
- Quote the mapping or display code: ___

**CHECK 11-2:** Does `job_title` column exist on the `users` table?
- Schema file at line: ___ | Migration file: ___

**CHECK 11-3:** Does the `DEVELOPER` role exist and is it enforced to block client data access?
- Quote the role enum value: ___ | Quote the data-blocking logic: ___

**CHECK 11-4:** Does the `PLATFORM_BUILDER` role exist?
- Quote the role enum value: ___

**CHECK 11-5:** Does the Team Management page exist at `/admin/team`?
- Route: ___ | File: ___

**CHECK 11-6:** Does the invite user flow exist (invite email sent on user creation)?
- Quote the invite email send at file:line: ___

**CHECK 11-7:** Does the Error Knowledge Base exist at `/super-admin/knowledge-base`?
- Route: ___ | File: ___

**CHECK 11-8:** Does the "Share with Developer" flow exist in the knowledge base?
- Quote the share functionality: ___

---

# SECTION 12 — YES FUTURES SPECIFIC REQUIREMENTS

*Yes Futures is the first client — an education and social impact organisation. These are their mandatory requirements.*

**CHECK 12-1:** SAFEGUARDING — Is safeguarding protected at ALL 5 layers?
- Layer 1: backend 403 guard in reports route: ___
- Layer 2: safeguarding NOT in entityTables map: ___
- Layer 3: safeguarding excluded from export: ___
- Layer 4: safeguarding NOT importable via standard import: ___
- Layer 5: safeguarding access writes to `safeguarding_access_log`: ___

**CHECK 12-2:** LMS — Can a coach log in and see their students?
- Is the LMS app linked from CRM nav: ___ | Does `/lms/*` route require auth: ___

**CHECK 12-3:** COHORTS — Does cohort management exist?
- Route `/programme-cohorts/*` gated by `checkModuleEnabled("cohorts")`: ___

**CHECK 12-4:** SESSION ATTENDANCE — Does session attendance tracking exist?
- Route `/session-attendance/*`: ___ | Schema file: ___ | Migration: ___

**CHECK 12-5:** OUTCOME TRACKING — Do outcome frameworks and records exist?
- Routes `/outcome-frameworks/*` and `/outcome-records/*`: ___
- Schema files: ___ | Migrations: ___

**CHECK 12-6:** CONSENT MANAGEMENT — Do consent records and parent/guardian management exist?
- Routes: ___ | Using module key "consent" (not "consent_management"): ___

**CHECK 12-7:** STUDENT SURVEYS — Does the LMS student survey system exist?
- Schema `lms_student_surveys`: ___ | Public route for survey submission: ___

**CHECK 12-8:** PDF REPORTS — Does the LMS PDF report generation work?
- Route GET `/api/lms/public/report/pdf`: ___ | Does Puppeteer exist in the project? ___

**CHECK 12-9:** VOLUNTEERS — Does volunteer management link to organisations?
- `volunteers` table has `placement` link to organisations: ___

**CHECK 12-10:** FUNDER PIPELINE — Do funders have their own pipeline for grant management?
- Is there a way to track funding opportunities against funders: ___

---

# SECTION 13 — SALESFORCE FEATURE PARITY CHECK

*For each item: BUILT (with evidence), PARTIAL (what's missing), or MISSING (Salesforce has this, we don't yet)*

**CHECK 13-1:** Contact & Account Management (contacts + organisations with full CRUD): ___
**CHECK 13-2:** Pipeline/Opportunity Management with stages: ___
**CHECK 13-3:** Activity Logging (calls, emails, meetings, notes): ___
**CHECK 13-4:** Email Campaigns / Marketing automation: ___
**CHECK 13-5:** Reports & Dashboards (pre-built + custom builder): ___
**CHECK 13-6:** Workflow Automation (trigger-based rules): ___
**CHECK 13-7:** Lead Scoring (0-100 with explanation): ___
**CHECK 13-8:** AI Email Generation (compose emails with AI): ___
**CHECK 13-9:** Sales Forecasting (weighted pipeline value): ___
**CHECK 13-10:** Document/Proposal Generation (PDF from template): ___
**CHECK 13-11:** Mobile Access (PWA or responsive): ___
**CHECK 13-12:** Integration Marketplace / Connectors: ___
**CHECK 13-13:** API for external developers: ___
**CHECK 13-14:** Two-Factor Authentication: ___
**CHECK 13-15:** Role-Based Access Control: ___
**CHECK 13-16:** Data Import from other CRMs: ___
**CHECK 13-17:** Data Export / Portability: ___
**CHECK 13-18:** Support Ticketing: ___
**CHECK 13-19:** Self-Service Tenant Registration: ___
**CHECK 13-20:** System Health Monitoring: ___

---

# SECTION 14 — PLANNED BUT NOT YET BUILT (NEXT PHASES)

*These are features from the master plan that were not in Phases 1-13. Mark each as NOT BUILT or PARTIAL if some foundation exists.*

**CHECK 14-1:** Voice Agent integration (Vapi.ai or similar): ___
**CHECK 14-2:** Attachment monitoring (document view tracking): ___
**CHECK 14-3:** Quote/Proposal PDF builder: ___
**CHECK 14-4:** E-signature integration (SignWell or DocuSign): ___
**CHECK 14-5:** Mobile PWA (service worker, offline, push notifications): ___
**CHECK 14-6:** Customer self-service portal: ___
**CHECK 14-7:** Stripe billing for tenant subscriptions: ___
**CHECK 14-8:** Territory management for sales teams: ___
**CHECK 14-9:** Commission tracking: ___
**CHECK 14-10:** Sales Forecasting report: ___
**CHECK 14-11:** Lead Velocity Report (pre-built): ___
**CHECK 14-12:** Rep Leaderboard report (pre-built): ___
**CHECK 14-13:** Import/export jobs running in worker queue (not API process): ___
**CHECK 14-14:** SendGrid connector actually sending emails (not just UI): ___
**CHECK 14-15:** Slack connector actually posting messages (not just UI): ___
**CHECK 14-16:** Daily owner briefing email (8am cron): ___
**CHECK 14-17:** Scheduled report delivery by email: ___
**CHECK 14-18:** Client onboarding guide tour (first login): ___
**CHECK 14-19:** 7-day check-in automated email after signup: ___

---

# SECTION 15 — FRAMEWORK DOCUMENTATION ACCURACY

**CHECK 15-1:** Does Section 15 (Known Issues) in `YESCRM_AGENT_CONTEXT_v2.md` accurately reflect current state?
- Are there any items still marked 🔴/🟠/🟡 that are actually resolved? List them: ___

**CHECK 15-2:** Does Section 6 still say "(to be built)" for anything that is now built?
- List any stale "(to be built)" labels: ___

**CHECK 15-3:** Does Section 3 (Repository Structure) still list files as "(to be built)" that now exist?
- Examples to check: `RegisterPage.tsx`, `TwoFactorPage.tsx`, `scripts/emergency-access.ts`
- List stale entries: ___

**CHECK 15-4:** Does the Change Log (Section 18) need any entries added?
- List any phases completed after the last log entry: ___

**CHECK 15-5:** Are there any contradictions between the docs and the actual code?
- Example: docs say "X is owner-only" but the route has no role check.
- List any contradictions found: ___

---

# SECTION 16 — FINAL BUILD VERIFICATION

**Run these commands and paste the full output:**

**BUILD-1:** `pnpm --filter @workspace/db build`
Output: ___

**BUILD-2:** `pnpm --filter @workspace/api-server typecheck`
Output: ___

**BUILD-3:** `pnpm --filter @workspace/crm typecheck`
Output: ___

**BUILD-4:** `pnpm --filter @workspace/lms typecheck`
Output: ___

**BUILD-5:** `pnpm --filter @workspace/crm build`
Output (include chunk list): ___

**BUILD-6:** `pnpm audit`
Output: ___

---

# SECTION 17 — FINDINGS SUMMARY

*Fill this in last. Based on everything found above.*

## CRITICAL — Must fix before any client uses the system
(Issues that could cause data loss, security breach, or complete system failure)

1. ___
2. ___
3. ___

## HIGH — Must fix before go-live
(Issues that break important features or violate stated requirements)

1. ___
2. ___
3. ___

## MEDIUM — Fix within 30 days
(Features partially implemented, UX issues, performance concerns)

1. ___
2. ___
3. ___

## LOW — Fix when time allows
(Polish, minor gaps, cosmetic issues)

1. ___
2. ___

## ACCEPTED RISK — Cannot fix now, acknowledged
(Known limitations with no current patch)

1. ___

## NOT BUILT YET — Planned features for next phases
(These are not bugs. They are future work.)

1. ___
2. ___
3. ___

## DOCUMENTATION GAPS — Framework docs that need updating
1. ___
2. ___

## FINAL VERDICT

Claude's verdict: DEPLOYMENT READY / DEPLOY WITH CAUTION (list items) / NOT READY (list blockers)
Codex's verdict: DEPLOYMENT READY / DEPLOY WITH CAUTION (list items) / NOT READY (list blockers)

---

*Audit completed by Claude on: [date]*
*Verified by Codex on: [date]*
*Reviewed by owner on: [date]*
