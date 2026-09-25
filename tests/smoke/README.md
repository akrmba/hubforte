# Smoke Tests

Minimal smoke tests for Hubforte's critical paths: health, auth, and contacts CRUD.

## Prerequisites

- Local dev stack running (`pnpm dev` — API on :3000, Vite on :5173)
- A PostgreSQL database with seeded data (`pnpm seed`)
- A test user in the database (see environment variables below)

## Running

```bash
# Install vitest (if not already installed)
pnpm install

# Run all smoke tests
pnpm test:smoke

# Run individual test suites
pnpm test:smoke:health
pnpm test:smoke:auth
pnpm test:smoke:contacts
```

## Environment Variables

The smoke tests load `artifacts/api-server/.env` automatically, then allow process environment variables to override those values.

| Variable | Default | Description |
|----------|---------|-------------|
| `API_BASE_URL` | `http://localhost:3000` | Base URL of the running API server |
| `TEST_USER_EMAIL` | `.env ADMIN_EMAIL` | Email of a user in the local database |
| `TEST_USER_PASSWORD` | `.env SEED_PASSWORD` | Password for the test user |

## What These Tests Cover

- **health.test.ts** — `GET /api/healthz` returns ok with db status
- **auth.test.ts** — Login succeeds with valid credentials, fails with invalid, logout works with required CSRF header
- **contacts.test.ts** — List, create, update contacts with auth; authenticated writes include the required CSRF header; unauthenticated requests are rejected

## Design Decisions

- Tests run against a live local dev stack (not mocked) to catch real integration issues
- Tests use `fetch()` directly — no HTTP client library needed
- Each test file is independent and can run in isolation
- The contacts test creates a test record with a timestamped email to avoid collisions
- Tests are deterministic given a running dev stack with seeded data
