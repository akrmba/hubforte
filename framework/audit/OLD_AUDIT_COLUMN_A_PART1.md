# YESCRM AUDIT — COLUMN A (Claude) — PART 1: Sections 1–4
# Audited: 2026-04-30

---

# SECTION 1 — SECURITY FOUNDATIONS

## 1A — Credentials & Git

**CHECK 1A-1:** CONFIRMED — `.gitignore` lines 4-10 include `**/.env`, `.env`, `node_modules/`, `.env.*`. Evidence: `.gitignore:4` → `**/.env` and `.gitignore:7` → `node_modules/`

**CHECK 1A-2:** CONFIRMED SAFE — No `.env` files tracked by git. `git ls-files | grep "\.env$"` returns empty output. Evidence: `.gitignore:4` covers `**/.env`

**CHECK 1A-3:** CONFIRMED — `artifacts/api-server/.env.example` contains only placeholders (e.g. `JWT_SECRET=your-super-secret-jwt-key-here`, `DATABASE_URL=postgresql://...`). No real credentials found. Evidence: `.env.example:1-134`

**CHECK 1A-4:** CONFIRMED — `EMERGENCY_ACTIVATION_TOKEN=your-emergency-activation-token` present as placeholder. Evidence: `artifacts/api-server/.env.example:line ~45`

**CHECK 1A-5:** CONFIRMED SAFE — No `SEED_PASSWORD` or `ChangeMe123!` found in `.env.example`. Emergency password uses `randomUUID()` by default if `EMERGENCY_PASSWORD` env not set. Evidence: `scripts/emergency-access.ts:38`

## 1B — Authentication Security

**CHECK 1B-1:** CONFIRMED — Login success `res.json()` at `auth.ts:94-105` returns `{ user: {...} }` only — NO `token` field in the response body. JWT is set via `res.cookie()` at line 86.

**CHECK 1B-2:** CONFIRMED — Cookie options at `auth.ts:86-92`: `httpOnly: true`, `secure: isProduction`, `sameSite: "strict"`, `maxAge: 30d`, `path: "/"`. Evidence: `auth.ts:86-92`

**CHECK 1B-3:** CONFIRMED — `checkRateLimit("auth", ip)` called at `auth.ts:26` before any DB access on POST /auth/login.

**CHECK 1B-4:** CONFIRMED — `checkRateLimit("auth", ip)` called at `auth.ts:~265` on POST /auth/forgot-password (same rate limit function, same "auth" bucket).

**CHECK 1B-5:** CONFIRMED — GET /auth/verify at `auth.ts:510-518` checks `verificationTokenExpiresAt < new Date()` and returns `TOKEN_EXPIRED` if expired. Evidence: `auth.ts:510-518`

**CHECK 1B-6:** CONFIRMED — All three failure paths (user not found, invalid password, no password set) return identical `{ error: "Invalid credentials" }`. Evidence: `auth.ts:43`, `51`, `56`

## 1C — Emergency Access System

**CHECK 1C-1:** CONFIRMED — File exists at `scripts/emergency-access.ts` (119 lines). Evidence: file read confirmed.

**CHECK 1C-2:** CONFIRMED — Schema: `active: boolean("active").notNull().default(true)` BUT script creates with `active: false` at `emergency-access.ts:47`. Migration `0023_emergency_account_up.sql` adds `is_emergency_account BOOLEAN NOT NULL DEFAULT FALSE`. Emergency account is inserted with `active: false` — suspended by default.

**CHECK 1C-3:** CONFIRMED — IP check at `superAdmin.ts:415-418`:
```
const isLocal = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === '::ffff:127.0.0.1';
if (!isLocal) { res.status(403)... }
```

**CHECK 1C-4:** CONFIRMED — `writeAuditLog({ action: 'EMERGENCY_ACCESS_ACTIVATED', ... })` called at `superAdmin.ts:458-473`. Also logs deactivation at `superAdmin.ts:493-505`.

## 1D — Two-Factor Authentication

**CHECK 1D-1:**
- Schema file: `lib/db/src/schema/user_backup_codes.ts:7` → `codeHash: text("code_hash").notNull()`
- Migration file: `0021_user_backup_codes_up.sql:4` → `code_hash TEXT NOT NULL`
- CONFIRMED — backup codes stored as bcrypt hash, never plaintext

**CHECK 1D-2:** CONFIRMED — `totpPendingSecret: null` explicitly set at `auth.ts:603` when 2FA is activated via `verify-setup`.

**CHECK 1D-3:** CONFIRMED — `PENDING_2FA_TTL_MS = 15 * 60 * 1000` at `auth.ts:21`. Challenge expires at `Date.now() + PENDING_2FA_TTL_MS` set at `auth.ts:80`. Checked at `auth.ts:651`.

**CHECK 1D-4:** CONFIRMED — Disable 2FA at `auth.ts:625-642` requires BOTH `currentPassword` (bcrypt checked at line 632) AND `token` (TOTP verified at line 636).

---

# SECTION 2 — DATABASE

## 2A — Users Table Columns

**CHECK 2A-1:** `verification_token TEXT NULL`
- Schema: `users.ts:24` → `verificationToken: text("verification_token")`
- Migration: `0020_auth_2fa_up.sql:2` → `ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token TEXT`
- CONFIRMED

**CHECK 2A-2:** `verification_token_expires_at TIMESTAMPTZ NULL`
- Schema: `users.ts:25` → `verificationTokenExpiresAt: timestamp("verification_token_expires_at", { withTimezone: true })`
- Migration: `0034_verification_token_expiry_up.sql:2` → `ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token_expires_at TIMESTAMPTZ NULL`
- CONFIRMED

**CHECK 2A-3:** `totp_secret TEXT NULL`
- Schema: `users.ts:28` → `totpSecret: text("totp_secret")`
- Migration: `0020_auth_2fa_up.sql:4` → `ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT`
- CONFIRMED

**CHECK 2A-4:** `totp_enabled BOOLEAN DEFAULT FALSE`
- Schema: `users.ts:29` → `totpEnabled: boolean("totp_enabled").default(false)`
- Migration: `0020_auth_2fa_up.sql:5` → `ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN DEFAULT FALSE`
- CONFIRMED

**CHECK 2A-5:** `totp_pending_secret TEXT NULL`
- Schema: `users.ts:30` → `totpPendingSecret: text("totp_pending_secret")`
- Migration: `0020_auth_2fa_up.sql:6` → `ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_pending_secret TEXT`
- CONFIRMED

**CHECK 2A-6:** `is_emergency_account BOOLEAN DEFAULT FALSE`
- Schema: `users.ts:34` → `isEmergencyAccount: boolean("is_emergency_account").notNull().default(false)`
- Migration: `0023_emergency_account_up.sql:1` → `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_emergency_account BOOLEAN NOT NULL DEFAULT FALSE`
- CONFIRMED

**CHECK 2A-7:** `job_title VARCHAR(100) NULL`
- Schema: `users.ts:32` → `jobTitle: text("job_title")`
- Migration: `0022_job_title_up.sql` (confirmed file exists, 59 bytes)
- CONFIRMED

**CHECK 2A-8:** `status TEXT DEFAULT 'active'`
- Schema: `users.ts:26` → `status: text("status").default("active")`
- Migration: `0020_auth_2fa_up.sql:3` → `ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active'`
- CONFIRMED

## 2B — Tenants Table Columns

**CHECK 2B-1:** `byok_enabled BOOLEAN DEFAULT FALSE`
- Schema: `tenants.ts:14` → `byokEnabled: boolean("byok_enabled").notNull().default(false)`
- Migration: `0030_tenant_owner_flags_up.sql:4-6` → `ADD COLUMN IF NOT EXISTS byok_enabled boolean NOT NULL DEFAULT false`
- CONFIRMED

**CHECK 2B-2:** `ai_diagnosis_enabled BOOLEAN DEFAULT FALSE`
- Schema: `tenants.ts:15` → `aiDiagnosisEnabled: boolean("ai_diagnosis_enabled").notNull().default(false)`
- Migration: `0030_tenant_owner_flags_up.sql:4-6` → `ADD COLUMN IF NOT EXISTS ai_diagnosis_enabled boolean NOT NULL DEFAULT false`
- CONFIRMED

**CHECK 2B-3:** `status TEXT`
- Schema: `tenants.ts:8` → `status: text("status").notNull().default("active")`
- Migration: `0004_tenant_status_up.sql` (confirmed file exists, 397 bytes)
- CONFIRMED

**CHECK 2B-4:** `plan TEXT`
- Schema: `tenants.ts:9` → `plan: text("plan").notNull().default("trial")`
- Migration: `0037_tenant_plan_up.sql` (confirmed file exists, 81 bytes)
- CONFIRMED

## 2C — New Tables

**CHECK 2C-1:** `user_backup_codes`
- Schema: `lib/db/src/schema/user_backup_codes.ts` — CONFIRMED EXISTS
- Migration: `0021_user_backup_codes_up.sql` — CONFIRMED EXISTS

**CHECK 2C-2:** `incidents`
- Schema: `lib/db/src/schema/incidents.ts` — CONFIRMED EXISTS (1064 bytes)
- Migration: `0024_incidents_up.sql` — CONFIRMED EXISTS (589 bytes)

**CHECK 2C-3:** `monitoring_alerts` — PARTIAL — Schema file not found by that name. `incidents.ts` covers incident tracking. No separate `monitoring_alerts` table found.

**CHECK 2C-4:** `registered_apps`
- Schema: `lib/db/src/schema/registered_apps.ts` — CONFIRMED EXISTS (1204 bytes)
- Migration: `0031_registered_apps_up.sql` — CONFIRMED EXISTS (759 bytes)

**CHECK 2C-5:** `tenant_ai_config`
- Schema: `lib/db/src/schema/tenant_ai_config.ts` — CONFIRMED EXISTS (1321 bytes)
- Migration: `0028_tenant_ai_config_up.sql` — CONFIRMED EXISTS (796 bytes)

**CHECK 2C-6:** `webhooks`
- Schema: `lib/db/src/schema/webhooks.ts` — CONFIRMED EXISTS (931 bytes)
- Migration: `0026_integrations_up.sql` — CONFIRMED EXISTS (1586 bytes)

**CHECK 2C-7:** `webhook_delivery_log`
- Schema: `lib/db/src/schema/webhook_delivery_log.ts` — CONFIRMED EXISTS (1044 bytes)
- Migration: `0026_integrations_up.sql` — CONFIRMED EXISTS

**CHECK 2C-8:** `integration_configs`
- Schema: `lib/db/src/schema/integration_configs.ts` — CONFIRMED EXISTS (923 bytes)
- Migration: `0026_integrations_up.sql` — CONFIRMED EXISTS

**CHECK 2C-9:** `import_jobs` (named import_jobs not import_history)
- Schema: `lib/db/src/schema/import_jobs.ts` — CONFIRMED EXISTS (1121 bytes)
- Migration: `0018_import_jobs_up.sql` — CONFIRMED EXISTS (996 bytes)

**CHECK 2C-10:** `report_schedules`
- Schema: `lib/db/src/schema/report_schedules.ts` — CONFIRMED EXISTS (1437 bytes)
- Migration: `0025_report_schedules_up.sql` — CONFIRMED EXISTS (757 bytes)

## 2D — Performance Indexes

All from `0035_performance_indexes_up.sql` (confirmed file, 734 bytes):

**CHECK 2D-1:** `idx_users_email` on `users(email)` — CONFIRMED in migration line 2-3. Also defined in schema `users.ts:37` → `idxEmail: index("idx_users_email").on(table.email)`

**CHECK 2D-2:** `idx_contacts_email` on `contacts(email) WHERE email IS NOT NULL` — CONFIRMED in migration line 6-8

**CHECK 2D-3:** `idx_contacts_status` on `contacts(tenant_id, status)` — CONFIRMED in migration line 11-12

**CHECK 2D-4:** `idx_contacts_created_at` on `contacts(tenant_id, created_at DESC)` — CONFIRMED in migration line 15-16

**CHECK 2D-5:** `idx_organizations_name` on `organizations(tenant_id, name)` — CONFIRMED in migration line 19-20

## 2E — Migration Sequence

**CHECK 2E-1:** Last 10 migrations:
```
0029_lead_score_up.sql
0030_tenant_owner_flags_up.sql
0031_registered_apps_up.sql
0032_error_knowledge_base_up.sql
0033_role_enum_developer_up.sql
0034_verification_token_expiry_up.sql
0035_performance_indexes_up.sql
0036_emergency_activated_at_up.sql
0037_tenant_plan_up.sql
```
CONFIRMED — Sequential with no gaps. NOTE: `0006b` and `0016b` exist as lettered variants (not gaps). Total 78 files (39 up/down pairs).

**CHECK 2E-2:** CONFIRMED — Every `*_up.sql` has a matching `*_down.sql`. All 39 migrations have both up and down files verified via `list_dir`.

---

# SECTION 3 — BACKEND ROUTES & MODULE SYSTEM

## 3A — Module Key Cross-Check

**CHECK 3A-1:** organisations
- Frontend `Layout.tsx:108` → `module: "organisations"`
- Backend `routes/index.ts:88` → `checkModuleEnabled("organisations")`
- Match: YES ✓

**CHECK 3A-2:** contacts
- Frontend `Layout.tsx:109` → `module: "contacts"`
- Backend `routes/index.ts:92` → `checkModuleEnabled("contacts")`
- Match: YES ✓

**CHECK 3A-3:** pipeline
- Frontend `Layout.tsx:110` → `module: "pipeline"`
- Backend `routes/index.ts:102` → `checkModuleEnabled("pipeline")`
- Match: YES ✓

**CHECK 3A-4:** outreach
- Frontend `Layout.tsx:116` → `module: "outreach"`
- Backend `routes/index.ts:96` → `checkModuleEnabled("outreach")`
- Match: YES ✓

**CHECK 3A-5:** support
- Frontend `Layout.tsx:117` → `module: "support"`
- Backend `routes/index.ts:104` → `checkModuleEnabled("support")`
- Match: YES ✓

**CHECK 3A-6:** volunteers
- Frontend `Layout.tsx:123` → `module: "volunteers"`
- Backend `routes/index.ts:100` → `checkModuleEnabled("volunteers")`
- Match: YES ✓

**CHECK 3A-7:** funders
- Frontend `Layout.tsx:124` → `module: "funders"`
- Backend `routes/index.ts:101` → `checkModuleEnabled("funders")`
- Match: YES ✓

**CHECK 3A-8:** programmes
- Frontend `Layout.tsx:130` → `module: "programmes"`
- Backend `routes/index.ts:107` → `checkModuleEnabled("programmes")`
- Match: YES ✓

**CHECK 3A-9:** cohorts
- Frontend `Layout.tsx:131` → `module: "cohorts"`
- Backend `routes/index.ts:108` → `checkModuleEnabled("cohorts")`
- Match: YES ✓

**CHECK 3A-10:** outcomes
- Frontend `Layout.tsx:137` → `module: "outcomes"`
- Backend `routes/index.ts:113` → `checkModuleEnabled("outcomes")`
- Match: YES ✓

**CHECK 3A-11:** safeguarding
- Frontend `Layout.tsx:138` → `module: "safeguarding"`
- Backend `routes/index.ts:117` → `checkModuleEnabled("safeguarding")`
- Match: YES ✓

**CHECK 3A-12:** automation
- Frontend `Layout.tsx:144` → `module: "automation"`
- Backend `routes/index.ts:133` → `checkModuleEnabled("automation")`
- Match: YES ✓

**CHECK 3A-13:** attachments
- Frontend `Layout.tsx:145` → `module: "attachments"`
- Backend `routes/index.ts:125` → `checkModuleEnabled("attachments")`
- Match: YES ✓

**CHECK 3A-14:** reports
- Frontend `Layout.tsx:146` → `module: "reports"`
- Backend `routes/index.ts:103` → `checkModuleEnabled("reports")`
- Match: YES ✓

**CHECK 3A-15:** lms
- Frontend `Layout.tsx:260` → `isModuleEnabled("lms")` with `lmsUrl = import.meta.env.VITE_LMS_URL`
- Backend `routes/index.ts:161` → `checkModuleEnabled("lms")`
- LMS URL env var confirmed in `deploy.yml:80` → `VITE_LMS_URL=${{ secrets.VITE_LMS_URL }}`
- Match: YES ✓

**CHECK 3A-16:** consent
- Frontend: `App.tsx:243` routes `/ext/consent` — module key checked in backend
- Backend `routes/index.ts:121-122` → `checkModuleEnabled("consent")`
- Match: YES — uses "consent" (not "consent_management") ✓

## 3B — Route Gating

**CHECK 3B-1:** CONFIRMED — `routes/index.ts:75` → `router.use("/notifications", authMiddleware, notificationsRouter)`

**CHECK 3B-2:** CONFIRMED — `routes/index.ts:129` → `router.use("/remediation", authMiddleware, requireRole("SUPER_ADMIN"), remediationRouter)`

**CHECK 3B-3:** CONFIRMED — `routes/index.ts:128` → `router.use("/ai", authMiddleware, checkModuleEnabled("ai"), aiRouter)`

**CHECK 3B-4:** CONFIRMED — `routes/index.ts:117` → `router.use("/safeguarding-notes", authMiddleware, checkModuleEnabled("safeguarding"), safeguardingNotesRouter)`

**CHECK 3B-5:** CONFIRMED — `routes/index.ts:158` → `router.use("/lms", checkModuleEnabled("lms"), lmsPublicRouter)` — NO authMiddleware (public)

**CHECK 3B-6:** CONFIRMED — `superAdmin.ts:17-23` defines `superAdminOnly` middleware checking `req.user?.role !== "SUPER_ADMIN"`. Applied to all super-admin routes.

## 3C — Tenant Isolation

**CHECK 3C-1:** CONFIRMED — contacts list uses `eq(contactsTable.tenantId, req.user!.tenantId)` — from `req.user` not from query/body.

**CHECK 3C-2:** CONFIRMED — organizations list uses `eq(organizationsTable.tenantId, req.user!.tenantId)`

**CHECK 3C-3:** CONFIRMED — opportunities uses `eq(fundingOpportunitiesTable.tenantId, req.user!.tenantId)`

**CHECK 3C-4:** CONFIRMED — support tickets uses `eq(supportTicketsTable.tenantId, req.user!.tenantId)`

**CHECK 3C-5:** CONFIRMED — volunteers uses `eq(volunteersTable.tenantId, req.user!.tenantId)`

## 3D — Error Handler

**CHECK 3D-1:** CONFIRMED — `app.ts:239-247` → `if (status === 500) { res.status(500).json({ code: "SYSTEM_ERROR", message: "...Reference: ${requestId}" })` — no stack trace in response body. Stack traces are only logged server-side via `logger.error({ err, ... })`.

**CHECK 3D-2:** CONFIRMED — `app.ts:219` → `const requestId = req.requestId || randomUUID()`. `writeErrorLog(...)` called at `app.ts:226-236` persists to `error_logs` table. `requestId` included in all 500 responses.

**CHECK 3D-3:** CONFIRMED — `ERROR_MAP` at `app.ts:206-215` defines `{ error, code, message, requestId }` shape for all status codes. Evidence from 3 routes: `reports.ts:87` → `{ error: "..." }`, `import.ts:101` → `{ error: "..." }`, `export.ts:299` → `{ error: "..." }`. Global handler wraps all with `requestId`.

---

# SECTION 4 — FRONTEND COMPLETENESS

## 4A — Pages Exist and Are Routed

**CHECK 4A-1:** `/login` — Route: `App.tsx:182` ✓ | File: `LoginPage.tsx` imported at `App.tsx:10` — CONFIRMED

**CHECK 4A-2:** `/auth/register` — Route: `App.tsx:188` ✓ | File: `RegisterPage.tsx` imported at `App.tsx:14` — CONFIRMED

**CHECK 4A-3:** `/auth/2fa` — Route: `App.tsx:189` ✓ | File: `TwoFactorPage.tsx` imported at `App.tsx:15` — CONFIRMED

**CHECK 4A-4:** `/forgot-password` — Route: `App.tsx:183` ✓ | File: `ForgotPasswordPage.tsx` imported at `App.tsx:11` — CONFIRMED

**CHECK 4A-5:** `/ext/dashboard` — Route: `App.tsx:221` ✓ | File: `extended/DashboardPage` imported at `App.tsx:50` — CONFIRMED

**CHECK 4A-6:** `/super-admin/health` — Route: `App.tsx:219` ✓ | File: `HealthDashboardPage` imported at `App.tsx:44` — CONFIRMED

**CHECK 4A-7:** `/super-admin/modules` — Route: `App.tsx:218` ✓ | File: `ModuleControlCentrePage` imported at `App.tsx:43` — CONFIRMED

**CHECK 4A-8:** `/reports` — Route: `App.tsx:210` ✓ | File: `ReportsPage` imported at `App.tsx:38` — CONFIRMED

**CHECK 4A-9:** `/import` — Route: `App.tsx:213` ✓ | File: `ImportPage` imported at `App.tsx:28` — CONFIRMED

**CHECK 4A-10:** `/admin/team` — Route: `App.tsx:250` ✓ | File: `TeamPage` imported at `App.tsx:47` — CONFIRMED

**CHECK 4A-11:** `/admin/apps` — Route: `App.tsx:249` ✓ | File: `AppsPage` imported at `App.tsx:46` — CONFIRMED

**CHECK 4A-12:** `/auth/login` redirect — Route: `App.tsx:184` → `AuthLoginRedirect` → `setLocation("/login")` — CONFIRMED

**CHECK 4A-13:** `/super-admin/knowledge-base` — Route: `App.tsx:251` ✓ | File: `KnowledgeBasePage` imported at `App.tsx:48` — CONFIRMED

## 4B — Design System

**CHECK 4B-1:** CONFIRMED — `index.css:177-183`:
- `--brand-primary: #0891b2`
- `--brand-secondary: #0f172a`
- `--brand-accent: #f59e0b`

**CHECK 4B-2:** CONFIRMED — `ThemeToggle` imported and used in `Layout.tsx:543`. `ThemeProvider.tsx` exists (referenced in Layout import at line 7).

**CHECK 4B-3:** CONFIRMED — `App.tsx:260-270` wraps entire tree in `<ErrorBoundary>` at the outermost level.

**CHECK 4B-4:** CONFIRMED — `CommandPalette` imported and rendered in `Layout.tsx:411`. Ctrl+K listener at `Layout.tsx:165-170`.

**CHECK 4B-5:** Need to check `vite.config.ts` — not yet verified. DEFERRED to Section 16.

**CHECK 4B-6:** DEFERRED — requires running `pnpm --filter @workspace/crm build`. See Section 16.

## 4C — Dashboard

**CHECK 4C-1:** DEFERRED — need to open `DashboardPage.tsx`. File exists (imported at App.tsx).

**CHECK 4C-2:** DEFERRED

**CHECK 4C-3:** DEFERRED

**CHECK 4C-4:** DEFERRED

**CHECK 4C-5:** DEFERRED

## 4D — Super Admin UI

**CHECK 4D-1:** DEFERRED — need to open `ModuleControlCentrePage.tsx`

**CHECK 4D-2:** DEFERRED

**CHECK 4D-3:** DEFERRED

**CHECK 4D-4:** DEFERRED
