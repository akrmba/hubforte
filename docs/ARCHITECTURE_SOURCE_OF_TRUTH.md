# Hubforte — Architecture Source of Truth
**Last updated:** 2026-05-02
**Status:** Active — update this file when architecture changes

---

## The Six Layers

Every part of Hubforte belongs to one of six layers:

1. **Experience** — CRM frontend (React/Vite), LMS frontend (React/Vite), portals, admin console, incident dashboard
2. **Application** — API server (Express/TypeScript), worker daemon, automation engine, email engine, AI orchestration, webhooks
3. **Data** — PostgreSQL (Neon), object storage, audit logs, exports, backups, search indexes
4. **Observability** — Sentry, OCI Logging, OCI Monitoring, OCI Notifications, OCI APM, uptime checks
5. **Delivery Control** — GitHub branches, PRs, required reviews, CI, staging, production environments, CODEOWNERS
6. **Governance** — AI limits, approval matrix, incident rules, retention, access reviews, postmortems, SLAs

---

## Repository Structure

```
Hubforte/
├── artifacts/
│   ├── api-server/          ← Main backend (Express + TypeScript)
│   ├── crm/                 ← CRM frontend (React 18 + Vite + Wouter)
│   └── lms/                 ← LMS frontend (separate Vite app)
├── lib/
│   ├── db/                  ← Drizzle ORM schema + SQL migrations
│   ├── api-spec/            ← OpenAPI spec
│   ├── api-zod/             ← Zod validation schemas
│   └── api-client-react/    ← React hooks for API calls
├── worker/                  ← Campaign worker daemon
├── scripts/                 ← DB seed, backup, migration runners
├── tests/smoke/             ← Smoke tests + tenant isolation tests
├── ops/                     ← Runbooks: DEPLOY, INCIDENT, ROLLBACK
├── docs/                    ← Architecture documentation (this folder)
├── framework/               ← Agent context and master plan
└── .github/workflows/       ← CI/CD pipelines
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Package manager | pnpm (monorepo) |
| Backend | Express.js + TypeScript |
| Frontend (CRM) | React 18 + Vite + Wouter |
| Frontend (LMS) | React 18 + Vite + Wouter |
| CSS/UI | Tailwind CSS + shadcn/ui |
| Database | PostgreSQL (Neon serverless) |
| ORM | Drizzle ORM |
| Auth | JWT (httpOnly cookie `crm_session`) |
| System AI | Anthropic Claude |
| Client AI | OpenRouter + DeepSeek V3 |
| Logging | Pino (JSON structured) |
| Error tracking | Sentry (EU region) |
| Infrastructure | OCI Ampere A1 (Always Free) |
| Container registry | GitHub Container Registry (GHCR) |
| CI/CD | GitHub Actions |

---

## Multi-Tenancy Model

Row-level multi-tenancy. Every tenant-owned table has a `tenant_id` column.
Tenant isolation is enforced at the application layer (every query scoped by `tenant_id`).
Database-level RLS is planned for Phase 3 using transaction-scoped JWT claims.

---

## Authentication

- CRM: JWT in httpOnly cookie `crm_session` (30 days). Bearer header also accepted.
- LMS public users: `lms_session` cookie (2 hours) via invite token exchange.
- CSRF: `X-Requested-With: XMLHttpRequest` required on all mutating requests.
- 2FA: TOTP supported.
- Emergency access: break-glass account via `scripts/emergency-access.ts`.

---

## Module System

Every feature is gated by a module flag per tenant. Enabling/disabling a module
instantly shows/hides it in the UI and blocks/allows the backend routes.
Module keys must match exactly between `useFeatureFlags()` (frontend) and
`checkModuleEnabled()` (backend). See `lib/db/src/moduleRegistry.ts` for the
canonical list.

---

## Deployment Architecture

```
GitHub (main branch)
    → GitHub Actions CI
        → TypeScript typecheck
        → Build 4 Docker images (API, CRM, LMS, worker)
        → Push to GHCR
        → Deploy to staging (OCI ARM A1)
        → Apply new migrations (hubforte_migrations tracking table)
        → Run smoke tests + tenant isolation tests
        → Owner approval gate
        → Deploy to production (OCI ARM A1)
        → Apply new migrations
        → Post-deploy health check
        → Update LAST_GOOD_PRODUCTION_TAG
```

Production URLs:
- `api.hubforte.com` — API server
- `app.hubforte.com` — CRM frontend
- `lms.hubforte.com` — LMS frontend

Staging URLs:
- `staging-api.hubforte.com`
- `staging.hubforte.com`
- `staging-lms.hubforte.com`
