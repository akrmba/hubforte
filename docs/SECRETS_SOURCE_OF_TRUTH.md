# Hubforte — Secrets Inventory & Deployment Confirmation
**Last updated:** 2026-05-02
**Status:** Active — update when secrets change or are rotated

---

## Rules

1. **Never commit secrets to git.** All secrets live in GitHub Secrets or OCI Vault.
2. **Never log secret values.** Log secret names only (e.g. `ANTHROPIC_API_KEY is set: true`).
3. **Rotate secrets immediately** if they are accidentally exposed.
4. **Store `EMERGENCY_ACTIVATION_TOKEN` physically** — not digitally. Print it and store it securely offline.

---

## GitHub Secrets (Production)

| Secret | Purpose | Required |
|--------|---------|---------|
| `DEPLOY_HOST` | Production OCI server IP | ✅ |
| `DEPLOY_USER` | SSH username | ✅ |
| `DEPLOY_SSH_KEY` | SSH private key | ✅ |
| `PROD_ENV` | Full production `.env` file contents | ✅ |
| `PROD_API_URL` | Production API URL for health checks | ✅ |
| `VITE_API_URL` | API URL injected at CRM build time | ✅ |
| `VITE_LMS_URL` | LMS URL injected at CRM build time | ✅ |

## GitHub Secrets (Staging)

| Secret | Purpose | Required |
|--------|---------|---------|
| `STAGING_HOST` | Staging OCI server IP | ✅ |
| `STAGING_USER` | SSH username | ✅ |
| `STAGING_SSH_KEY` | SSH private key | ✅ |
| `STAGING_ENV` | Full staging `.env` file contents | ✅ |
| `STAGING_API_URL` | Staging API URL | ✅ |
| `STAGING_TEST_USER_EMAIL` | Smoke test user email | ✅ |
| `STAGING_TEST_USER_PASSWORD` | Smoke test user password | ✅ |
| `STAGING_TENANT_A_EMAIL` | Tenant A user for isolation tests | ✅ |
| `STAGING_TENANT_A_PASSWORD` | Tenant A password | ✅ |
| `STAGING_TENANT_B_EMAIL` | Tenant B user for isolation tests | ✅ |
| `STAGING_TENANT_B_PASSWORD` | Tenant B password | ✅ |

## GitHub Variables (not secrets — not sensitive)

| Variable | Purpose |
|----------|---------|
| `LAST_GOOD_PRODUCTION_TAG` | Image tag of last successful production deploy — used by rollback workflow |

---

## Required Environment Variables (in `.env` / `PROD_ENV` secret)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `JWT_SECRET` | JWT signing secret (min 32 chars) |
| `SESSION_SECRET` | Session signing secret |
| `WORKER_SECRET` | Worker daemon authentication |
| `INTEGRATION_ENCRYPTION_KEY` | AES-256 key for safeguarding note encryption (64 hex chars) |
| `ANTHROPIC_API_KEY` | System AI (Claude) |
| `OPENROUTER_API_KEY` | Client AI (DeepSeek via OpenRouter) |
| `GMAIL_CLIENT_ID` | Gmail OAuth |
| `GMAIL_CLIENT_SECRET` | Gmail OAuth |
| `GMAIL_REFRESH_TOKEN` | Gmail OAuth |
| `EMERGENCY_ACTIVATION_TOKEN` | Break-glass emergency access |
| `SUPER_ADMIN_EMAIL` | Platform owner email |
| `ALLOWED_ORIGINS` | CORS allowed origins |
| `APP_URL` | Public app URL |

Optional:
| Variable | Purpose |
|----------|---------|
| `OPENAI_API_KEY` | Fallback AI provider |
| `INSTATUS_API_KEY` | Status page integration |
| `INSTATUS_PAGE_ID` | Status page ID |
| `SENTRY_DSN` | Backend Sentry DSN |
| `VITE_SENTRY_DSN` | Frontend Sentry DSN (injected at build) |

---

## Deployment Confirmation Checklist

Before going live with the first client, confirm all of the following:

### Infrastructure
- [ ] OCI Ampere A1 instance provisioned (not AMD micro)
- [ ] OCI region is UK South (London) for UK client
- [ ] Staging OCI instance provisioned
- [ ] All GitHub Secrets set (production + staging)
- [ ] `LAST_GOOD_PRODUCTION_TAG` GitHub Variable initialized

### Database
- [ ] Neon project region is `aws-eu-west-2` (London) for UK client
- [ ] Staging Neon branch created from production schema
- [ ] `hubforte_migrations` tracking table exists in both production and staging

### Security
- [ ] `INTEGRATION_ENCRYPTION_KEY` set in production (safeguarding encryption)
- [ ] `EMERGENCY_ACTIVATION_TOKEN` stored physically offline
- [ ] `main` branch protected (require PR + 1 review)
- [ ] `.github/CODEOWNERS` created for auth, permissions, migrations, CI/CD
- [ ] Secret scanning enabled in GitHub repository settings
- [ ] Dependency scanning (Dependabot) enabled

### Observability
- [ ] Sentry organisation created in EU region (Frankfurt)
- [ ] `SENTRY_DSN` and `VITE_SENTRY_DSN` set
- [ ] OCI Logging configured
- [ ] OCI Monitoring alarms set up
- [ ] OCI APM synthetic checks running

### Legal (UK first client)
- [ ] Privacy Policy published
- [ ] Terms of Service published
- [ ] Data Processing Agreement signed with client
- [ ] DPA with OCI, Neon, Sentry confirmed
- [ ] UK Children's Code compliance review completed (student/minor data)
- [ ] DPIA completed for safeguarding data processing
