# Hubforte Rollback Runbook

**Scope:** Step-by-step rollback procedures for failed deployments.
**Last updated:** 2026-05-02
**Hosting:** OCI Ampere A1 instance via SSH + docker-compose (4 services: API, CRM, LMS, worker)

> **Recovery entry point:** For all recovery scenarios (not just rollback), start at `docs/RECOVERY_SOURCE_OF_TRUTH.md`.

---

## When to Rollback

Rollback immediately if ANY of these are true after deploy:
- `GET /api/healthz` returns non-200 or `db: "error"`
- Pre-deploy check shows `NO-GO`
- Login is broken for all users
- Error rate exceeds 15% in the first 5 minutes
- Campaign worker returns 401 (WORKER_SECRET mismatch)
- `scripts/post-deploy-check.sh` outputs `DEPLOY_FAILED`
- Post-deploy smoke tests fail (GitHub Actions reports failure)

---

## 1. How to Identify the Last Working Image Tag

All four services (API, CRM, LMS, worker) are tagged with the same git SHA at build time.
The last known-good tag is stored in GitHub Actions Variables as `LAST_GOOD_PRODUCTION_TAG`.

```bash
# Check the current running image tags on the server
ssh deploy@<OCI_HOST> "docker compose -f docker-compose.prod.yml ps"

# Check the last good tag via gh CLI
gh variable get LAST_GOOD_PRODUCTION_TAG
```

---

## 2. How to Rollback All Four Services

Rollback must cover all four services simultaneously using the same image tag.
Never rollback only the API — a CRM/LMS/worker mismatch causes silent failures.

### Option A — Automated rollback (GitHub Actions — preferred)

```bash
# Use the LAST_GOOD_PRODUCTION_TAG stored in GitHub Variables (set automatically after each successful deploy)
gh workflow run rollback.yml \
  -f image_tag=<LAST_GOOD_PRODUCTION_TAG> \
  -f reason="<brief reason for rollback>"
```

The workflow input is named `image_tag` (not `tag`). If `image_tag` is omitted, the workflow
reads `vars.LAST_GOOD_PRODUCTION_TAG` automatically — so this also works:

```bash
gh workflow run rollback.yml -f reason="<brief reason for rollback>"
```

### Option B — Manual rollback via SSH

```bash
ssh deploy@<OCI_HOST>

export IMAGE_TAG=<LAST_GOOD_PRODUCTION_TAG>

# Pull all four images at the good tag
docker compose -f docker-compose.prod.yml pull

# Restart all four services together
docker compose -f docker-compose.prod.yml up -d --remove-orphans

# Verify all services are running
docker compose -f docker-compose.prod.yml ps

# Run health check
curl -s https://api.hubforte.com/api/healthz | jq .
```

### Option C — Git-based revert (creates a new commit, triggers CI/CD pipeline)

```bash
git revert HEAD --no-edit
git push origin main
```

This creates a new commit that undoes the broken one. The deploy pipeline picks it up,
deploys to staging, runs smoke tests, and requires approval before production.
Use this when the rollback needs to be tracked in git history.

---

## 3. How to Rollback a Database Migration

If the deployment included a schema migration that must be reversed:

```bash
# Step 1: Identify the migration that was applied
ls lib/db/migrations/ | sort | tail -5

# Step 2: Run the down migration (every migration must have a .down.sql file)
psql $DATABASE_URL -f lib/db/migrations/<migration_number>_<name>_down.sql

# Step 3: Remove the migration tracking entry
# The deploy pipeline tracks applied migrations in hubforte_migrations (NOT drizzle_migrations)
psql $DATABASE_URL -c "DELETE FROM hubforte_migrations WHERE name = '<migration_number>_<name>_up.sql';"

# Step 4: Verify the schema is back to the expected state
psql $DATABASE_URL -c "\d <affected_table>"
```

**Important:** Always run the application rollback (Step 2 above) BEFORE the DB rollback.
Running old code against a new schema is safer than running new code against an old schema.

---

## 4. How to Verify the Rollback Worked

```bash
# 1. Health check
curl -s https://api.hubforte.com/api/healthz | jq .
# Expect: { "status": "ok", "db": "connected" }

# 2. Check all four containers are running
ssh deploy@<OCI_HOST> "docker compose -f docker-compose.prod.yml ps"

# 3. Check error rate in OCI Logging — should drop back to baseline
```

---

## 5. After Rollback — Required Actions

1. Disable maintenance mode: `POST /api/super-admin/maintenance/disable`
2. Notify affected tenants if outage exceeded 5 minutes (use `ops/CLIENT_COMMS_TEMPLATES.md`)
3. Update `LAST_GOOD_PRODUCTION_TAG` in GitHub Variables if it was stale
4. Open a postmortem issue using `ops/POSTMORTEM_TEMPLATE.md`
5. Do not redeploy the broken version until root cause is identified and fixed
