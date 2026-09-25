# Hubforte — Local Testing & Verification
**Last updated:** 2026-05-02
**Status:** Active — run these checks before every commit

---

## Before Every Commit

```bash
# 1. TypeScript typecheck (all packages)
pnpm run typecheck

# 2. Smoke tests (requires running dev stack)
pnpm run test:smoke
```

Both must pass. If either fails, fix before pushing.

---

## Starting the Dev Stack

```bash
# Install dependencies (first time or after package changes)
pnpm install

# Approve esbuild build scripts if prompted
pnpm approve-builds

# Start all services
pnpm run dev
```

Services start at:
- `http://localhost:3000` — API server
- `http://localhost:5173` — CRM frontend
- `http://localhost:5174` — LMS frontend

---

## Running Smoke Tests

Smoke tests run against a live local dev stack. The stack must be running first.

```bash
# All smoke tests
pnpm run test:smoke

# Individual test suites
pnpm run test:smoke:health
pnpm run test:smoke:auth
pnpm run test:smoke:contacts
pnpm run test:smoke:lms

# Tenant isolation tests (requires two test tenants configured)
# Set TENANT_A_EMAIL, TENANT_A_PASSWORD, TENANT_B_EMAIL, TENANT_B_PASSWORD
pnpm vitest run tests/smoke/tenant-isolation.test.ts
```

---

## Required Environment Variables for Local Dev

Copy `artifacts/api-server/.env.example` to `artifacts/api-server/.env` and fill in:

```
DATABASE_URL=          # Neon connection string (dev branch)
JWT_SECRET=            # Any 32+ char string for local dev
SESSION_SECRET=        # Any 32+ char string for local dev
WORKER_SECRET=         # Any string for local dev
SEED_PASSWORD=         # Password for seeded test users
ADMIN_EMAIL=           # Email for the seeded admin user
INTEGRATION_ENCRYPTION_KEY=  # 64 hex chars — required for safeguarding notes
```

Generate `INTEGRATION_ENCRYPTION_KEY`:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Seeding the Database

```bash
# Seed the database with test data
pnpm run seed
```

This creates:
- A platform owner user (`ADMIN_EMAIL` / `SEED_PASSWORD`)
- A test tenant
- Default feature flags for all modules

---

## Running Migrations

Migrations run automatically on deploy via the `hubforte_migrations` tracking table.
For local dev, apply migrations manually:

```bash
# Apply a specific migration
psql $DATABASE_URL -f lib/db/migrations/NNNN_description_up.sql

# Roll back a migration
psql $DATABASE_URL -f lib/db/migrations/NNNN_description_down.sql
```

---

## Typecheck Commands

```bash
# All packages (recommended — matches CI)
pnpm run typecheck

# Individual packages
pnpm --filter @workspace/api-server typecheck
pnpm --filter @workspace/crm typecheck
pnpm --filter @workspace/lms typecheck
pnpm --filter @workspace/db build
```

---

## Common Issues

**`concurrently` not found on `pnpm run dev`:**
```bash
pnpm install
pnpm approve-builds  # approve esbuild
```

**Smoke tests fail with connection refused:**
Make sure the dev stack is running (`pnpm run dev`) before running tests.

**`INTEGRATION_ENCRYPTION_KEY` not set:**
Safeguarding note routes will throw. Generate and set the key (see above).

**TypeScript errors in `scripts/src/seed.ts`:**
Make sure `SEED_PASSWORD` is set in `.env` — the script exits if it is missing.
