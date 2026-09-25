# Hubforte Deploy Runbook

**Scope:** Standard deployment procedure for Hubforte. Follow every step in order.
**Last updated:** 2026-05-02
**Hosting:** OCI Ampere A1 instance via SSH + docker-compose (4 services: API, CRM, LMS, worker)
**Deploy pipeline:** GitHub Actions → staging → smoke tests → owner approval → production

> **Recovery entry point:** If something goes wrong during or after deployment, start at `docs/RECOVERY_SOURCE_OF_TRUTH.md`.

---

## How Deployments Work

Every push to `main` triggers the GitHub Actions pipeline:
1. TypeScript typecheck (api-server, crm, lms, scripts packages)
2. Build all four Docker images (API, CRM, LMS, worker) tagged with the git SHA
3. Push images to GitHub Container Registry (GHCR)
4. Deploy to staging automatically
5. Apply new migrations only (tracked via `hubforte_migrations` table — already-applied migrations are skipped)
6. Run smoke tests + tenant-isolation tests against staging
7. Require owner approval before production (GitHub Environment gate)
8. Deploy to production (all four services together, same image tag)
9. Apply new migrations to production (same tracking table approach)
10. Run post-deploy health check
11. Update `LAST_GOOD_PRODUCTION_TAG` in GitHub Variables on success

**Note:** There is no automatic rollback step in the pipeline. If the post-deploy health check fails, the pipeline exits with an error and you must trigger rollback manually via `gh workflow run rollback.yml -f reason="..."`. See `ops/ROLLBACK_RUNBOOK.md`.

**Note:** Unit tests are not currently in CI — only typechecks and smoke tests run. Unit tests are run locally before pushing.

For manual or emergency deploys, follow the steps below.

---

## Deploy Sequence Protocol

Every deployment MUST follow these steps in order. Do not skip or reorder.

### Step 0: Record Current State

```bash
# Note the current commit hash — this is your rollback target
git rev-parse HEAD

# Note the current image tag running in production
gh variable get LAST_GOOD_PRODUCTION_TAG
```

Save both values. You will need them if the deploy fails.

### Step 1: Run Pre-Deploy Check

```
GET /api/super-admin/pre-deploy-check
```

**Must return `GO`.** If it returns `NO-GO`:
- Review the failed checks
- Fix the underlying issue
- Re-run the check

### Step 2: Enable Maintenance Mode

```
POST /api/super-admin/maintenance/enable
Body: {
  "message": "Hubforte is being updated. We'll be back shortly.",
  "estimatedResolution": "15 minutes"
}
```

Verify: `GET /api/super-admin/maintenance` should show `enabled: true`.

### Step 3: Confirm No Active Campaign Sends

```sql
SELECT COUNT(*) FROM campaigns WHERE status = 'SENDING';
```

**Must return 0.** If any campaigns are sending, wait or pause them before proceeding.

### Step 4: Take Database Snapshot

Via Neon dashboard:
1. Navigate to your project → Branches
2. Create a new branch from `main` named `pre-deploy-YYYY-MM-DD`
3. This is your rollback point if the migration fails

### Step 5: Deploy the Update

**Via GitHub Actions (standard path):**
Push to `main` and approve the production deployment in GitHub after staging smoke tests pass.

**Via SSH (emergency manual deploy):**
```bash
ssh deploy@<OCI_HOST>

# Pull latest images (all four services)
export IMAGE_TAG=<NEW_GIT_SHA>
docker compose -f docker-compose.prod.yml pull

# Run any pending migrations using the hubforte_migrations tracking table
# (same mechanism as the automated pipeline — skips already-applied migrations)
docker compose -f docker-compose.prod.yml run --rm \
  -e DATABASE_URL api sh -c \
  'set -e
  psql "$DATABASE_URL" -c "CREATE TABLE IF NOT EXISTS hubforte_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT NOW());"
  for f in $(ls /app/lib/db/migrations/*_up.sql 2>/dev/null | sort); do
    name=$(basename "$f")
    already=$(psql "$DATABASE_URL" -tAc "SELECT COUNT(*) FROM hubforte_migrations WHERE name='"'"'$name'"'"'")
    if [ "$already" = "0" ]; then
      echo "Applying: $name"
      psql "$DATABASE_URL" -f "$f"
      psql "$DATABASE_URL" -c "INSERT INTO hubforte_migrations (name) VALUES ('"'"'$name'"'"')"
    fi
  done'

# Restart all four services together
docker compose -f docker-compose.prod.yml up -d --remove-orphans

# Clean up old images
docker image prune -f
```

### Step 6: Wait 60 Seconds

Allow the server to fully initialize, warm caches, and establish database connections.

### Step 7: Run Post-Deploy Health Check

```bash
./scripts/post-deploy-check.sh https://api.hubforte.com [SUPER_ADMIN_TOKEN]
```

**Two possible outcomes:**

#### DEPLOY_SUCCESS
- Proceed to Step 8

#### DEPLOY_FAILED
- **Do NOT disable maintenance mode**
- **Do NOT attempt automatic fixes**
- Execute the rollback runbook immediately (`ops/ROLLBACK_RUNBOOK.md`)
- After rollback completes, go to Step 9

### Step 8: Disable Maintenance Mode (on DEPLOY_SUCCESS)

```
POST /api/super-admin/maintenance/disable
```

Update the last-good tag in GitHub Variables:
```bash
gh variable set LAST_GOOD_PRODUCTION_TAG --body "<NEW_GIT_SHA>"
```

### Step 9: If DEPLOY_FAILED — Execute Rollback

1. **Keep maintenance mode ON**
2. Follow `ops/ROLLBACK_RUNBOOK.md` step by step
3. After rollback is verified:
   - Disable maintenance mode: `POST /api/super-admin/maintenance/disable`
   - Notify clients of brief disruption (use `ops/CLIENT_COMMS_TEMPLATES.md`)

### Step 10: Post-Deploy Monitoring

Watch for 15 minutes after deploy:
- `GET /api/super-admin/ops-snapshot` — error rate should stay below 5%
- Check OCI Monitoring alarms — no CPU/memory/error rate alerts should fire
- Verify the campaign worker is polling (check worker last seen in ops-snapshot)
- Monitor `GET /api/super-admin/error-logs` for new entries

---

## Pre-Deploy Checklist

Complete before every production deployment:

- [ ] All CI checks pass on the branch
- [ ] Staging smoke tests pass
- [ ] Pre-deploy check returns `GO`
- [ ] No active campaign sends
- [ ] Database snapshot taken
- [ ] Current image tag recorded as rollback target
- [ ] Maintenance mode enabled
- [ ] Owner has approved the production deployment in GitHub

---

## Environment Variables

All secrets are stored in GitHub Actions Secrets and injected at deploy time.
Never store secrets in the repository or in `.env` files committed to git.

Key secrets required for production:
- `PROD_ENV` — full production `.env` file contents
- `DEPLOY_HOST` — OCI server IP
- `DEPLOY_USER` — SSH user
- `DEPLOY_SSH_KEY` — SSH private key
- `LAST_GOOD_PRODUCTION_TAG` — GitHub Variable (not secret) — last known-good image tag
