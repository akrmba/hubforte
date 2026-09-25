# Hubforte — Recovery Source of Truth
**Last updated:** 2026-05-02
**Status:** Active — the canonical entry point for all recovery scenarios

---

## Start Here

If something is broken in production, start with this decision tree:

```
Is the site completely down?
  YES → Go to Section 1: Full Outage Recovery
  NO  → Is it a specific feature broken?
          YES → Go to Section 2: Partial Outage Recovery
          NO  → Is it a bad deployment?
                  YES → Go to Section 3: Rollback
                  NO  → Go to Section 4: Database Recovery
```

---

## Section 1 — Full Outage Recovery

**Symptoms:** All pages return errors, health check fails, customers cannot log in.

```bash
# Step 1: Check if containers are running
ssh deploy@<OCI_HOST>
docker compose -f /opt/hubforte/docker-compose.prod.yml ps

# Step 2: Check container logs
docker compose -f /opt/hubforte/docker-compose.prod.yml logs --tail=50 api

# Step 3: If containers are stopped, restart them
cd /opt/hubforte
export IMAGE_TAG=latest
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d

# Step 4: Verify health
curl -s https://api.hubforte.com/api/healthz | jq .
```

If restart does not fix it → go to Section 3 (Rollback).

---

## Section 2 — Partial Outage Recovery

**Symptoms:** Some features broken, others working.

1. Check the incident dashboard at `/super-admin/incidents`
2. Find the `errorRefId` from customer reports
3. Check `error_logs` table for that `errorRefId`
4. Check recent deployments — did this start after a deploy?
5. If yes → go to Section 3 (Rollback)
6. If no → investigate the specific error and create a fix branch

---

## Section 3 — Rollback

**When to use:** A deployment broke something and you need to revert immediately.

### Automated rollback (preferred)

```bash
# Rolls back to LAST_GOOD_PRODUCTION_TAG (set automatically after each successful deploy)
gh workflow run rollback.yml -f reason="<brief description of what broke>"

# Or specify a tag explicitly
gh workflow run rollback.yml -f image_tag=<TAG> -f reason="<reason>"
```

The rollback workflow:
1. Pulls all 4 images at the specified tag
2. Restarts all 4 services together
3. Runs a health check
4. Updates `LAST_GOOD_PRODUCTION_TAG` on success

### Manual rollback via SSH

```bash
ssh deploy@<OCI_HOST>
cd /opt/hubforte

export IMAGE_TAG=<LAST_GOOD_TAG>
docker compose -f docker-compose.prod.yml --env-file .env.prod pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --remove-orphans

# Verify
curl -s https://api.hubforte.com/api/healthz | jq .
```

### Database migration rollback

If the deployment included a schema migration:

```bash
# Find the migration that was applied
ls lib/db/migrations/ | sort | tail -5

# Run the down migration
psql $DATABASE_URL -f lib/db/migrations/<NNNN>_<name>_down.sql

# Remove from tracking table
psql $DATABASE_URL -c "DELETE FROM hubforte_migrations WHERE name='<NNNN>_<name>_up.sql';"
```

---

## Section 4 — Database Recovery

### Restore from Neon backup

1. Log into neon.tech
2. Go to your project → Branches → main
3. Use "Restore" to restore to a point-in-time before the incident
4. Verify the restore in staging first if possible

### Per-tenant data recovery

If one tenant's data is corrupted:
1. Use the tenant export endpoint to get their current data
2. Restore from the most recent tenant backup ZIP (stored in OCI Object Storage)
3. Import the backup data via the import wizard

---

## Section 5 — Emergency Access

If the owner is locked out of the system:

```bash
# Generate a 2-hour emergency access window
node scripts/emergency-access.ts

# Requires EMERGENCY_ACTIVATION_TOKEN from your secure offline storage
# Every activation is logged to audit_logs
# The emergency account auto-suspends after use
```

---

## Key Contacts & Resources

| Resource | Location |
|----------|---------|
| Incident dashboard | `https://app.hubforte.com/super-admin/incidents` |
| Health check | `https://api.hubforte.com/api/healthz` |
| GitHub Actions | `https://github.com/<repo>/actions` |
| OCI Console | `https://cloud.oracle.com` |
| Neon Console | `https://neon.tech` |
| Sentry | `https://sentry.io` (EU region) |
| Deploy runbook | `ops/DEPLOY_RUNBOOK.md` |
| Rollback runbook | `ops/ROLLBACK_RUNBOOK.md` |
| Incident runbook | `ops/INCIDENT_RUNBOOK.md` |
