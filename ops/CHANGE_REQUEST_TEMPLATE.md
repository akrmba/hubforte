# Hubforte Change Request Form

**Required for:** All Level 3 and Level 4 changes (see `ops/APPROVAL_MATRIX.md`).
**When to fill out:** BEFORE any code is written or any database change is made.

---

## Change Request

### Change ID
<!-- Format: YYYY-MM-DD-short-description, e.g., 2026-04-09-add-consent-column -->

### Change Level
<!-- Level 3 (High Risk) or Level 4 (Critical). See ops/APPROVAL_MATRIX.md for classification. -->

- [ ] Level 3 — High Risk
- [ ] Level 4 — Critical

---

### Current State
<!-- What is currently happening? Describe the existing behavior, including the specific endpoint, page, or process. Reference file paths. -->

**Affected endpoint/page:**
**Current behavior:**
**How it was discovered:**

---

### Desired Outcome
<!-- What should happen after this change? Be specific about the expected behavior. -->

**Expected behavior after change:**
**Who benefits and how:**

---

### Files That Will Change
<!-- List every file that will be modified, created, or deleted. Use full paths from project root. -->

| File | Action (modify/create/delete) | What changes |
|---|---|---|
| | | |

---

### Database Tables Affected
<!-- List every table that will be read from, written to, or have its schema modified. -->
<!-- Hubforte tables reference: Core CRM (users, contacts, organizations, tasks, activities, notes, campaigns, campaign_contacts, outbound_emails, email_templates, gmail_credentials, volunteers, funders, funder_contacts, opportunities, support_tickets, ticket_updates, ai_ticket_diagnoses, remediation_policies, remediation_runs, feature_flags, password_reset_tokens, notifications, ai_logs, error_logs, request_logs, sessions). YF domain (yf_trusts, yf_schools, yf_sponsors, yf_contacts, yf_funding_opportunities, yf_programmes, yf_students, yf_volunteers, yf_placements, yf_activities). -->

| Table | Impact (read/write/schema change) | What changes |
|---|---|---|
| | | |

**Schema change method:** SQL migration files in `lib/db/migrations/` with up/down pairs (see `docs/SCHEMA_SOURCE_OF_TRUTH.md`). `drizzle-kit push` is blocked.

---

### Risk If This Goes Wrong
<!-- What is the worst-case scenario? Be honest. Consider: data loss, auth lockout, duplicate sends, broken features, exposed data. -->

**Worst case:**
**Blast radius (who/what is affected):**
**Likelihood (low/medium/high):**

---

### Rollback Method
<!-- How do you undo this change if it fails? Be specific — "revert the commit" is not sufficient if DB schema was changed. -->

**Code rollback:**
<!-- e.g., git revert <commit>, redeploy on Replit -->

**Database rollback:**
<!-- e.g., specific SQL to reverse the change. Use the corresponding _down.sql migration file. See docs/SCHEMA_SOURCE_OF_TRUTH.md for rollback procedures. -->

**Estimated rollback time:**

**Has the rollback been tested?**
- [ ] Yes — describe how
- [ ] No — explain why not

---

### Pre-Deploy Verification
<!-- What must be checked BEFORE deploying to production? -->
<!-- Note: Hubforte currently has zero automated tests. All verification is manual. -->

- [ ] Change works in local dev (`pnpm dev` — API on :3000, Vite on :5173)
- [ ] No new entries in browser console errors
- [ ] No new entries in `error_logs` table during local testing
- [ ] `GET /api/healthz` returns `{ status: "ok" }`
- [ ] `GET /api/health/detailed` shows normal DB latency
- [ ] Affected endpoint returns expected response
- [ ] (If schema change) Migration SQL applies cleanly locally and rollback `_down.sql` works
- [ ] (If auth change) Login/logout cycle works for all roles: SUPER_ADMIN, ADMIN, MANAGER, OPERATOR, VIEWER
- [ ] (If campaign change) Test with a DRAFT campaign — do NOT test with SENDING status
- [ ] Other: ___

---

### Post-Deploy Verification
<!-- What must be checked AFTER deploying to production on Replit? -->

- [ ] `GET /api/healthz` returns `{ status: "ok" }` on production URL
- [ ] `GET /api/health/detailed` shows DB latency <100ms
- [ ] Affected feature works in production UI
- [ ] No new critical entries in `error_logs` within 15 minutes of deploy
- [ ] (If schema change) All affected tables are queryable
- [ ] (If auth change) At least one user of each affected role can log in
- [ ] (If feature flag change) Affected module visible/hidden as expected
- [ ] `GET /api/super-admin/diagnostics` shows no new anomalies (requires SUPER_ADMIN)
- [ ] Other: ___

---

### Client Impact During Change Window
<!-- What will users experience during the change? -->

**Downtime expected:** Yes / No
**Duration estimate:**
**Features affected during change:**
**User communication needed:** Yes / No
**Communication method:** ___

---

### Approval

**Requested by:**
**Date requested:**
**Approved by:**
**Date approved:**
**Approval notes:**
