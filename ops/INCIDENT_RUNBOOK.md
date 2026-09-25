# Hubforte Incident Runbook

**Scope:** Operational runbooks for the 10 most likely production failure scenarios in Hubforte.
**Last updated:** 2026-05-02
**Source of truth for file paths, env vars, and table names:** `SYSTEM_MAP.md`

> **Recovery entry point:** If you're unsure which runbook to use, start at `docs/RECOVERY_SOURCE_OF_TRUTH.md`.

---

## Runbook 1 — Gmail Send Failure

**Symptom:** Single email send from `/api/outreach/send` returns an error. User sees "Failed to send email" in the UI. Pino logs show `event: 'external_api_call', service: 'gmail', success: false`.

**First check — Gmail credentials exist for the sending user:**
```sql
SELECT id, user_id, expires_at FROM gmail_credentials WHERE user_id = '<USER_ID>';
```
If no row exists, the user has not connected Gmail. Direct them to Settings > Gmail Connection (`/settings`).

**Second check — OAuth token refresh is succeeding:**
- Check Pino stdout logs for `event: 'external_api_call', service: 'google', method: 'oauth2.token_refresh', success: false`.
- The refresh call is in `artifacts/api-server/src/lib/gmail.ts:24-49` (`getAccessToken()`).
- Verify env vars are set: `GMAIL_CLIENT_ID` (falls back to `GOOGLE_CLIENT_ID`) and `GMAIL_CLIENT_SECRET` (falls back to `GOOGLE_CLIENT_SECRET`).
- Token refresh endpoint: `https://oauth2.googleapis.com/token`.

**Containment action:**
- If one user's credentials are broken, other users with valid credentials are unaffected.
- If `GMAIL_CLIENT_ID` or `GMAIL_CLIENT_SECRET` is missing/wrong, ALL Gmail sends fail. Pause any active campaigns immediately via `PATCH /api/campaigns/:id` → status = `PAUSED`.

**Fix path:**
1. If env vars missing: update `GMAIL_CLIENT_ID` and `GMAIL_CLIENT_SECRET` in GitHub Actions Secrets (`PROD_ENV`), then redeploy via GitHub Actions.
2. If user's refresh token is revoked: user must re-authorize via Settings > Gmail Connection (`GET /api/auth/gmail` starts OAuth flow, callback at `GET /api/gmail/callback`).
3. If Google API quota exceeded: wait for quota reset (per-day limit). Check Google Cloud Console for the project's quota usage.

**Verification step:**
- Send a test email via the UI (Contacts > select contact > Send Email).
- Confirm Pino logs show `event: 'external_api_call', service: 'gmail', method: 'messages.send', success: true`.

---

## Runbook 2 — Campaign Not Processing

**Symptom:** Campaign status is `SENDING` but no emails are going out. `campaign_contacts` rows remain `PENDING`. No new `outbound_emails` rows being created.

**First check — Is the external worker running?**
- The campaign worker is a standalone Docker container on Oracle Cloud.
- It polls `GET /api/campaigns?status=SENDING` every 60 seconds.
- Check if the container is running and has network access to the API server.
- Worker source: `worker/run.ts`.

**Second check — Does `WORKER_SECRET` match between worker and API server?**
- The worker sends `x-worker-secret` header on `POST /api/worker/process-campaign` (`artifacts/api-server/src/routes/worker.ts:13-18`).
- The API server compares it against `process.env.WORKER_SECRET` (`worker.ts:13`).
- If they don't match, the worker gets `401 Unauthorized`.
- Check worker container's env vars match the `WORKER_SECRET` in GitHub Actions Secrets (`PROD_ENV`).

**Third check — Campaign state and Gmail credentials:**
```sql
-- Campaign must be in SENDING status
SELECT id, name, status, owner_id FROM campaigns WHERE id = '<CAMPAIGN_ID>';

-- Campaign owner must have Gmail credentials
SELECT id, user_id FROM gmail_credentials WHERE user_id = '<OWNER_ID>';

-- Check for PENDING contacts
SELECT COUNT(*) FROM campaign_contacts WHERE campaign_id = '<CAMPAIGN_ID>' AND status = 'PENDING';
```
- If campaign status is `PAUSED`, it was intentionally stopped (`worker.ts:52` checks this mid-loop).
- If campaign owner has no `gmail_credentials` row, worker returns `400: Campaign owner has no Gmail account connected` (`worker.ts:33-36`).

**Containment action:**
- Do NOT restart the worker mid-send — contacts left in `PENDING` state will be retried, but there is no idempotency guard on the Gmail send side. Duplicate sends are possible if the worker crashed mid-contact.
- Check `campaign_contacts` for any contacts with `status = 'SENT'` to confirm partial progress.

**Fix path:**
1. If worker is down: restart the Docker container. It will resume polling.
2. If `WORKER_SECRET` mismatch: update `WORKER_SECRET` in GitHub Actions Secrets (`PROD_ENV`) and redeploy.
3. If Gmail credentials missing: campaign owner must connect Gmail via Settings.
4. If contacts are stuck in `PENDING` after a crash: manually verify which contacts already received emails (check `outbound_emails` table) before allowing the worker to retry.

**Verification step:**
- After fix, watch for new `outbound_emails` rows appearing.
- Check Pino logs for `event: 'external_api_call', service: 'gmail', success: true`.
- 72-second gap between sends is normal (`worker.ts:136`).

---

## Runbook 3 — Login Failure for All Users

**Symptom:** No user can log in. Login attempts return 401 or 500. Pino logs show `event: 'login_failure'` for every attempt.

**First check — Is the server running at all?**
- Hit `GET /api/healthz` — should return `{ status: "ok" }`.
- If no response: SSH into the OCI server and check container status: `docker compose -f docker-compose.prod.yml ps`. The server reads env vars from the injected `.env.prod` file.

**Second check — Is `JWT_SECRET` set?**
- The server refuses to start without `JWT_SECRET` or `SESSION_SECRET` (`app.ts:15-19`, fatal `process.exit(1)`).
- `getJwtSecret()` in `auth.ts:24-32` throws if neither is set.
- If the server IS running but tokens are invalid, the secret may have changed since existing tokens were signed. All existing sessions become invalid immediately.

**Third check — Database connection:**
- Hit `GET /api/health/detailed` — returns DB latency.
- `DATABASE_URL` is required (`index.ts` throws on missing).
- The login flow queries `users` table (`auth.ts:70-79`). If the DB is unreachable, login returns 500.
- Check Neon dashboard for connection status and quota.

**Fourth check — Cookie settings:**
- Login sets cookie `crm_session` with `httpOnly: true`, `sameSite: 'strict'` (`routes/auth.ts`).
- In production (`NODE_ENV=production`), cookie has `secure: true` — requires HTTPS.
- If the app is served over HTTP in production, the cookie will not be sent by the browser.

**Containment action:**
- If `JWT_SECRET` was rotated: all users must log in again. There is no session table to clear — sessions are stateless JWTs.
- If DB is down: no containment possible until Neon recovers.

**Fix path:**
1. Missing `JWT_SECRET`: add it to GitHub Actions Secrets (`PROD_ENV`) and redeploy.
2. Rotated `JWT_SECRET`: inform users they need to log in again. No data loss.
3. DB down: check Neon status page, verify `DATABASE_URL` is correct.
4. Cookie/HTTPS mismatch: ensure `NODE_ENV` matches the actual protocol.

**Verification step:**
- Log in as any user via `/login`.
- Confirm `crm_session` cookie is set in browser DevTools > Application > Cookies.
- Confirm `GET /api/auth/me` returns the user profile.

---

## Runbook 4 — Login Failure for One User

**Symptom:** A specific user cannot log in, but other users can. Login returns "Invalid credentials".

**First check — Does the user exist and are they active?**
```sql
SELECT id, email, name, role, active, password_hash IS NOT NULL as has_password, invite_token
FROM users WHERE email = '<USER_EMAIL>';
```
- If no row: user was never created. Admin must invite via `/admin`.
- If `active = false`: account is deactivated. Admin must reactivate via `PATCH /api/admin/users/:id`.
- If `password_hash IS NULL`: user was invited but never accepted. Check `invite_token` and `invite_token_expires_at`.

**Second check — Is the password correct?**
- The login route uses bcrypt comparison (`routes/auth.ts`).
- The login response deliberately says "Invalid credentials" for both wrong email and wrong password (no user enumeration).
- If the user forgot their password: use the password reset flow (`/forgot-password`).

**Containment action:**
- Single-user issue — no system-wide impact. Other users are unaffected.

**Fix path:**
1. If account inactive: `UPDATE users SET active = true WHERE id = '<USER_ID>';` or use Admin Panel.
2. If invite not accepted: re-invite via `POST /api/admin/users/invite` (Admin Panel > Invite User).
3. If password forgotten: user clicks "Forgot password" on login page, or admin can reset via DB:
   ```sql
   -- Generate a bcrypt hash for a new password and update directly
   UPDATE users SET password_hash = '<NEW_BCRYPT_HASH>' WHERE id = '<USER_ID>';
   ```

**Verification step:**
- User logs in successfully.
- `GET /api/auth/me` returns their profile with correct role.

---

## Runbook 5 — AI Features Not Responding

**Symptom:** AI features (draft email, summarise contact, suggest next action, clean data, diagnose ticket) return errors. UI shows "AI features are unavailable" or similar error messages.

**First check — Is `OPENAI_API_KEY` set?**
- `artifacts/api-server/src/lib/ai.ts:9-18` — `getOpenAI()` throws `"OPENAI_API_KEY is not set. AI features are unavailable."` if the env var is missing.
- The OpenAI client is lazily initialized — the error only appears on first AI call, not at startup.
- All AI endpoints return `{ success: false, error: message }` on failure — the app functions fully without AI.

**Second check — OpenAI API rate limits or quota:**
- Check the OpenAI dashboard for the API key's usage and rate limits.
- Model used: `gpt-4o-mini` (per `ai.ts`).
- If rate-limited, errors will include OpenAI's rate limit message in the response.

**Third check — Check `ai_logs` table for error patterns:**
```sql
SELECT id, user_id, feature, success, error, latency_ms, created_at
FROM ai_logs
ORDER BY created_at DESC
LIMIT 20;
```
- The `logAiInteraction()` function (`ai.ts:20-50`) logs every AI call with `success` boolean and `error` string.
- Pino logs also show `event: 'external_api_call', service: 'openai'`.

**Containment action:**
- AI features are non-critical. The app works fully without them.
- The error summariser (`src/lib/errorSummariser.ts`) falls back to 7-pattern regex matching when OpenAI is unavailable.
- No need to pause or disable anything.

**Fix path:**
1. Missing API key: add `OPENAI_API_KEY` to GitHub Actions Secrets (`PROD_ENV`) and redeploy.
2. Rate limited: wait for rate limit window to pass, or upgrade OpenAI plan.
3. Invalid API key: generate a new key in OpenAI dashboard, update GitHub Actions Secrets (`PROD_ENV`) and redeploy.

**Verification step:**
- Use any AI feature in the UI (e.g., Contacts > select contact > "Summarise Relationship").
- Check `ai_logs` table for a new row with `success = true`.

---

## Runbook 6 — Import Failing

**Symptom:** CSV import via `/import` page fails during validation or during the actual import. User sees validation errors or a 500 error.

**First check — CSV format validation:**
- The validation endpoint is `POST /api/import/validate` (requires OPERATOR+ role).
- Validation runs before import — if validation fails, the import button is disabled.
- Check the error message returned to the UI for specific field-level validation errors.

**Second check — Which import type is failing?**
- Contact import: `POST /api/import/contacts` — writes to `contacts` table.
- Organisation import: `POST /api/import/organizations` — writes to `organizations` table.
- Both require OPERATOR+ role (`requireRole` in `routes/index.ts`).

**Third check — Database write errors:**
- Check `error_logs` table for recent errors:
  ```sql
  SELECT id, error_message, route, method, created_at
  FROM error_logs
  WHERE route LIKE '%import%'
  ORDER BY created_at DESC
  LIMIT 10;
  ```
- Common issues: duplicate email in contacts (unique constraint), missing required fields (`first_name`, `last_name`, `email` for contacts; `name` for organisations).
- The contacts endpoint has duplicate email detection — check if import is failing on a duplicate.

**Containment action:**
- Import failures do not affect existing data — the operation fails before committing if validation fails.
- If a partial import occurred (some rows written, then error), check the DB for partially imported records.

**Fix path:**
1. CSV format issue: ensure headers match expected fields. Provide the user with a sample CSV.
2. Duplicate emails: remove duplicates from CSV or update existing contacts instead.
3. DB write error: check `error_logs` for the specific constraint violation.
4. Permission error (403): verify user has OPERATOR or higher role.

**Verification step:**
- Upload a small test CSV (2-3 rows) via the Import page.
- Confirm validation passes and rows appear in the contacts/organisations list.

---

## Runbook 7 — Feature Not Visible for a User

**Symptom:** A user cannot see a sidebar menu item or gets 403 "This module is currently disabled" when accessing a feature.

**First check — Is the feature flag enabled?**
```sql
SELECT module, enabled, updated_by, updated_at FROM feature_flags;
```
- Feature flag middleware: `artifacts/api-server/src/lib/featureFlags.ts`.
- `checkModuleEnabled()` (line 38-53) checks the `feature_flags` table with 1-minute in-memory cache (`CACHE_TTL = 60_000`, line 11).
- **If no row exists for a module, it defaults to DISABLED** (`isModuleEnabled()` line 25: `flag ? flag.enabled : false`).
- Module names — Core: `organisations`, `contacts`, `outreach`, `volunteers`, `funders`, `pipeline`, `reports`, `support`. YF: `yf_trusts`, `yf_schools`, `yf_sponsors`, `yf_programmes`, `yf_students`, `yf_volunteers`.

**Second check — Is the user a SUPER_ADMIN?**
- SUPER_ADMIN bypasses ALL feature flag checks unconditionally (`featureFlags.ts:41-44`).
- If the user IS a SUPER_ADMIN and still can't see the feature, the issue is elsewhere (frontend bug, route not mounted).
- If the user is NOT a SUPER_ADMIN, the flag must be enabled.

**Third check — Role-based visibility in the sidebar:**
- Sidebar is rendered in `artifacts/crm/src/components/Layout.tsx`.
- The `useFeatureFlags()` hook hides disabled modules from the sidebar.
- System section (Settings, Admin Panel, Super Admin) is only visible to ADMIN+ roles.
- Cache may be stale for up to 1 minute after a flag is toggled.

**Containment action:**
- Feature visibility issues affect only the specific user/role — no system-wide impact.
- SUPER_ADMIN can always access everything regardless of flags.

**Fix path:**
1. Flag missing: insert a row via Super Admin panel (`/super-admin`) or directly:
   ```sql
   INSERT INTO feature_flags (id, module, enabled) VALUES ('<UUID>', '<MODULE_NAME>', true);
   ```
2. Flag disabled: toggle via Super Admin panel (`PATCH /api/super-admin/feature-flags/:module`).
3. Cache stale: `invalidateModuleCache()` is called on toggle. Wait up to 60 seconds for cache to expire, or redeploy to clear in-memory cache.
4. Role too low: upgrade user role via Admin Panel (`PATCH /api/admin/users/:id`).

**Verification step:**
- Log in as the affected user.
- Confirm the feature appears in the sidebar.
- Navigate to the feature page and confirm data loads (no 403).

---

## Runbook 8 — YF Data Not Loading or Corrupted

**Symptom:** Hubforte pages (`/yf/*`) show no data, loading errors, or display incorrect/corrupted data. API calls to `/api/yf/*` return 500 or empty results.

**First check — Are YF feature flags enabled?**
```sql
SELECT module, enabled FROM feature_flags
WHERE module IN ('yf_trusts', 'yf_schools', 'yf_sponsors', 'yf_programmes', 'yf_students', 'yf_volunteers');
```
- All YF routes are gated by `checkModuleEnabled()` in `routes/yf/index.ts`.
- If flags are disabled, API returns 403 "This module is currently disabled".

**Second check — PostgreSQL connection:**
- Hit `GET /api/health/detailed` — check `dbLatency` field.
- YF tables are in the same Neon database as core CRM tables.
- If DB is slow or unreachable, ALL endpoints fail, not just YF.

**Third check — Schema state:**
- YF tables: `yf_trusts`, `yf_schools`, `yf_sponsors`, `yf_contacts`, `yf_funding_opportunities`, `yf_programmes`, `yf_students`, `yf_volunteers`, `yf_placements`, `yf_activities`.
- Schema is managed via SQL migration files in `lib/db/migrations/` (see `docs/SCHEMA_SOURCE_OF_TRUTH.md`).
- If a migration failed mid-way, tables may be in an inconsistent state.
- Check if all expected tables exist:
  ```sql
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name LIKE 'yf_%';
  ```

**Fourth check — Foreign key integrity (application-layer only):**
- YF tables use `.references()` in Drizzle schema for `yf_schools.trust_id → yf_trusts.id`, `yf_programmes.school_id → yf_schools.id`, etc.
- `yf_activities` uses polymorphic linking with NO FK constraints.
- Orphaned records are possible if application logic has bugs.

**Containment action:**
- If data appears corrupted, do NOT apply any migrations without first backing up the database.
- YF data is isolated from core CRM data — core CRM features are unaffected.

**Fix path:**
1. Flags disabled: enable via Super Admin panel.
2. DB unreachable: check Neon dashboard, verify `DATABASE_URL`.
3. Missing tables: apply the relevant SQL migration from `lib/db/migrations/` — but back up first. See `docs/SCHEMA_SOURCE_OF_TRUTH.md`.
4. Corrupted data: identify the specific records and fix via direct SQL. Check `error_logs` for any write errors that may have caused partial writes.

**Verification step:**
- Navigate to `/yf/dashboard` — confirm stats load.
- Navigate to `/yf/schools` — confirm school list loads.
- Check `GET /api/health/detailed` for normal DB latency.

---

## Runbook 9 — Slow Performance

**Symptom:** Pages load slowly, API responses take >2 seconds, users report the app feeling sluggish.

**First check — Check `request_logs` for slow requests:**
```sql
SELECT path, method, duration_ms, status_code, timestamp
FROM request_logs
WHERE slow_request = true
ORDER BY timestamp DESC
LIMIT 20;
```
- The `slow_request` flag is set in `app.ts` for requests exceeding a threshold.
- `request_logs` table has indexes on `idx_slow_request`, `idx_timestamp`, `idx_status_code`, `idx_user_id`.

**Second check — Database query performance:**
- Hit `GET /api/health/detailed` — check `dbLatency` (time for a simple query).
- If DB latency is high (>100ms), the issue is at the Neon level.
- Check Neon dashboard for connection pool exhaustion, compute scaling, or regional latency.

**Third check — Campaign worker backlog:**
- If the worker is processing a large campaign, it holds a DB connection and creates records in a loop with 72-second delays (`worker.ts:136`).
- Check for active campaigns:
  ```sql
  SELECT id, name, status, owner_id FROM campaigns WHERE status = 'SENDING';
  SELECT COUNT(*) FROM campaign_contacts WHERE campaign_id = '<ID>' AND status = 'PENDING';
  ```
- A campaign with hundreds of contacts takes hours (72s x N contacts).

**Fourth check — Background job interference:**
- Error summariser runs every 30 seconds (`src/lib/errorSummariser.ts`, started at `index.ts:44`).
- Log maintenance runs daily at 3am (`src/lib/logMaintenance.ts`, started at `index.ts:45`).
- If error_logs has many unsummarised rows, the summariser may be creating load.

**Fifth check — Super Admin diagnostics:**
- `GET /api/super-admin/diagnostics` (requires SUPER_ADMIN) returns: top 10 errors, slow endpoints, request timeline, auth events.
- This is the most comprehensive single-call diagnostic.

**Containment action:**
- If a specific endpoint is slow, it does not block other endpoints (no shared connection pool lock).
- If the worker is causing load, pause the active campaign.

**Fix path:**
1. Slow DB: check Neon compute tier, consider upgrading. Verify `DATABASE_URL` uses the closest region.
2. Slow endpoint: identify the query in the route handler, add DB indexes if missing. Core CRM tables have NO foreign key constraints and limited indexes.
3. Worker backlog: pause the campaign, let the system recover, then resume.
4. Error summariser load: if `error_logs` has thousands of unsummarised rows, manually mark some as summarised or reduce the backlog.

**Verification step:**
- Check `GET /api/health/detailed` for DB latency <50ms.
- Load the Dashboard (`/dashboard`) — confirm it loads in <2 seconds.
- Check `request_logs` — confirm no new `slow_request = true` entries.

---

## Runbook 10 — Password Reset Not Sending

**Symptom:** User clicks "Forgot password" and submits their email, but never receives the reset email. The UI always shows a success message (by design — no email enumeration).

**First check — Does a password reset token exist?**
```sql
SELECT token, user_id, expires_at, created_at
FROM password_reset_tokens
WHERE user_id = (SELECT id FROM users WHERE email = '<USER_EMAIL>')
ORDER BY created_at DESC
LIMIT 1;
```
- Tokens expire after 1 hour (`routes/auth.ts`).
- If no token exists, the user may have entered the wrong email, or the token creation failed.

**Second check — Are Gmail credentials available for sending?**
- The forgot-password handler (`routes/auth.ts`) checks if ANY `gmail_credentials` row exists to send the email.
- If no Gmail credentials exist for any user, the reset email cannot be sent.
- Fallback: in development, the token is logged to the console (`console.log`). Check Pino stdout for the token.

**Third check — Is the email actually being sent?**
- Check Pino logs for `event: 'external_api_call', service: 'gmail'` around the time of the reset request.
- The reset email uses `GMAIL_FROM_ADDRESS` (defaults to `noreply@hubforte.com`).
- The reset link uses `APP_URL` env var (defaults to `http://localhost:5173`).
- If `APP_URL` is wrong, the link in the email will point to the wrong domain.

**Containment action:**
- Password reset failure does not affect other users or system functionality.
- If urgent: an admin can reset the password directly in the DB (see Runbook 4).

**Fix path:**
1. No Gmail credentials: at least one user (ideally an admin) must connect Gmail via Settings.
2. Wrong `APP_URL`: update `APP_URL` in GitHub Actions Secrets (`PROD_ENV`) to the production URL (e.g., `https://app.hubforte.com`) and redeploy.
3. Wrong `GMAIL_FROM_ADDRESS`: set to a valid sending address.
4. Token expired: user must request a new reset. Tokens last 1 hour.
5. Emergency password reset: admin updates `password_hash` directly (see Runbook 4 fix path).

**Verification step:**
- Request a password reset for a test account.
- Check `password_reset_tokens` table for a new row.
- Check Pino logs for a successful Gmail send.
- Click the link in the email and confirm the reset form loads at `/reset-password`.
- Set a new password and log in.
