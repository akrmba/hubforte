# Hubforte — AGENT CONTEXT & SYSTEM BIBLE
### READ THIS BEFORE TOUCHING ANY FILE
**Version:** 1.0 | **Date:** 2026-04-23
**Purpose:** This document is the single source of truth for ALL AI agents working 
on Hubforte. Read it completely before making any changes. If anything you're asked to 
do contradicts this document, flag it to the owner before proceeding.

---

## SECTION 1 — WHAT THIS PROJECT IS

Hubforte is a multi-tenant, modular business platform built for organisations of all sizes.
It is NOT a simple CRM. It combines:

1. **CRM** — Contacts, Organisations, Pipeline, Outreach/Campaigns, Support Tickets
2. **LMS** — Learning Management System with student surveys, coach workflows, 
   programme/cohort/session management, outcome tracking, PDF reports
3. **Operations** — Safeguarding notes, consent management, field history, audit logs
4. **Analytics** — Reports engine, dashboards, CSV export
5. **Integrations** — Gmail, webhooks, import/export
6. **AI** — Provider abstraction (OpenAI/Anthropic/OpenRouter), auto-remediation, 
   AI-powered features throughout

The central differentiator: **modules can be toggled on/off per tenant**. This means 
one client gets a full education platform (LMS + Safeguarding + Outcomes). Another gets 
a pure sales CRM (Pipeline + Outreach + Reports). The same codebase serves all of them.

The owner (single person, non-coder, "vibe coder") manages this via prompts to AI agents.
Clients are called "tenants". There are already real tenants using this system.

---

## SECTION 2 — REPOSITORY STRUCTURE

```
Hubforte/                               ← Project root
├── artifacts/
│   ├── api-server/                   ← Main Express/TypeScript backend
│   │   └── src/
│   │       ├── app.ts               ← Express app setup
│   │       ├── index.ts             ← Server entry point
│   │       ├── routes/              ← All API route files
│   │       │   ├── index.ts         ← Route mounting (THE map of all routes)
│   │       │   ├── auth.ts          ← Login, logout, password reset
│   │       │   ├── organizations.ts ← Org CRUD (gated: 'organisations')
│   │       │   ├── contacts.ts      ← Contact CRUD (gated: 'contacts')
│   │       │   ├── lms/             ← All LMS backend routes (19 files)
│   │       │   └── ...              ← One file per module
│   │       ├── middlewares/
│   │       │   ├── auth.ts          ← JWT verification, session check
│   │       │   └── ...
│   │       └── lib/
│   │           ├── featureFlags.ts  ← checkModuleEnabled() middleware + cache
│   │           ├── aiProvider.ts    ← AI abstraction (OpenAI/Anthropic/OpenRouter)
│   │           ├── remediationEngine.ts ← Auto-remediation (25+ policies)
│   │           ├── logger.ts        ← Pino structured logging
│   │           └── ...
│   ├── crm/                          ← CRM React SPA (Vite + React 18 + Wouter)
│   │   └── src/
│   │       ├── App.tsx              ← ALL CRM routes defined here
│   │       ├── components/
│   │       │   ├── Layout.tsx       ← THE sidebar and top bar (507 lines)
│   │       │   └── ui/             ← shadcn/ui components
│   │       ├── pages/              ← One file per page
│   │       │   └── extended/       ← Extended feature pages (/ext/* routes)
│   │       └── hooks/
│   │           └── useFeatureFlags.ts ← Checks module flags in frontend
│   └── lms/                          ← LMS React SPA (separate Vite app)
│       └── src/
│           ├── App.tsx              ← LMS routes
│           └── pages/              ← 27 LMS pages
├── lib/
│   ├── db/                           ← Shared database layer
│   │   ├── src/
│   │   │   ├── schema/             ← 62 Drizzle ORM schema files
│   │   │   └── moduleRegistry.ts   ← MASTER LIST of all modules with keys/defaults
│   │   └── migrations/             ← SQL migration files
│   ├── api-spec/                    ← OpenAPI specification
│   ├── api-zod/                     ← Zod validation schemas
│   └── api-client-react/            ← React hooks for API calls
├── worker/                           ← Standalone campaign worker daemon
├── scripts/                          ← DB seed, backup, migration scripts
├── docs/                             ← Architecture and ops documentation (36 files)
├── ops/                              ← Runbooks (DEPLOY, INCIDENT, ROLLBACK)
├── framework/                        ← Agent instruction templates
├── not_required_1904_12pm/          ← OLD FILES — DO NOT TOUCH, DO NOT IMPORT FROM
├── package.json                     ← Root pnpm workspace config
└── pnpm-workspace.yaml              ← Workspace: artifacts/*, lib/*, scripts
```

---

## SECTION 3 — TECH STACK (EXACT VERSIONS & TOOLS)

| Layer | Technology | Notes |
|---|---|---|
| Package manager | pnpm (workspace monorepo) | Use `pnpm` not `npm` or `yarn` |
| Backend framework | Express.js + TypeScript | ESBuild for compilation |
| Frontend framework | React 18 + Vite | NOT Next.js. Uses Wouter for routing (not React Router) |
| CSS/UI | Tailwind CSS + shadcn/ui | Components in artifacts/crm/src/components/ui/ |
| Database | PostgreSQL (Neon serverless) | Via Drizzle ORM |
| Auth | JWT (httpOnly cookie `crm_session`) | Bearer header also accepted |
| AI | OpenAI / Anthropic / OpenRouter | Abstracted via aiProvider.ts |
| Logging | Pino (JSON structured) | Writes to request_logs and error_logs tables |
| Testing | Vitest | Smoke tests only currently |
| LMS auth | lms_session cookie | Separate from CRM auth — 2-hour expiry |

---

## SECTION 4 — ALL MODULES (Complete List)

### Understanding Modules

Each module has:
- **Key** — the string used in backend `checkModuleEnabled()` AND frontend `useFeatureFlags()`
  ⚠️ THESE MUST MATCH EXACTLY. A mismatch means frontend and backend are out of sync.
- **Category** — logical grouping
- **Required** — if true, disabling requires extra confirmation
- **Default** — enabled by default for new tenants?

### Currently Built Modules

| Module Key | Category | Required | Default | Backend Route(s) | Nav Item? | Notes |
|---|---|---|---|---|---|---|
| `organisations` | Core CRM | ✅ | ✅ | /organizations/* | ✅ (was broken — fixed in Phase 1) | |
| `contacts` | Core CRM | ✅ | ✅ | /contacts/* | ✅ (was broken — fixed in Phase 1) | |
| `activities` | Core CRM | ✅ | ✅ | /activities/* | Not in nav (inline on contact pages) | |
| `schools` | Entities | ❌ | ✅ | (no route — entity type) | WAS the wrong key for organisations | Legacy key |
| `trusts` | Entities | ❌ | ✅ | (entity type) | No | Legacy org type |
| `sponsors` | Entities | ❌ | ✅ | (entity type) | No | Legacy org type |
| `programmes` | Delivery | ❌ | ✅ | (part of cohorts backend) | ✅ | Backend uses 'cohorts' key for the actual routes |
| `students` | Delivery | ❌ | ✅ | /students/* via LMS | No | LMS manages students |
| `volunteers` | People | ❌ | ✅ | /volunteers/* | NEEDS to be added | |
| `outreach` | Engagement | ❌ | ✅ | /outreach/*, /campaigns/*, /templates/* | NEEDS to be added | |
| `funders` | People | ❌ | ✅ | /funders/* | NEEDS to be added | |
| `funding` | Entities | ❌ | ✅ | /opportunities/* | Covered by pipeline nav item | |
| `pipeline` | Analytics | ❌ | ✅ | /opportunities/* | ✅ | |
| `reports` | Analytics | ❌ | ✅ | /reports/* | ✅ | |
| `support` | Core | ❌ | ✅ | /support/* | NEEDS to be added | |
| `field_visibility` | Core | ❌ | ✅ | /field-visibility/* | No (admin setting) | |
| `record_types` | Core | ❌ | ✅ | /record-types/* | No (admin setting) | |
| `gmail` | Integration | ❌ | ✅ | /gmail/* | No (settings only) | |
| `import_export` | Integration | ❌ | ✅ | /import, /importexport | In settings | |
| `cohorts` | Delivery | ❌ | ❌ | /programme-cohorts/* | NEEDS to be added | |
| `sessions` | Delivery | ❌ | ❌ | /programme-sessions/*, /session-attendance/* | No | Sub-module of cohorts |
| `attendance` | Delivery | ❌ | ❌ | /session-attendance/* | No | Sub-module of sessions |
| `outcomes` | Compliance | ❌ | ❌ | /outcome-frameworks/*, /outcome-records/* | NEEDS to be added | |
| `safeguarding` | Compliance | ❌ | ❌ | /safeguarding-notes/*, /safeguarding-access-logs/* | NEEDS to be added | HIGH SECURITY |
| `consent` | Compliance | ❌ | ❌ | /consent-records/*, /parent-guardians/* | No (sub-module) | |
| `attachments` | Core | ❌ | ❌ | /attachments/* | NEEDS to be added | |
| `advanced_reports` | Analytics | ❌ | ❌ | (not yet built) | No | Planned |
| `dashboards` | Analytics | ❌ | ❌ | (partial — dashboards table exists) | No | Planned |
| `automation` | Automation | ❌ | ❌ | /automation-rules/* | NEEDS to be added | |
| `field_history` | Automation | ❌ | ❌ | (field_history table exists) | No | |
| `lms` | Delivery | ❌ | ❌ | /lms/*, /lms/public/* | NEEDS external link | Separate SPA |
| `ai` | AI | ❌ | ✅ | /ai/* | No (behind-scenes) | ⚠️ NOT currently gated |

### Planned Modules (Not Yet Built)

| Module Key | Description | Priority |
|---|---|---|
| `lead_scoring` | AI-powered lead scoring 0-100 | Phase 9 |
| `email_sequences` | Multi-step automated email sequences | Phase 8 |
| `quote_builder` | PDF quote/proposal generation | Phase 12 |
| `e_signature` | E-signature via SignWell/DocuSign | Phase 12 |
| `voice_agents` | AI voice for support/sales calls | Phase 12 |
| `customer_portal` | Self-service portal for clients | Future |
| `knowledge_base` | Help articles / FAQ builder | Future |
| `territory_management` | Sales territory assignment | Future |
| `commission_tracking` | Sales commission calculation | Future |
| `billing` | Subscription billing for tenants | Future |

---

## SECTION 5 — DATABASE SCHEMA (All 62 Tables)

Multi-tenancy: **Row-level**. Every table has a `tenant_id` column.
Non-SUPER_ADMIN queries are automatically scoped by tenant.
ORM: Drizzle ORM. Schema files: `lib/db/src/schema/`
Migrations: SQL files in `lib/db/migrations/` — do NOT use `drizzle-kit push` in production.

### Core CRM Tables
`contacts` — CRM contacts with email, phone, org link
`organizations` — Companies/accounts
`activities` — Calls, emails, meetings, notes (linked to contacts/orgs)
`notes` — Standalone notes on contacts/orgs
`tasks` — To-do items with due dates
`sessions` — User login sessions (not programme sessions)

### Sales Tables
`funding_opportunities` — Pipeline deals (despite the name, this is used for sales pipeline)
`campaigns` — Email campaign records
`templates` — Email templates

### People Tables
`funders` — Funder organisations
`volunteers` — Volunteer records with placement links
`placements` — Volunteer → organisation assignments

### Delivery / LMS Tables
`programmes` — Educational programmes
`programme_cohorts` — Groups of students within a programme
`programme_sessions` — Individual sessions within a cohort
`session_attendance` — Student attendance records
`students` — Student profiles
`lms_access_tokens` — LMS session access tokens
`lms_ai_summaries` — AI-generated student summaries
`lms_chosen_talents` — Student talent survey responses
`lms_coach_narratives` — Coach-written narratives about students
`lms_cohort_narratives` — Cohort-level narratives
`lms_forward_to_future` — "Forward to Future" LMS feature data
`lms_impact_snapshots` — Impact measurement data
`lms_parent_surveys` — Parent/guardian survey responses
`lms_public_sessions` — Public LMS session cookies (unauthenticated access)
`lms_reports` — Generated LMS PDF reports (stored references)
`lms_student_surveys` — Student self-assessment surveys
`lms_talent_scores` — Talent assessment scores
`lms_teacher_feedback` — Teacher feedback submissions
`lms_trip_data` — Trip/visit data for LMS programmes

### Compliance Tables
`safeguarding_notes` — HIGHLY SENSITIVE. Blocked from report engine. Extra access logging.
`safeguarding_access_log` — Audit of who accessed safeguarding notes and when
`consent_records` — Student/parent consent records
`parent_guardians` — Parent/guardian contact information
`outcome_frameworks` — Outcome measurement frameworks
`outcome_records` — Individual outcome data points

### User / Auth Tables
`users` — All user accounts with tenantId, role, 2FA fields
`tenants` — All tenant workspaces with status, plan
`sessions` — Active user sessions (httpOnly JWT)
`password_resets` — Password reset tokens
`tenant_feature_flags` — Per-tenant module overrides
`feature_flags` — Global default module flags

### Configuration Tables
`record_type_configs` — Custom record type definitions
`tenant_field_visibility` — Per-tenant field show/hide settings

### Integration Tables
`gmail` — Per-user Gmail OAuth credentials
`automation_rules` — Automation trigger/action definitions

### Monitoring & AI Tables
`request_logs` — Every API request (method, path, status, duration, userId)
`error_logs` — All errors with deduplication (occurrence count, firstSeen, lastSeen)
`audit_logs` — Sensitive operation audit trail
`change_events` — CDC (Change Data Capture) — every entity mutation
`ai_config` — AI configuration settings
`ai_logs` — AI API call logs
`remediation_policies` — Auto-remediation policy definitions
`remediation_runs` — History of remediation policy executions
`ops_ai_reports` — AI-generated operational reports

### Analytics Tables
`saved_reports` — User-saved report definitions
`dashboards` — Custom dashboard layouts
`report_types` — Report type definitions
`field_history` — Field-level change history

### Support Tables
`support` — Support ticket records and comments
`notifications` — In-app notification records

---

## SECTION 6 — THE MODULE FLAG SYSTEM (How It Works)

### Backend: checkModuleEnabled()

Location: `artifacts/api-server/src/lib/featureFlags.ts`

How it works:
1. Receives `moduleKey` (string)
2. Checks `req.user.role` — if SUPER_ADMIN, always passes (bypasses all checks)
3. Gets `tenantId` from `req.user.tenantId`
4. Looks up `tenant_feature_flags` for `{ tenantId, moduleKey }`
   - If found: uses that value (enabled/disabled)
   - If not found: falls back to global `feature_flags` table
   - If not in global table either: **DEFAULTS TO DISABLED** (safe-fail)
5. Cache: 1-minute TTL in-memory cache to avoid DB hit on every request

### Frontend: useFeatureFlags()

Location: `artifacts/crm/src/hooks/useFeatureFlags.ts`

How it works:
1. On app load, fetches `/api/feature-flags` (public, unauthenticated endpoint — returns flags for current session)
2. Returns a hook: `useFeatureFlags(moduleKey)` → `boolean`
3. Used in Layout.tsx to show/hide nav items
4. Used in pages to show/hide UI sections

### ⚠️ CRITICAL RULE: Frontend and Backend MUST Use the Same Keys

If you are adding a nav item, the `module:` value in Layout.tsx PRIMARY_NAV 
MUST exactly match the key used in `checkModuleEnabled()` in the backend route.

Example of correct pattern:
```
Backend: router.use(checkModuleEnabled('volunteers'), volunteersRoutes)
Frontend: { href: "/ext/volunteers", label: "Volunteers", module: "volunteers" }
```

Example of what was WRONG (the bug we fixed):
```
Backend: router.use(checkModuleEnabled('organisations'), orgRoutes)  ← used 'organisations'
Frontend: { module: "schools" }  ← used 'schools' ← MISMATCH → bug
```

### Module Registry (Source of Truth)

Location: `lib/db/src/moduleRegistry.ts`

This file defines ALL modules. Before adding a new module:
1. Add it to moduleRegistry.ts first
2. Add the backend route with checkModuleEnabled('your_key')
3. Add the frontend nav item with module: 'your_key'
4. Add the module to the default flags in the seed script

---

## SECTION 7 — AUTHENTICATION SYSTEM

### CRM Auth Flow

1. User POSTs to `/api/auth/login` with `{ email, password }`
2. Backend validates credentials, generates JWT
3. JWT stored in httpOnly cookie `crm_session` (30-day expiry)
4. Bearer header also accepted (for API integrations)
5. All routes use auth middleware to verify the cookie/header
6. CSRF protection: `X-Requested-With: XMLHttpRequest` required on mutating requests
   Exceptions: /api/worker/*, /api/healthz, /api/lms/public/*

### LMS Auth Flow (Separate)

1. LMS users (coaches/PMs) use JWT from CRM auth but access /lms/* routes
2. Public LMS users (students, teachers, parents) use `/api/lms/public/exchange` 
   to swap an invite token for a `lms_session` cookie (2-hour expiry)
3. `requireSessionType()` middleware enforces session type on LMS public routes

### Role Hierarchy

```
SUPER_ADMIN  ← Only 1 (the owner). Bypasses ALL checks. Access to all tenants.
    ↓
OWNER        ← One per tenant. Full tenant control. No cross-tenant access.
    ↓
ADMIN        ← Manages users within their tenant. Full CRM access.
    ↓
MANAGER      ← Full CRM access. Can view all team data. Cannot manage users.
    ↓
OPERATOR     ← Standard user. Own records + shared records.
    ↓
VIEWER       ← Read-only across all records.
    ↓
DEVELOPER    ← System access (logs, errors) but NO client data. (Planned Phase 11)
```

### Currently Broken / Not Yet Built Auth Features

- ❌ No tenant self-service registration (planned Phase 3)
- ❌ No 2FA/MFA (planned Phase 3)
- ❌ No social login (planned Phase 4)
- ❌ No DEVELOPER role (planned Phase 11)
- ⚠️ Admin password seeded via .env SEED_PASSWORD (migration planned Phase 3)
- ⚠️ Live .env was committed to git — credentials have been rotated (Phase 0)

---

## SECTION 8 — LMS ARCHITECTURE

### Important: LMS is a Separate Frontend App

The LMS is NOT part of the CRM frontend. It is a completely separate Vite React application.

```
CRM users access: https://app.hubforte.com  (artifacts/crm/)
LMS users access: https://lms.hubforte.com  (artifacts/lms/)
Both use the SAME backend: https://api.hubforte.com  (artifacts/api-server/)
```

### LMS User Types

1. **Coaches** — Authenticated via CRM JWT. Access `/my-students`, `/cohorts`, `/dashboard`
2. **Programme Managers** — Same as coaches with more access
3. **Teachers** — Public session (lms_session cookie). View their students' progress.
4. **Students** — Public session. Complete surveys. View their report.
5. **Parents/Guardians** — Public session. Complete parent surveys. View child's report.

### LMS Public Routes (No JWT Required)

These accept `lms_session` cookie only:
- POST `/api/lms/public/exchange` — token → session (invite link flow)
- POST `/api/lms/public/exchange-code` — code → session (student code access)
- GET `/api/lms/public/survey` — get survey questions
- POST `/api/lms/public/survey/submit` — submit survey answers
- GET `/api/lms/public/teacher` — teacher's student list
- POST `/api/lms/public/teacher/submit` — teacher submits feedback
- GET `/api/lms/public/report` — student report metadata
- GET `/api/lms/public/report/pdf` — PDF report download

### LMS Connection to CRM (Planned)

Currently: LMS has no link from CRM nav.
Fix (Phase 1C): Add external link in CRM nav. Add VITE_LMS_URL env var.
The two apps remain separate — do NOT merge them.

---

## SECTION 9 — THE NERVOUS SYSTEM (Monitoring Architecture)

### What Already Exists

- **Request logging**: Every API request → `request_logs` table
- **Error logging**: All errors with deduplication → `error_logs` table
- **Audit logging**: Safeguarding + LMS public access → `audit_logs` table
- **Change Data Capture**: Entity mutations → `change_events` table
- **Auto-remediation**: 25+ policies in `remediationEngine.ts` → `remediation_runs` table
- **AI logs**: All AI API calls → `ai_logs` table

### What Is Missing (Planned in Phase 6)

- ❌ Owner-facing health dashboard UI
- ❌ Real-time WebSocket updates
- ❌ Alert system (email + in-app)
- ❌ Predictive monitoring (trend detection)
- ❌ Error knowledge base with AI explanations in plain English
- ❌ Client-facing graceful error handling

### Monitoring Philosophy

**Owner sees everything:**
- Real-time error rate, response times, active sessions
- AI-generated plain English explanations for every error
- Suggested fix steps
- History of all auto-remediation runs

**Clients see nothing technical:**
- Friendly error messages
- Reference codes for support
- Never raw stack traces (especially in production)

### The Remediation Engine

Location: `artifacts/api-server/src/lib/remediationEngine.ts`

This engine runs automatically. Current policies include:
- Retry failed emails
- Flag expired DBS checks
- Close stale support tickets
- Clear broken sessions
- Detect stuck campaigns
- Handle LMS report generation failures
- Detect Puppeteer crashes
- Identify orphaned students
- Flag stale cohorts
(25+ policies total — read the file for full list)

**Rule for agents: NEVER modify remediationEngine.ts unless specifically asked.
It is a critical system. Only call it, do not rewrite it.**

---

## SECTION 10 — INTEGRATION PHILOSOPHY

### Planned Integration Framework

Hubforte should connect to any external tool. Architecture:

1. **Outgoing Webhooks**: Hubforte pushes events to external URLs when things happen
2. **Incoming Webhooks**: External systems push data to Hubforte
3. **Pre-built Connectors**: UI for configuring common services (SendGrid, Slack, etc.)
4. **Universal CSV Import**: Import from any CRM via CSV with smart field mapping
5. **Universal Data Export**: Export all data for portability

### Pre-built Connectors Planned

| Service | Type | Purpose |
|---|---|---|
| SendGrid | Email | Transactional email, campaigns |
| Mailchimp | Marketing | List sync, campaign management |
| Twilio | SMS/Voice | SMS notifications, voice agents |
| Slack | Notifications | Team alerts, deal updates |
| Zapier | Automation | Connect to 5000+ apps via webhooks |
| Make/Integromat | Automation | Similar to Zapier |
| Cal.com | Scheduling | Meeting booking |
| Stripe | Payments | Subscription billing for tenants |
| SignWell/DocuSign | E-signature | Contract signing |
| HubSpot | Import/Export | Data migration |
| Salesforce | Import/Export | Data migration |

### Data Portability Rules

- Any tenant can export ALL their data at any time, no restrictions
- Export formats: CSV, JSON, Excel
- Imports should work from any major CRM via CSV
- No vendor lock-in

---

## SECTION 11 — AI STRATEGY

RULE — Client AI and System AI are completely separate:
- Client AI = business workflow helpers only (email compose, lead scoring,
  next best action, navigation helper).
- System AI = owner tools only (errors, health, briefings, ticket diagnosis).
- These must never be mixed.
- Technical AI features must never appear in any tenant-facing UI.
- BYOK is off by default and can only be enabled by the PLATFORM_OWNER.

### Provider Hierarchy

```
Tenant has custom AI key in tenant_ai_config?
  → YES: Use their key and model (BYOK)
  → NO: Use system default from env vars
    System default: OpenRouter + DeepSeek V3
    (model: deepseek/deepseek-chat)
    Fallback cascade: openrouter → openai → anthropic
```

### Recommended Models

| Use Case | Model | Why |
|---|---|---|
| Default for all features | DeepSeek V3 via OpenRouter | $0.27/M tokens, very capable |
| Simple/quick tasks | GLM-4-Flash via OpenRouter | $0.07/M tokens, fastest |
| Complex reasoning/analysis | DeepSeek R1 via OpenRouter | $0.55/M tokens, best quality |
| Customer's own choice | Any (BYOK) | They pay their own costs |

### AI Features Built/Planned

**Built (backend exists, needs UI):**
- AI email composition helper
- Contact summary generation
- AI-powered report generation (ops_ai_reports table exists)
- AI auto-remediation suggestions

**Planned:**
- Lead scoring (0-100 with AI explanation)
- Next best action suggestions
- AI navigation helper (not a chatbot — just helps users find features)
- Voice agents via Vapi.ai
- Document/proposal generation

### AI Rules

1. NEVER use AI to access `safeguarding_notes` data
2. NEVER expose system API keys in any response to frontend
3. AI features must degrade gracefully (show "AI unavailable" not crash)
4. Track all AI usage per tenant for billing/quota purposes
5. Respect monthly budget limits per tenant

---

## SECTION 12 — DEPLOYMENT ARCHITECTURE

### Target Infrastructure

```
GitHub Repository
    ↓
GitHub Actions (CI/CD)
    ↓
GitHub Container Registry (Docker images)
    ↓
Oracle Cloud Free Tier (2 ARM compute instances)
    ├── Instance 1: api-server + nginx reverse proxy + SSL
    └── Instance 2: crm (static) + lms (static) served by nginx
    
Database: Neon PostgreSQL (managed, serverless, outside the containers)
```

### Environment Variables Required

See `.env.production.example` at project root (to be created in Phase 10)

Critical secrets (NEVER put in git):
- DATABASE_URL
- JWT_SECRET
- SESSION_SECRET
- WORKER_SECRET
- GMAIL_CLIENT_SECRET
- All AI API keys

### Docker Services

| Service | Dockerfile | Port | Notes |
|---|---|---|---|
| api-server | artifacts/api-server/Dockerfile (planned) | 3000 | Main backend |
| crm | artifacts/crm/Dockerfile (planned) | 80 | Nginx serves static build |
| lms | artifacts/lms/Dockerfile (planned) | 81 | Nginx serves static build |
| worker | worker/Dockerfile (exists) | N/A | Daemon, no port |

### Cloud Agnostic Rule

**Do NOT use any OCI-specific APIs in application code.**
The app must work on Railway, Render, Fly.io, or DigitalOcean by only changing environment variables.

---

## SECTION 13 — KNOWN ISSUES (With Status)

| # | Issue | Status | Fix Phase |
|---|---|---|---|
| 1 | Live credentials committed to git | 🔴 URGENT — rotate immediately | Phase 0 |
| 2 | SEED_PASSWORD hardcoded in .env.example | 🔴 HIGH — change after rotating | Phase 0 |
| 3 | Module key mismatch: Organisations/Contacts use 'schools' key | 🟠 HIGH — 1 line fix | Phase 1A |
| 4 | Most modules have no nav entry | 🟠 HIGH | Phase 1B |
| 5 | LMS not linked from CRM | 🟠 HIGH | Phase 1C |
| 6 | No Dockerfile for api-server or crm | 🟠 HIGH | Phase 10 |
| 7 | not_required_1904_12pm/ in the repo | 🟠 HIGH — gitignore fix | Phase 0 |
| 8 | /ai/* routes have no module flag gate | 🟡 MEDIUM | Phase 9 |
| 9 | /remediation/* routes have no module flag gate | 🟡 MEDIUM | Phase 6 |
| 10 | 5 empty stub pages registered as live routes | 🟡 MEDIUM | Phase 2 |
| 11 | No 2FA/MFA | 🟡 MEDIUM | Phase 3 |
| 12 | No tenant self-service onboarding | 🟡 MEDIUM | Phase 3 |
| 13 | Dashboard stats show data for disabled modules | 🔵 LOW | Phase 6 |
| 14 | .replit-artifact/ dirs in source | 🔵 LOW | Phase 2 |
| 15 | programmes nav uses different key than backend cohorts | 🔵 LOW | Phase 1B |

---

## SECTION 14 — RULES FOR ALL AI AGENTS

### MUST ALWAYS DO

1. **Read the module registry first** before adding any feature that involves modules.
   File: `lib/db/src/moduleRegistry.ts`

2. **Check the route index before adding routes.**
   File: `artifacts/api-server/src/routes/index.ts`
   All routes are mounted here. If you add a route file, add it here.

3. **Always check if functionality already exists** before building new.
   We have 62 tables. Many things are already partially built.
   Search the codebase first: `grep -r "functionName" . --include="*.ts"`

4. **Match module keys exactly** between frontend and backend.
   The frontend module string MUST equal the backend checkModuleEnabled() string.

5. **Respect tenant isolation** in all new database queries.
   Every query that accesses entity data MUST include `WHERE tenant_id = :tenantId`
   Check how existing queries do this and follow the same pattern.

6. **Use the existing aiProvider.ts** for any AI calls.
   Do NOT call OpenAI/Anthropic directly. Always use the abstraction layer.
   File: `artifacts/api-server/src/lib/aiProvider.ts`

7. **Use the existing logger** for all logging.
   File: `artifacts/api-server/src/lib/logger.ts`
   Pattern: `logger.info({ userId, tenantId }, 'Action description')`

8. **Add new env vars to .env.example** (NOT .env — never commit .env).

9. **Add new DB tables as Drizzle schema files** in `lib/db/src/schema/`.
   Create a new migration SQL file in `lib/db/migrations/`.
   Do NOT use `drizzle-kit push` in production.

### MUST NEVER DO

1. **NEVER commit .env files or credentials to git.**
   Always check .gitignore before suggesting file changes.

2. **NEVER bypass tenant isolation.**
   SUPER_ADMIN can see all tenants. Every other role is scoped by tenantId.

3. **NEVER access safeguarding_notes through the report engine.**
   This is explicitly blocked. Keep it blocked.

4. **NEVER return stack traces to the client in production.**
   The error handler strips these. Do not bypass it.

5. **NEVER modify remediationEngine.ts unless specifically asked.**
   It is a complex, critical system.

6. **NEVER change the Drizzle schema without creating a migration file.**
   The migration file must be a SQL file in lib/db/migrations/.

7. **NEVER use npm or yarn in this project.** Always use pnpm.

8. **NEVER import from not_required_1904_12pm/.**
   This is dead code.

9. **NEVER give non-SUPER_ADMIN users access to:**
   - Other tenants' data
   - System health metrics
   - Error logs with stack traces
   - Module configuration

10. **NEVER use localStorage or sessionStorage in artifacts.**
    (Claude.ai artifacts don't support these.)

### BEFORE EVERY TASK

Run this mental checklist:
- [ ] Have I read the relevant section of this document?
- [ ] Have I searched the codebase to see if this already exists?
- [ ] Am I using pnpm (not npm)?
- [ ] Will all new DB queries include tenant_id scoping?
- [ ] Are frontend and backend module keys matching?
- [ ] Am I adding to .env.example (not .env)?
- [ ] Is there a migration file for any schema changes?

---

## SECTION 15 — VISION & GUIDING PRINCIPLES

### The North Star

Hubforte should be the **best CRM + LMS platform ever built**, measured by:
1. **Reliability**: Clients never face unresolved issues. Errors are detected, explained, and fixed in hours.
2. **Flexibility**: Any module can be turned on or off per client with a single click.
3. **Connectivity**: Works with every tool a client already uses.
4. **Intelligence**: AI is woven into workflows, not bolted on as a chatbot.
5. **Simplicity**: The owner manages it all without needing to code.
6. **Trust**: Clients can always export their data and leave cleanly.

### The Nervous System Principle

The system must detect problems before clients do. Every error must:
1. Reach the owner within minutes
2. Be explained in plain English
3. Have an AI-suggested fix
4. Be automatically fixed where possible
5. Never be visible to clients as a technical error

### The Salesforce Benchmark

We should match or exceed Salesforce in these areas:
- Sales pipeline management ✅ (built)
- Contact and account management ✅ (built)
- Campaign management ✅ (built)
- Reports and dashboards ✅ (built, needs UI polish)
- Automation ✅ (built)
- AI-powered insights (in progress)
- Integration ecosystem (in progress)
- Mobile access (planned)

We exceed Salesforce in:
- Built-in LMS (Salesforce has no equivalent)
- Safeguarding and compliance tools
- Educational programme management
- Price (fraction of Salesforce cost)
- Module-level tenant customisation
- Self-healing/auto-remediation

---

## SECTION 16 — UPDATE LOG

| Date | Change | Phase |
|---|---|---|
| 2026-04-23 | Initial audit and system bible created | Phase 0 |
| | (Add entries here as each phase is completed) | |

### How to Update This Document

When you complete a phase or add a significant feature:
1. Update the relevant section with the new information
2. Change the status of any issues you fixed in Section 13
3. Add new modules to Section 4 if created
4. Add new tables to Section 5 if created
5. Add a line to Section 16 with date, what changed, and phase number

---

*This document was generated from a full structural and code audit of the Hubforte 
monorepo on 2026-04-23. It should be updated after each significant change to the 
codebase. If you find this document contradicts what's in the code, the CODE is 
the truth — update this document to match.*
