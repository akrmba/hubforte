# Hubforte Postmortem Report

**Required for:** Every production incident, regardless of severity.
**When to fill out:** Within 24 hours of incident resolution.

---

## Incident Summary

### Incident ID
<!-- Format: INC-YYYY-MM-DD-NNN, e.g., INC-2026-04-09-001 -->

### Date/Time Detected
<!-- When was the issue first noticed? Include timezone. -->

### Date/Time Resolved
<!-- When was the fix confirmed working in production? Include timezone. -->

### Duration
<!-- Total time from detection to resolution. -->

### Severity
<!-- Use the following scale: -->
- [ ] **SEV-1 Critical** — All users blocked, data at risk, or security breach. (Examples: DB unreachable, JWT_SECRET exposed, auth completely broken)
- [ ] **SEV-2 Major** — Core feature broken for all users but workaround exists. (Examples: campaign sends failing, Gmail integration down, all AI features broken)
- [ ] **SEV-3 Moderate** — Feature broken for a subset of users. (Examples: single user can't log in, one YF module returning errors, import failing for specific CSV format)
- [ ] **SEV-4 Minor** — Cosmetic or low-impact issue noticed in production. (Examples: wrong label on a button, sidebar ordering wrong, chart not rendering for one report type)

---

## Impact

### Affected Users/Features
<!-- Which users were affected? Which features were broken? Be specific. -->
<!-- Reference feature flag modules if applicable: organisations, contacts, outreach, volunteers, funders, pipeline, reports, support, yf_trusts, yf_schools, yf_sponsors, yf_programmes, yf_students, yf_volunteers -->

### What Clients Experienced
<!-- Describe what users actually saw. Error messages, blank screens, missing data, slow responses. Include exact error text if available. -->
<!-- Check these sources for user-visible errors:
     - error_logs table (source = 'frontend' for UI errors)
     - Browser console errors captured by ErrorBoundary (src/components/ErrorBoundary.tsx)
     - API error responses (format: { error: string, requestId: string })
-->

---

## Timeline of Events

<!-- Chronological sequence from first sign of trouble to resolution confirmed. Include: -->
<!-- - When the issue started (or best estimate) -->
<!-- - When it was detected and by whom -->
<!-- - What investigation steps were taken -->
<!-- - When the root cause was identified -->
<!-- - When the fix was applied -->
<!-- - When the fix was verified -->

| Time | Event |
|---|---|
| | Issue started (or estimated start) |
| | Issue detected — by whom and how |
| | Investigation began |
| | Root cause identified |
| | Fix applied |
| | Fix verified in production |

---

## Root Cause

<!-- NOT symptoms. The actual underlying cause. -->
<!-- Bad: "The API returned 500." -->
<!-- Good: "The gmail_credentials row for user X had an expired refresh_token because Google revoked the OAuth grant after 6 months of inactivity, and the token refresh in src/lib/gmail.ts:24-49 does not handle revoked tokens differently from expired tokens." -->

**Root cause:**

**How was the root cause confirmed?**
<!-- What evidence proved this was the cause? SQL query results, log entries, code inspection? -->

---

## Contributing Factors

<!-- What made this incident possible or made it worse? -->
<!-- Common factors in Hubforte: -->
<!-- - No automated tests (zero test files in the project) -->
<!-- - No staging environment (local → production directly) -->
<!-- - Schema changes use SQL migration files with up/down rollback (drizzle-kit push is blocked) -->
<!-- - No foreign key constraints in core CRM tables (orphaned records possible) -->
<!-- - Rate limiter is in-memory (resets on server restart) -->
<!-- - Campaign worker has no idempotency guard on Gmail sends -->
<!-- - Feature flags default to disabled if no row exists -->

1.
2.
3.

---

## Fix Applied

<!-- What was changed to resolve the issue? Include: -->
<!-- - Git commit hash(es) -->
<!-- - Files modified -->
<!-- - SQL executed (if any) -->
<!-- - Config/env var changes (if any, without revealing actual secret values) -->

**Commit(s):**
**Files changed:**
**Database changes:**
**Environment changes:**

---

## Prevention Actions

<!-- What will be done to prevent this specific incident from happening again? -->
<!-- Each action should be concrete and assignable, not aspirational. -->
<!-- Bad: "We should add more monitoring." -->
<!-- Good: "Add a check in the error summariser to alert when gmail_credentials.expires_at is within 7 days of expiry." -->

| Action | Owner | Target Date | Status |
|---|---|---|---|
| | | | |

---

## Runbook Updated?

- [ ] **Yes** — Updated runbook: ___ (specify which one in `ops/INCIDENT_RUNBOOK.md`)
- [ ] **No** — Reason: ___

<!-- If this incident type is not covered by any of the 10 existing runbooks, consider adding a new one. -->
<!-- Existing runbooks: 1-Gmail send, 2-Campaign processing, 3-Login all users, 4-Login one user, 5-AI features, 6-Import, 7-Feature visibility, 8-YF data, 9-Slow performance, 10-Password reset -->

---

## Alert or Test Added?

- [ ] **Yes** — Describe: ___
- [ ] **No** — Reason: ___

<!-- Note: Hubforte currently has zero automated tests. Consider whether this incident justifies adding the first test, or whether a monitoring check (e.g., periodic health/detailed query, error_logs scan, campaign_contacts status check) would be more practical. -->
<!-- Monitoring endpoints available: GET /api/healthz, GET /api/health/detailed, GET /api/super-admin/diagnostics (SUPER_ADMIN only) -->
