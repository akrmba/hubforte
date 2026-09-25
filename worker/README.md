# CRM Worker — Same-VM OCI Deployment Guide

The worker polls for pending campaigns and triggers email delivery through the app's API.
It has **no direct database access** and should stay private to the host.
It now supports graceful shutdown between campaign boundaries and relies on API-side diagnostics for heartbeat visibility.

The canonical infrastructure plan is now in `docs/OCI_DEPLOYMENT_BLUEPRINT.md`.
This file covers only the worker's role in that plan.

---

## Intended Production Placement

- The worker runs on the **same OCI Compute VM** as the API and frontend ingress.
- It runs as a **separate long-running service**.
- It is **not** exposed publicly.
- It talks only to the app API using `APP_URL` and `WORKER_SECRET`.
- The current repo-supported packaging path is the existing `worker/Dockerfile`.

---

## Required Environment

The worker needs:

- `APP_URL`
- `WORKER_SECRET`
- `POLL_INTERVAL_SECONDS`

For the same-host OCI layout, prefer an internal app URL such as:

```env
APP_URL=http://127.0.0.1:3000
```

Use the same `WORKER_SECRET` value as the API service.
For the canonical secret inventory, see `docs/SECRETS_SOURCE_OF_TRUTH.md`.

---

## Recommended OCI VM Deployment Path

### 1. Prepare the VM

- Oracle Linux 8 or newer
- Docker installed and enabled
- The main app deployed on the same VM
- `nginx` and the API already running according to `docs/OCI_DEPLOYMENT_BLUEPRINT.md`

### 2. Clone or update the repo on the VM

```bash
git clone https://github.com/your-org/your-crm-repo.git
cd your-crm-repo
```

### 3. Create a worker env file from the example

```bash
cp worker/.env.example worker/.env
```

Set:

- `APP_URL` to the internal app endpoint on the same VM
- `WORKER_SECRET` to the deployed shared secret
- `POLL_INTERVAL_SECONDS` to the chosen poll interval

### 4. Build the worker image from the repo root

```bash
docker build -f worker/Dockerfile -t hubforte-worker .
```

This build must run from the repo root because the Dockerfile copies `worker/run.ts` using the repo's top-level layout.

### 5. Start the worker container

```bash
docker run -d \
  --restart=unless-stopped \
  --env-file worker/.env \
  --name hubforte-worker \
  hubforte-worker
```

### 6. Verify polling

```bash
docker logs hubforte-worker --tail 50
```

Expected startup pattern:

```text
CRM Worker started. App URL: http://127.0.0.1:3000
Polling every 60s
Poll cycle started: 2026-01-01T00:00:00.000Z
```

Within 60 seconds, you should see `Poll cycle started`.
To stop the worker safely, send `SIGTERM` or `SIGINT`. The worker will finish the current unit of work, skip taking new campaigns, and log `Graceful shutdown complete`.

---

## Update Procedure

```bash
git pull origin main
docker build -f worker/Dockerfile -t hubforte-worker .
docker rm -f hubforte-worker || true
docker run -d --restart=unless-stopped --env-file worker/.env --name hubforte-worker hubforte-worker
```

After restart, verify fresh logs and confirm the API still accepts worker requests.

---

## Operational Notes

- Keep the worker on the same VM only for the first production deployment.
- If worker load grows, move it to its own compute target later without changing its API-only trust boundary.
- Do not give the worker direct database credentials.
- If the app is in maintenance mode during deploy, expect worker processing to pause until the API is healthy again.
- Worker heartbeat and last action are visible in the super-admin diagnostics responses, so stuck campaign processing can be investigated without tailing worker logs alone.
