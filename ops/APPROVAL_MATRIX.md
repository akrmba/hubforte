# Hubforte Change Approval Matrix

**Scope:** Classification system for all changes to the Hubforte codebase. Every change must be assigned a level before execution.
**Last updated:** 2026-04-09

---

## Level 1 — Safe (Agent executes with logging only)

**Gate:** No approval required. Log the change in the git commit message.

| Change Type | Examples in This Codebase |
|---|---|
| Text, label, UI copy fixes | Button text in any `artifacts/crm/src/pages/*.tsx`, placeholder strings, error message wording |
| Non-critical frontend display bugs | CSS/Tailwind class fixes, Recharts chart formatting, Lucide icon swaps, Framer Motion animation tweaks |
| Minor validation fixes on non-critical routes | Adjusting Zod schema constraints on non-auth routes, fixing pagination parameter parsing |
| Read-only query fixes | Fixing `SELECT` queries in list/detail endpoints (e.g., wrong column in `GET /api/contacts`, missing join in `GET /api/funders/:id`) |
| Documentation updates | Changes to `SYSTEM_MAP.md`, `PROJECT_INTELLIGENCE.md`, this file, or `ops/*.md` |
| Sidebar ordering or grouping | Reordering items in `artifacts/crm/src/components/Layout.tsx` sidebar sections |

**What Level 1 is NOT:** Any change that could alter data writes, auth behavior, or permission checks — even if it looks minor.

---

## Level 2 — Moderate (Agent executes after staging verification)

**Gate:** Agent must verify the change works in a local/staging environment before deploying. No production deploy without a manual smoke test.

| Change Type | Examples in This Codebase |
|---|---|
| API response handling fixes | Fixing error handling in `artifacts/crm/src/lib/api.ts` (30-second timeout, error parsing), fixing response shape in any route handler |
| Integration retry logic changes | Modifying the error summariser fallback patterns in `src/lib/errorSummariser.ts`, adjusting campaign worker retry timing (`worker.ts:136` — 72-second delay) |
| Admin workflow bugs | Fixes to `src/routes/admin.ts` (user list, role update, invite flow), fixes to `artifacts/crm/src/pages/AdminPage.tsx` |
| Non-critical automation changes | Adjusting log maintenance schedule in `src/lib/logMaintenance.ts` (retention: 30d request_logs, 90d resolved errors, 180d unresolved), modifying error summariser interval (currently 30 seconds) |
| New feature flags | Inserting new rows into `feature_flags` table, adding `checkModuleEnabled('new_module')` to new routes in `routes/index.ts` or `routes/yf/index.ts` |
| Adding new YF routes following existing patterns | New route files in `artifacts/api-server/src/routes/yf/` that follow the pattern of `trusts.ts`, `schools.ts`, etc. — standard CRUD with `authMiddleware` + `checkModuleEnabled()` |
| Adding new pages following existing patterns | New page components in `artifacts/crm/src/pages/` that follow existing patterns (React Query hooks, pagination, api.ts calls) |
| Template engine changes | Modifying `src/lib/templateEngine.ts` `mergeTemplate()` — adding new `{{variable}}` tokens |
| Notification logic | Changes to `src/lib/notifications.ts` (`createNotification()`, `notifyAdminUsers()`) |

**Staging verification must include:**
1. The specific feature works as expected
2. No console errors in the browser
3. API returns expected status codes
4. No new entries in `error_logs` table during test

---

## Level 3 — High Risk (Explicit approval checkpoint required before execution)

**Gate:** A Change Request (`ops/CHANGE_REQUEST_TEMPLATE.md`) must be filled out AND approved before any code is written. Agent must present the completed form and wait for explicit go-ahead.

| Change Type | Files Affected | Why It's High Risk |
|---|---|---|
| **Any DB schema change or migration** | `lib/db/src/schema/*.ts`, `lib/db/migrations/*.sql`, `drizzle.config.ts` | Schema changes use SQL migration files with up/down pairs (see `docs/SCHEMA_SOURCE_OF_TRUTH.md`). `drizzle-kit push` is blocked. Rollback via `_down.sql` files. |
| **Auth or session logic changes** | `src/lib/auth.ts` (authMiddleware, generateToken, verifyToken, csrfCheck) | Breaking auth locks out ALL users. JWT is stateless — no way to invalidate individual tokens. |
| **Permission model changes** | `src/lib/permissions.ts` (canDo, requirePermission), `src/lib/auth.ts:113-138` (requireRole) | Wrong permission change could expose restricted data or lock out legitimate users. |
| **Campaign send logic changes** | `src/routes/worker.ts`, `src/routes/outreach.ts`, `src/lib/gmail.ts` | No idempotency guard. Wrong change could cause duplicate sends to real people. |
| **Remediation policy logic** | `src/lib/remediationEngine.ts`, `src/routes/remediation.ts` | Auto-executes changes to data based on policies. Wrong policy logic could mass-modify records. |
| **Any change to how feature flags default** | `src/lib/featureFlags.ts:25` (`flag ? flag.enabled : false`) | Changing default from `false` to `true` would enable ALL modules for ALL users instantly. |
| **Any change to SUPER_ADMIN bypass logic** | `src/lib/featureFlags.ts:41-44`, `src/lib/auth.ts:119-123` | Removing SUPER_ADMIN bypass could lock out the only user who can fix feature flag issues. |
| **Gmail credential handling** | `src/lib/gmail.ts`, `src/routes/auth.ts` (OAuth flow, callback) | Mishandling refresh tokens could break email sending for all users. Tokens are stored in `gmail_credentials` table. |
| **Rate limiter configuration** | `src/lib/rateLimiter.ts` | Too restrictive locks out legitimate users. Too permissive enables brute force. |
| **CORS configuration** | `src/app.ts` (ALLOWED_ORIGINS) | Wrong CORS config blocks all frontend requests or opens the API to any origin. |

**The approval checkpoint must confirm:**
1. The Change Request form is complete
2. The rollback method is viable
3. The risk is understood and accepted
4. A backup plan exists if the change fails

---

## Level 4 — Critical (Containment + backup + approval + rollback plan required)

**Gate:** Before ANY code change:
1. Contain the immediate risk (e.g., disable the affected feature, pause campaigns)
2. Back up affected database tables
3. Fill out the Change Request form with a tested rollback procedure
4. Get explicit approval
5. Execute the change
6. Verify the fix
7. If verification fails, execute the rollback immediately

| Change Type | Containment Action Required | Why It's Critical |
|---|---|---|
| **Security vulnerabilities** | Disable affected routes or features via feature flags. If auth is compromised, rotate `JWT_SECRET` (invalidates all sessions). | Active exploitation could expose user data, credentials, or allow unauthorized access. |
| **Data integrity risk** | Stop writes to affected tables. Pause any active campaigns. Take a DB snapshot via Neon dashboard. | No foreign key constraints in core CRM tables. Orphaned records are possible and hard to detect. |
| **Any production outage scenario** | Follow the relevant runbook in `ops/INCIDENT_RUNBOOK.md` first. Contain before fixing. | Users are actively blocked from working. Every minute of downtime has direct impact. |
| **Bulk data modifications** | Take a full DB backup via Neon. Test the modification on a copy first. | Direct SQL updates are irreversible without a backup. Always back up before bulk changes. |
| **Deletion of production data** | Snapshot the table(s) before any `DELETE`. Verify the `WHERE` clause matches only intended rows. | No soft-delete pattern exists. `DELETE` is permanent. No recycle bin. |
| **Any change to password/token handling** | Notify affected users proactively. Prepare for session invalidation. | `JWT_SECRET` rotation invalidates ALL sessions. Password hash changes lock individual users out. `password_reset_tokens` have 1-hour expiry. |
| **Worker secret rotation** | Coordinate API server and worker container updates simultaneously. | Mismatch between `WORKER_SECRET` on API and worker stops ALL campaign processing. |
| **Database URL change** | Schedule maintenance window. Test new connection string before switching. | Wrong `DATABASE_URL` prevents server from starting (`index.ts` throws). |

**Rollback plan must be tested before execution and must include:**
1. Exact SQL or code to revert the change
2. Time estimate for rollback execution
3. Verification query to confirm rollback succeeded
4. Communication plan for affected users

---

## Quick Reference

| Level | Gate | Approval | Rollback Required | Change Request Form |
|---|---|---|---|---|
| 1 — Safe | Git commit log | No | No | No |
| 2 — Moderate | Staging verification | No | Recommended | No |
| 3 — High Risk | Approval checkpoint | **Yes** | **Yes** | **Yes** |
| 4 — Critical | Containment + backup + approval | **Yes** | **Yes, tested** | **Yes** |

When in doubt about the level, **always classify up**. A Level 2 change treated as Level 3 wastes 10 minutes. A Level 3 change treated as Level 2 could break production.
