# Hubforte — AGENT CONTEXT & SYSTEM BIBLE v2.0
### THE SINGLE SOURCE OF TRUTH — READ THIS ENTIRELY BEFORE TOUCHING ANY FILE
**Version:** 2.0 | **Date:** 2026-04-24
**Location:** Active file is `framework/HUBFORTE_AGENT_CONTEXT_v2.md` in the project root.
**Purpose:** This document tells any AI agent — Claude, Codex, Copilot, or any future tool —
exactly what this project is, what it must become, and what the absolute rules are.
If you are an AI agent and you find yourself uncertain about a decision, stop and re-read
the relevant section here before proceeding. When in doubt: do not change anything and
ask the owner for clarification.

**Version rule:** `HUBFORTE_AGENT_CONTEXT_v2.md` is the active source of truth.
Only consult the older `framework/HUBFORTE_AGENT_CONTEXT.md` when another active v2 document
explicitly tells you to reuse older v1 material.

---

## ⚠️ MOST IMPORTANT RULES (Read Before Anything Else)

1. NEVER commit .env files or credentials to git.
2. NEVER return stack traces to clients in production.
3. NEVER bypass tenant isolation — every non-SUPER_ADMIN query must be scoped by tenant_id.
4. NEVER modify remediationEngine.ts unless explicitly instructed.
5. NEVER let frontend module keys differ from backend checkModuleEnabled() keys.
6. NEVER use npm or yarn — always use pnpm.
7. NEVER access safeguarding_notes through the report engine or standard import/export.
8. ALWAYS check if something already exists before building it.
9. ALWAYS add new DB tables as Drizzle schema files with a corresponding SQL migration.
10. ALWAYS use the existing aiProvider.ts for AI calls — never call OpenAI/Anthropic directly.

---

## SECTION 1 — WHAT THIS PROJECT IS

### The One-Line Description
Hubforte is a multi-tenant, modular business platform that combines CRM, LMS, compliance
operations, and analytics — where any combination of features can be turned on or off
per client with a single click.

### The Owner
This project is built and managed by a single person who is a "vibe coder" — someone
who builds using AI agents rather than writing code manually. This person has a clear
product vision but relies on AI agents to implement it. Every decision in this codebase
must be agent-friendly: clear naming, consistent patterns, no surprising magic.

The owner's core goal: be able to give any AI agent this document and have it understand
the project well enough to make safe, correct changes.

### What The Platform Contains

**CRM (Customer Relationship Management)**
The sales and relationship management core. Contacts, organisations, pipeline/deals,
outreach campaigns, email templates, activities, notes, tasks, and support tickets.
This is the heart of the system and is always enabled.

**LMS (Learning Management System)**
A full education management system built alongside the CRM. Programmes, cohorts,
sessions, student surveys, coach narratives, parent surveys, attendance, outcome tracking,
and PDF report generation. This runs as a separate frontend application (artifacts/lms/).

**Operations & Compliance**
Safeguarding notes (highly sensitive), consent management for minors, outcome frameworks,
field visibility controls, and record type configuration. Primarily used by education
and social impact organisations.

**Analytics & Reporting**
A powerful report engine that supports filtering, sorting, grouping, CSV export,
scheduled delivery, and custom dashboards. Built on the /reports endpoint.

**Integration Layer**
Webhooks (outgoing and incoming), pre-built connectors (SendGrid, Slack, Mailchimp,
Twilio), universal CSV import from any CRM, and a Standalone App Framework for
connecting custom applications.

**AI Layer**
Dual AI configuration: System AI (Anthropic Claude for owner tools like error explanations
and daily briefings), Client AI (OpenRouter + DeepSeek V3 for end-user features like
email composition and lead scoring). BYOK (Bring Your Own Key) supported.

**Monitoring & Self-Healing**
The "Nervous System": a real-time health dashboard, automated incident detection with
P1/P2/P3/P4 severity levels, AI-generated plain-English error explanations, 25+ auto-
remediation policies, and a client-facing error protection layer.

### The Modular Toggle System
Every feature is gated by a module flag per tenant. Enabling or disabling a module
instantly shows or hides it in the UI and blocks or allows the backend routes.
This is the commercial differentiator: one platform, unlimited configurations.

---

## SECTION 2 — THE VISION (What This Must Become)

### The North Star
Hubforte must be better than Salesforce for the clients it serves. This means:

| What Salesforce Does Well | How Hubforte Matches or Beats It |
|---|---|
| Sales pipeline management | ✅ Built. Match. |
| Contact & account management | ✅ Built. Match. |
| Reports & dashboards | ✅ Built. Needs UI polish. |
| Workflow automation | ✅ Built. ✅ Nav added. |
| Campaign management | ✅ Built. ✅ Nav added. |
| AI (Einstein) | In progress. Will match via OpenRouter. |
| Mobile access | Planned (PWA first, then native). |
| Integration marketplace | In progress. Webhook framework building. |
| Self-healing/auto-remediation | **Exceeds Salesforce.** 25+ policies built. |
| Built-in LMS | **Exceeds Salesforce.** No equivalent exists in Salesforce. |
| Safeguarding & compliance | **Exceeds Salesforce.** Built for education sector. |
| Per-tenant module configuration | **Exceeds Salesforce.** One-click toggle per client. |
| Price | **Exceeds Salesforce.** Fraction of $165/user/month cost. |

### The Nervous System Principle
Every error in the system must behave like pain in a human nervous system:
- Detected within minutes (not hours)
- Reaches the owner immediately (not after clients complain)
- Explained in plain English (not technical jargon)
- Fixed by AI where possible (automatically)
- Never visible to clients as a raw error

### The Professionalism Standard
No one should know this is vibe-coded. This means:
- Every user-facing error message is human and clear
- Every empty state has a helpful message and action
- Every loading state shows a skeleton or spinner (no blank pages)
- Every form has clear validation feedback
- Mobile layout is functional down to 768px
- Dark mode works correctly on every page
- API responses are consistent in shape (always { success, data } or { error, code, message })
- The codebase has consistent naming (no mix of camelCase and snake_case in the same layer)

### The Integration Philosophy
Hubforte is the hub of a client's tech stack. Like electricity from a socket, any tool
can plug in. The integration framework must support: outgoing webhooks, incoming webhooks,
pre-built connectors, CSV import from any CRM, full data export to any format, and the
Standalone App Framework for custom applications.

### The Trust Principle
Clients must trust Hubforte the same way they trust Salesforce, AWS, or SAP. This trust is built by:
1. A public status page showing real-time system health
2. Proactive incident communication (telling clients before they notice)
3. Full data portability (they can always leave cleanly)
4. Never losing client data
5. P1 incidents resolved within 1 hour

---

## SECTION 3 — REPOSITORY STRUCTURE

```
Hubforte/                                    ← Project root
├── artifacts/
│   ├── api-server/                        ← MAIN BACKEND (Express + TypeScript)
│   │   └── src/
│   │       ├── app.ts                     ← Express setup, middleware chain, error handler
│   │       ├── index.ts                   ← Server start, WebSocket setup
│   │       ├── routes/
│   │       │   ├── index.ts               ← ALL ROUTE MOUNTING — read this first
│   │       │   ├── auth.ts                ← Login, register, 2FA, forgot password
│   │       │   ├── organizations.ts       ← Org CRUD (gated: organisations)
│   │       │   ├── contacts.ts            ← Contact CRUD (gated: contacts)
│   │       │   ├── health.ts              ← System health API
│   │       │   ├── lms/                   ← 19 LMS route files
│   │       │   └── ...                    ← One file per module
│   │       ├── middlewares/
│   │       │   ├── auth.ts                ← JWT verification, role check, tenant scope
│   │       │   └── ...
│   │       └── lib/
│   │           ├── featureFlags.ts        ← checkModuleEnabled() + 1-min cache
│   │           ├── aiProvider.ts          ← AI abstraction (Anthropic/OpenAI/OpenRouter)
│   │           ├── remediationEngine.ts   ← Auto-remediation (DO NOT MODIFY unless told)
│   │           ├── incidentDetector.ts    ← P1/P2/P3/P4 detection
│   │           ├── incidentNotifier.ts    ← Alerting + client comms
│   │           ├── statusPage.ts          ← Instatus API integration
│   │           ├── webhookDelivery.ts     ← Outgoing webhook delivery
│   │           └── logger.ts              ← Pino structured logging
│   ├── crm/                               ← CRM FRONTEND (React 18 + Vite + Wouter)
│   │   └── src/
│   │       ├── App.tsx                    ← ALL CRM ROUTES — add new routes here
│   │       ├── main.tsx                   ← App entry, ThemeProvider wrapper
│   │       ├── components/
│   │       │   ├── Layout.tsx             ← SIDEBAR + TOP BAR (nav lives here)
│   │       │   ├── ThemeProvider.tsx      ← Dark/light mode
│   │       │   ├── CommandPalette.tsx     ← Ctrl+K search
│   │       │   ├── ErrorBoundary.tsx      ← Catch rendering errors
│   │       │   └── ui/                    ← shadcn/ui components
│   │       ├── pages/
│   │       │   ├── LoginPage.tsx          ← Login
│   │       │   ├── RegisterPage.tsx       ← Self-service registration
│   │       │   ├── TwoFactorPage.tsx      ← 2FA/MFA
│   │       │   └── extended/              ← Module-specific pages (/ext/* routes)
│   │       └── hooks/
│   │           └── useFeatureFlags.ts     ← Frontend module flag check
│   └── lms/                               ← LMS FRONTEND (separate Vite app)
│       └── src/
│           ├── App.tsx                    ← LMS routes
│           └── pages/                     ← 27 LMS pages
├── lib/
│   ├── db/
│   │   ├── src/
│   │   │   ├── schema/                    ← 62 Drizzle ORM schema files (one per table)
│   │   │   └── moduleRegistry.ts          ← MASTER MODULE LIST — always read before
│   │   │                                    adding any feature related to modules
│   │   └── migrations/                    ← SQL migration files (always create one for
│   │                                        any schema change — never use drizzle push)
│   ├── api-spec/                          ← OpenAPI spec
│   ├── api-zod/                           ← Zod validation schemas
│   └── api-client-react/                  ← React hooks for API calls
├── worker/                                ← Campaign worker daemon (has Dockerfile)
├── scripts/
│   ├── emergency-access.ts                ← Break-glass emergency access
│   └── ...                               ← DB seed, backup, migration runners
├── docs/                                  ← Architecture documentation (36 files)
├── ops/                                   ← Runbooks: DEPLOY, INCIDENT, ROLLBACK
├── framework/                             ← ← ← THIS FILE LIVES HERE
│   └── HUBFORTE_AGENT_CONTEXT.md           ← The document you are reading now
├── not_required_1904_12pm/               ← DEAD CODE — do not import from here
└── pnpm-workspace.yaml                   ← Workspace packages
```

---

## SECTION 4 — TECH STACK

| Layer | Technology | Important Notes |
|---|---|---|
| Package manager | pnpm (monorepo) | NEVER use npm or yarn |
| Backend | Express.js + TypeScript | ESBuild compilation |
| Frontend (CRM) | React 18 + Vite + Wouter | NOT Next.js. Wouter not React Router. |
| Frontend (LMS) | React 18 + Vite + Wouter | Completely separate app |
| CSS/UI | Tailwind CSS + shadcn/ui | Components in artifacts/crm/src/components/ui/ |
| Database | PostgreSQL (Neon serverless) | Drizzle ORM, row-level multi-tenancy |
| Auth | JWT (httpOnly cookie crm_session) | Bearer header also accepted |
| System AI | Anthropic Claude (primary) | For owner tools: errors, briefings, health |
| Client AI | OpenRouter + DeepSeek V3 | For client features: email compose, lead score |
| Logging | Pino (JSON structured) | → request_logs and error_logs DB tables |
| Background jobs | Worker daemon (worker/) | Already has Dockerfile |
| LMS Auth | lms_session cookie (2hr) | Separate from CRM auth |
| Testing | Vitest | Smoke tests only currently |

---

## SECTION 5 — THE MODULE SYSTEM (Critical — Read Carefully)

### The Golden Rule of Modules
The module key string used in the frontend useFeatureFlags() hook
MUST EXACTLY MATCH the key string used in the backend checkModuleEnabled() call.
One typo = a module silently disappears or incorrectly appears for the wrong tenant.

### How Module Flags Work (Backend)

Location: artifacts/api-server/src/lib/featureFlags.ts

Flow:
1. Receives moduleKey (string) from the route middleware
2. If user is PLATFORM_OWNER (SUPER_ADMIN): pass — no flag check
3. Gets tenantId from req.user.tenantId
4. Checks tenant_feature_flags table for { tenantId, moduleKey }
   - Row found → use its enabled value
   - Row not found → check global feature_flags table
   - Not in global either → DEFAULT TO DISABLED (safe-fail — important!)
5. 1-minute in-memory cache to avoid DB hit on every request
6. Cache is cleared when module is toggled via Module Control Centre

### How Module Flags Work (Frontend)

Location: artifacts/crm/src/hooks/useFeatureFlags.ts

Flow:
1. On app load: fetch GET /api/feature-flags (public, returns flags for current session)
2. Stores in React state
3. useFeatureFlags('moduleKey') → returns boolean
4. Used in Layout.tsx to show/hide nav items
5. Used in page components to show/hide sections

### Existing Module Keys (Complete List)

**Core — Always On:**
| Key | Backend Route | Nav? | Notes |
|---|---|---|---|
| organisations | /organizations/* | ✅ RESOLVED Phase 1A | |
| contacts | /contacts/* | ✅ RESOLVED Phase 1A | |
| activities | /activities/* | No (inline on detail pages) | |
| pipeline | /opportunities/* | ✅ | |
| reports | /reports/* | ✅ | |

**Engagement:**
| Key | Backend Route | Nav? |
|---|---|---|
| outreach | /outreach, /campaigns, /templates | ✅ |
| support | /support/* | ✅ |
| gmail | /gmail/* | Settings only |

**People:**
| Key | Backend Route | Nav? |
|---|---|---|
| volunteers | /volunteers/* | ✅ |
| funders | /funders/* | ✅ |

**Delivery:**
| Key | Backend Route | Nav? |
|---|---|---|
| programmes | /ext/programmes | ✅ |
| cohorts | /programme-cohorts/* | ✅ |
| sessions | /programme-sessions/* | Sub-module of cohorts |
| lms | /lms/*, /lms/public/* | External link (separate app) |

**Compliance:**
| Key | Backend Route | Nav? |
|---|---|---|
| outcomes | /outcome-frameworks/*, /outcome-records/* | ✅ |
| safeguarding | /safeguarding-notes/*, /safeguarding-access-logs/* | ✅ |
| consent | /consent-records/*, /parent-guardians/* | Sub-module |

**Tools:**
| Key | Backend Route | Nav? |
|---|---|---|
| automation | /automation-rules/* | ✅ |
| attachments | /attachments/* | ✅ |
| import_export | /import, /importexport | In settings |

**System (no UI, internal use):**
| Key | Notes |
|---|---|
| ai | Currently ungated — needs module flag added (Phase 10) |
| field_visibility | Admin settings only |
| record_types | Admin settings only |

### Adding a New Module (Correct Process)
1. Add to lib/db/src/moduleRegistry.ts (key, category, description, required, defaultEnabled)
2. Create migration to add to feature_flags table with default value
3. Add to backend route with: router.use(checkModuleEnabled('your_key'), yourRoutes)
4. Add to frontend nav in Layout.tsx with: { label, href, module: 'your_key', icon }
5. Verify keys match exactly between steps 3 and 4

---

## SECTION 6 — DATABASE SCHEMA

**Multi-tenancy:** Row-level. Every table has a tenant_id column.
**ORM:** Drizzle ORM. Schema files in lib/db/src/schema/.
**Migrations:** SQL files in lib/db/migrations/. NEVER use drizzle-kit push in production.
**Migration rule:** Any schema change = a new SQL migration file.

### Route & Module Notes (audit-verified 2026-04-29)
- consent routes (`/consent-records/*`, `/parent-guardians/*`) now use `checkModuleEnabled("consent")` — key renamed from `"consent_management"`. ✅ RESOLVED FIX-3.
- `/remediation/*` now gated by `requireRole("SUPER_ADMIN")` only — removed ADMIN/MANAGER access and automation module flag. ✅ RESOLVED FIX-3.
- `/notifications/*` is confirmed behind `authMiddleware` (verified in routes/index.ts:75). ✅ RESOLVED FIX-3.

### All 62+ Tables

**CRM Core:**
contacts, organizations, activities, notes, tasks, sessions (user sessions)

**Sales:**
funding_opportunities (deals/pipeline), campaigns, templates

**People:**
funders, volunteers, placements

**Delivery/LMS:**
programmes, programme_cohorts, programme_sessions, session_attendance, students,
lms_access_tokens, lms_ai_summaries, lms_chosen_talents, lms_coach_narratives,
lms_cohort_narratives, lms_forward_to_future, lms_impact_snapshots, lms_parent_surveys,
lms_public_sessions, lms_reports, lms_student_surveys, lms_talent_scores,
lms_teacher_feedback, lms_trip_data

**Compliance:**
safeguarding_notes (HIGHLY SENSITIVE — extra access logging, blocked from report engine),
safeguarding_access_log, consent_records, parent_guardians,
outcome_frameworks, outcome_records

**Users/Auth:**
users, tenants, sessions, password_resets, tenant_feature_flags, feature_flags

**Configuration:**
record_type_configs, tenant_field_visibility

**Integrations:**
gmail (credentials), automation_rules, registered_apps (to be built)

**Monitoring:**
request_logs, error_logs, audit_logs, change_events, ai_config, ai_logs,
remediation_policies, remediation_runs, ops_ai_reports, incidents (to be built),
monitoring_alerts (to be built)

**Analytics:**
saved_reports, dashboards, report_types, field_history

**Support:**
support (tickets + comments), notifications

**Import/Export:**
(import history table to be built)

---

## SECTION 7 — AUTHENTICATION SYSTEM

### CRM Auth Flow
POST /api/auth/login → verify credentials → set crm_session httpOnly cookie (JWT, 30 days)
Bearer header also accepted for API clients.
CSRF protection: X-Requested-With: XMLHttpRequest header required on all mutating requests.
Exceptions: /api/worker/*, /api/healthz, /api/lms/public/*

### LMS Auth Flow (Separate System)
Public LMS users (students, teachers, parents): POST /api/lms/public/exchange
  → invite token → lms_session cookie (2-hour expiry)
Coaches/PMs: use standard CRM JWT — no separate LMS login needed

### Role Hierarchy (Updated in Phase 6)

```
PLATFORM_OWNER (database: SUPER_ADMIN or PLATFORM_OWNER)
  └── All access. All tenants. System settings. Break glass.
      Only 1 person: the owner of this project.
      
WORKSPACE_OWNER (per-tenant)
  └── All access within their tenant.
      Can: manage users, configure modules, view usage.
      Cannot: see other tenants, global settings.
      
WORKSPACE_ADMIN (per-tenant)
  └── Full CRM/LMS access.
      Can: manage users (not WORKSPACE_OWNER), imports, settings.
      Cannot: change module flags, billing.
      
TEAM_MANAGER (per-tenant)
  └── Full CRM access.
      Can: see all team records, run org-wide reports.
      Cannot: manage users, settings.
      
TEAM_MEMBER (per-tenant)
  └── Standard CRM access.
      Can: own records + assigned records.
      Cannot: see all reps' records, run org-wide reports.
      
READ_ONLY (per-tenant)
  └── View everything accessible, run reports.
      Cannot: create, edit, delete anything.
      
DEVELOPER (system-level)
  └── Error logs, health dashboard, API docs.
      Cannot: see any client data.
      
PLATFORM_BUILDER (system-level)
  └── DEVELOPER access + framework docs + agent context.
      Can: use AI agents to make code changes (with context).
      Cannot: see client data, access production secrets.
```

### Display Names (Friendly Labels)
Database: SUPER_ADMIN | Display: "Platform Owner"
Database: WORKSPACE_OWNER | Display: "Workspace Owner"
Database: ADMIN | Display: "Workspace Admin"
Database: MANAGER | Display: "Team Manager"
Database: OPERATOR | Display: "Team Member"
Database: VIEWER | Display: "Read Only"
Database: DEVELOPER | Display: "Developer"
Database: PLATFORM_BUILDER | Display: "Platform Builder"

### Emergency Access (Break Glass)
If the owner is locked out, the emergency access system provides recovery.
Script: scripts/emergency-access.ts
Creates a temporary 2-hour window for PLATFORM_OWNER access.
Requires: EMERGENCY_ACTIVATION_TOKEN from .env (stored physically, not digitally).
Every activation is logged to audit_logs and triggers an email notification.
The emergency account is suspended by default and auto-suspends after use.

---

## SECTION 8 — LMS ARCHITECTURE

### Key Fact: LMS is a Separate Frontend
The CRM and LMS are separate Vite applications that share the same backend API.
Do NOT merge them. They are connected via:
- CRM nav: external link to LMS URL (VITE_LMS_URL env var)
- Same backend API (same server, different routes)
- Same authentication (CRM JWT works on /lms/* routes)

### LMS Deployment
In production: api.hubforte.com (shared backend), app.hubforte.com (CRM), lms.hubforte.com (LMS)
In development: localhost:3000 (backend), localhost:5173 (CRM), localhost:5174 (LMS)

### LMS User Types
1. Coaches/PMs: Authenticated via standard CRM JWT. Full LMS access.
2. Teachers: lms_session cookie (from invite link). View their students.
3. Students: lms_session cookie (from access code). Complete surveys, view report.
4. Parents: lms_session cookie (from invite link). Complete parent survey.

### LMS Public Routes (No JWT — session cookie only)
POST /api/lms/public/exchange — invite token → session cookie
POST /api/lms/public/exchange-code — student code → session cookie
GET/POST /api/lms/public/survey — student/parent survey
GET/POST /api/lms/public/teacher — teacher view + feedback submission
GET /api/lms/public/report — student report (metadata + PDF)

---

## SECTION 9 — THE NERVOUS SYSTEM (Monitoring Architecture)

### What Already Exists
- Request logging: every API request → request_logs table
- Error logging: all errors with deduplication → error_logs table (occurrenceCount tracked)
- Audit logging: safeguarding + LMS public access → audit_logs
- Change Data Capture: entity mutations → change_events
- Auto-remediation: 25+ policies in remediationEngine.ts → remediation_runs table
- AI logs: all AI API calls → ai_logs

### What Is Being Built (Phase 7)
- Health dashboard UI at /super-admin/health
- Real-time WebSocket updates (30-second intervals)
- P1/P2/P3/P4 incident detection via incidentDetector.ts
- Owner alerting via email + in-app (incidentNotifier.ts)
- Client-facing incident notifications for P1/P2 events
- Public status page integration (Instatus)
- AI-generated plain-English error explanations
- Error knowledge base (viewable/editable by owner and developers)

### Incident Severity Levels
P1 — Critical: System down, auth broken. Owner notified in 5 min. Target fix: 1 hour.
P2 — High: Major feature broken. Owner notified in 15 min. Target fix: 4 hours.
P3 — Medium: Feature degraded, workaround exists. Notify in 2 hours. Fix: 24 hours.
P4 — Low: Minor issue. Collected in daily digest. Fix: 72 hours.

### The Remediation Engine
Location: artifacts/api-server/src/lib/remediationEngine.ts (1,252 lines)
This runs automatically. Has 25+ policies. DO NOT MODIFY unless explicitly instructed.
Call it, do not rewrite it.

---

## SECTION 10 — AI CONFIGURATION

### AI Access Rules — Non-Negotiable

BYOK (Bring Your Own Key):
- BYOK is DISABLED by default for all tenants.
- Only the PLATFORM_OWNER can enable BYOK for a specific tenant.
- Tenants cannot self-enable BYOK from inside the product UI.
- There is no "request BYOK" button or flow in the client UI.
- Until BYOK is enabled for a tenant, all their AI features use the
  platform default (OpenRouter + DeepSeek V3).

Technical AI vs Client AI:
- CLIENT AI = helpful business tools only: email composer, lead scoring,
  next best action, navigation helper.
- TECHNICAL AI = owner and team only: ticket diagnosis, error explanation,
  remediation, health dashboard AI, daily owner briefing.
- Clients must never see technical AI tools by default.
- No technical AI feature should appear in any tenant-facing UI.

Support Ticket AI Diagnosis specifically:
- /support/tickets/:id/diagnose is a TECHNICAL AI feature.
- It is disabled by default for all tenants.
- Only the PLATFORM_OWNER can enable it for a specific tenant.
- It must always use SYSTEM AI (Anthropic/Claude), not tenant client AI.
- It must never count against a tenant's AI budget.

Super-Admin AI Control Toggles:
- The PLATFORM_OWNER controls byokEnabled and aiDiagnosisEnabled
  per tenant via the super-admin tenant detail page.
- These toggles live in the AI Permissions section of the tenant
  detail panel, after the module toggles.
- Both default to FALSE in the tenants table.
- Every change is written to audit_logs with: action, tenantId,
  changedBy, field, oldValue, newValue, timestamp.
- Disabling byokEnabled also clears the tenant's stored AI key
  from tenant_ai_config (api_key set to null).
- byokEnabled controls whether the BYOK section is visible in
  the tenant's own Settings page.
- aiDiagnosisEnabled controls whether the AI Diagnose button
  appears on support tickets for that tenant.

### Dual AI System

**System AI (for the owner — health, errors, briefings):**
Primary: Anthropic Claude (via ANTHROPIC_API_KEY)
Fallback: OpenAI (via OPENAI_API_KEY)
Purpose: Error explanations, daily briefings, remediation suggestions, knowledge base

**Client AI (for tenant users — features):**
Default: OpenRouter + DeepSeek V3 (model: deepseek/deepseek-chat)
Cost: ~$0.27/million tokens — extremely cost-effective
BYOK: Tenants can override with their own key/model via tenant_ai_config table

### AI Provider Resolution (getAIProvider function)
Context = 'system' → use SYSTEM_AI_PROVIDER (Anthropic → OpenAI fallback)
Context = 'client' + tenantId → check tenant_ai_config → if custom: use it → if not: OpenRouter

### Client AI Features Built/Planned
- Email composer: generate draft outreach emails
- Contact summary: 2-3 sentence AI summary of a contact's status
- Lead scoring: 0-100 score with explanation (Cold/Warm/Hot/Ready)
- Next best action: one specific recommended action for a contact
- Navigation helper: maps text questions to pages/features (not a chatbot)
- Daily owner briefing: 8am email summary of system + business status

### AI Cost Management
Track usage in tenant_ai_config.usageThisMonth.
Enforce budget limits: if usage > monthlyBudget → return error message.
Never expose system API keys in any response.
All AI features must degrade gracefully (show "AI unavailable" — do not crash).
AI must never access safeguarding_notes data.

---

## SECTION 11 — DATA IMPORT & EXPORT

### Import Principles
- Parent-before-child: always import Organizations → Contacts → Deals → Activities
- Smart field mapping: preset mappings for Salesforce, HubSpot, Pipedrive, Zoho
- Full validation before executing (show all errors, let user decide how to handle)
- Duplicate detection: skip, update, or create new — user chooses
- All imports run via background worker queue (not blocking the HTTP response)
- Every import scoped to the current tenant_id — never cross-tenant

### Export Principles
- Every client has the right to export ALL their data at any time (GDPR requirement)
- Export formats: CSV (for Excel/AppSheet/HubSpot), JSON (for developers/APIs), XLSX
- The full ZIP export includes:
  - A .csv file per entity type
  - A .json file per entity type
  - A README.md explaining what each file contains in plain English
  - A schema.json showing all field names and types
- This schema.json approach makes the export work with ANY system — including ones
  that don't exist yet. Any developer can read schema.json and import to anything.
- safeguarding_notes are explicitly excluded from standard exports
- Export links expire after 24 hours (security)

---

## SECTION 12 — INTEGRATION FRAMEWORK

### Standalone App Framework
Any custom application connects to Hubforte using:
1. App registration: POST /api/apps → returns apiKey + webhookSecret
2. Authentication: X-Hubforte-App-Key header on API calls
3. Scoped API: /api/v1/* endpoints with permission scopes
4. Webhooks: Hubforte pushes events to the app's webhookUrl

Planned standalone apps using this framework:
- Voice agent (Vapi.ai + Hubforte contact lookup + activity logging)
- Attachment monitoring (view tracking on shared documents)
- Quote/proposal builder (Puppeteer PDF generation)

### Pre-Built Connectors
All stored in integration_configs table (credentials encrypted with AES-256).
Planned: SendGrid, Mailchimp, Twilio, Slack, Zapier, Make/Integromat, Cal.com, Stripe

### Outgoing Webhooks
Stored in webhooks table.
Events supported: contact.created/updated/deleted, deal.created/updated/won/lost,
activity.created, task.created/completed, campaign.sent, support.ticket.created/resolved
Delivery: HMAC-signed with X-Hubforte-Signature header, 3 retries with exponential backoff

---

## SECTION 13 — DEPLOYMENT

### The Pipeline
Windows laptop (VS Code + Claude/Codex) → GitHub → GitHub Actions → GitHub Container Registry → OCI (Oracle Cloud Free Tier)

### Services
api-server: Dockerfile at artifacts/api-server/Dockerfile (to be built in Phase 13)
crm: Dockerfile at artifacts/crm/Dockerfile (to be built)
lms: Dockerfile at artifacts/lms/Dockerfile (to be built)
worker: Dockerfile at worker/Dockerfile (already exists)

### Cloud-Agnostic Rule
NEVER use any OCI-specific APIs in application code.
The app must deploy to Railway, Render, Fly.io, or DigitalOcean by only changing environment variables.

### Critical Environment Variables
(Never commit these — stored locally only)
DATABASE_URL, JWT_SECRET, SESSION_SECRET, WORKER_SECRET,
GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN,
ANTHROPIC_API_KEY, OPENAI_API_KEY, OPENROUTER_API_KEY,
EMERGENCY_ACTIVATION_TOKEN, SUPER_ADMIN_EMAIL,
INSTATUS_API_KEY, INSTATUS_PAGE_ID

---

## SECTION 14 — BUSINESS OPERATIONS (SLAs & Processes)

### Incident Response SLAs
| Level | Condition | Owner Alert | Client Alert | Target Resolution |
|---|---|---|---|---|
| P1 | System down / auth broken | 5 minutes | Yes (email) | 1 hour |
| P2 | Major feature broken | 15 minutes | Yes (email) | 4 hours |
| P3 | Feature degraded | 2 hours | No | 24 hours |
| P4 | Minor/cosmetic | Daily digest | No | 72 hours |

### Client Onboarding Process
(To be implemented as a repeatable checklist — see ops/CLIENT_ONBOARDING.md)
1. Client signs up → receives verification email
2. Email verified → workspace activated with default module set
3. Automated welcome email with "Getting started" steps
4. Data import wizard accessible from dashboard
5. First login: guided tour of enabled modules
6. 7-day check-in: automated email asking if they need help

### Client Offboarding Process (Data Portability)
1. Client clicks "Export all my data" in Settings
2. Background job runs (can take minutes for large accounts)
3. Client receives email with download link (24hr expiry)
4. ZIP contains all data in CSV + JSON + schema.json
5. Client can import this data to any other system
6. Account suspended for 30 days (recovery period), then deleted
Note: This builds trust and removes sales objections. Clients who know they can leave
freely are more likely to stay.

### Accepted as future phases — not blocking go-live
- Voice Agent (Vapi.ai)
- Sales Forecasting
- Quote/Proposal PDF builder
- E-signature (SignWell/DocuSign)
- Mobile PWA
- Stripe billing
- Territory management
- Commission tracking
- Customer self-service portal
- Daily owner briefing email (8am)
- SendGrid as real connector (currently UI card)
- Slack as real connector (currently UI card)
- Import/export via worker queue

### Team Access Levels
When you hire someone, decide which access they get:
- Developer: sees errors and system traces, fixes bugs, cannot see client data
- Platform Builder: Developer + AI agent context, can make code changes with assistance
- Workspace Admin: manages a specific client's workspace, cannot see other clients

---

## SECTION 15 — KNOWN ISSUES & RESOLUTION STATUS

| # | Issue | Status | Phase |
|---|---|---|---|
| 1 | Live credentials in git | ✅ RESOLVED | Phase 0 |
| 2 | SEED_PASSWORD hardcoded | 🔴 HIGH | Phase 0 |
| 3 | No emergency access / break glass | ✅ RESOLVED | Phase 0C |
| 4 | Organisations/Contacts nav broken | ✅ RESOLVED Phase 1A | Phase 1A |
| 5 | 11 modules have no nav entry | ✅ RESOLVED Phase 1B | Phase 1B |
| 6 | LMS not linked from CRM | ✅ RESOLVED Phase 1C | Phase 1C |
| 7 | Import not built | ✅ RESOLVED Phase 2 | Phase 2 |
| 8 | No AppSheet/future-system export | ✅ RESOLVED Phase 2B | Phase 2B |
| 9 | No tenant self-service signup | ✅ RESOLVED Phase 3B | Phase 3B |
| 10 | No 2FA/MFA | ✅ RESOLVED Phase 3C | Phase 3C |
| 11 | Login page basic | ✅ RESOLVED Phase 3A | Phase 3A |
| 12 | Role names generic | ✅ RESOLVED Phase 6 | Phase 6 |
| 13 | No health dashboard UI | ✅ RESOLVED Phase 7A | Phase 7A |
| 14 | No incident detection/alerting | ✅ RESOLVED | Phase 7B |
| 15 | Raw errors can reach clients | ✅ RESOLVED | Phase 7C |
| 16 | No Dockerfiles for api-server or crm | ✅ RESOLVED Phase 13 | Phase 13 |
| 17 | /ai/* and /remediation/* ungated | ✅ RESOLVED | Phase 10 |
| 18 | 5 stub pages registered as live routes | 🔵 LOW | Phase 2 cleanup |
| 19 | not_required_1904_12pm/ in repo | 🔵 LOW | Phase 0B |
| 20 | .replit-artifact/ dirs in source | 🔵 LOW | Phase 0B |
| 21 | No status page | 🔵 LOW | Phase 9 |
| 22 | No standalone app framework | ✅ RESOLVED Phase 11 | Phase 11 |
| 23 | No client-facing support workflow | 🔵 LOW | Phase 9 |
| 24 | JWT token exposed in login response body | ✅ RESOLVED FIX-1 | FIX-1 |
| 25 | Emergency endpoint not localhost-restricted | ✅ RESOLVED FIX-1 | FIX-1 |
| 26 | Emergency endpoint not writing to audit_logs | ✅ RESOLVED FIX-1 | FIX-1 |
| 27 | forgot-password no rate limit | ✅ RESOLVED FIX-2 | FIX-2 |
| 28 | Verification token no expiry | ✅ RESOLVED FIX-2 | FIX-2 |
| 29 | consent module key mismatch | ✅ RESOLVED FIX-3 | FIX-3 |
| 30 | /notifications/* missing authMiddleware | ✅ RESOLVED FIX-3 | FIX-3 |
| 31 | /remediation/* wrong module gate | ✅ RESOLVED FIX-3 | FIX-3 |
| 32 | Import fieldMapping whitelist bypass | ✅ RESOLVED FIX-4 | FIX-4 |
| 33 | Import status path mismatch | ✅ RESOLVED FIX-4 | FIX-4 |
| 34 | ModuleControlCentrePage no access guard | ✅ RESOLVED FIX-5 | FIX-5 |
| 35 | Post-login redirect to wrong dashboard | ✅ RESOLVED FIX-5 | FIX-5 |
| 36 | Missing DB indexes users.email contacts.email | ✅ RESOLVED FIX-6 | FIX-6 |
| 37 | No typecheck step in CI/CD pipeline | ✅ RESOLVED FIX-7 | FIX-7 |
| 38 | Seed scripts had hardcoded fallback passwords | ✅ RESOLVED | GLF-1 |
| 39 | External app header named X-Hubforte-App-Key | ✅ RESOLVED GLF-2 | Renamed to X-YesCRM-App-Key |
| 40 | Import jobs had no row limit | ✅ RESOLVED GLF-3 | 5000 row limit added |
| 41 | Report schedule email delivery not wired | ✅ RESOLVED GLF-3 | Daily cron added |
| 42 | Import/export not in worker queue | 🔵 LOW — Phase 14 | setImmediate() still used |
| 43 | SendGrid connector UI-only | 🔵 LOW — Phase 14 | Gmail is primary transport |
| 44 | Slack connector UI-only | 🔵 LOW — Phase 14 | No SDK wired yet |
| 45 | Daily owner briefing email | 🔵 LOW — Phase 14 | Not yet built |
| 46 | docs/APP_INTEGRATION_GUIDE.md missing | ✅ RESOLVED GLF-2 | Created |

---

## SECTION 16 — RULES FOR ALL AI AGENTS

### MUST ALWAYS DO

1. Read this entire document before starting any task. Do not skip sections.
2. Read lib/db/src/moduleRegistry.ts before anything involving modules.
3. Read artifacts/api-server/src/routes/index.ts before adding any new routes.
4. Search the codebase for existing implementations before building new ones.
5. Match module keys exactly between frontend useFeatureFlags() and backend checkModuleEnabled().
6. Include tenant_id scoping in every database query that touches entity data.
7. Use getAIProvider() from aiProvider.ts for all AI calls — never direct API calls.
8. Use the logger from logger.ts for all logging — never console.log in production code.
9. Add new env vars to .env.example (not .env).
10. Create SQL migration files for every schema change.
11. Follow the consistent error response shape: { error, code, message, requestId }.
12. Test that the app still runs after every change.

### MUST NEVER DO

1. NEVER commit .env files or credentials.
2. NEVER bypass tenant isolation (every entity query needs tenant_id).
3. NEVER access safeguarding_notes through report engine or standard export.
4. NEVER return stack traces in production API responses.
5. NEVER modify remediationEngine.ts unless explicitly asked.
6. NEVER use drizzle-kit push in production.
7. NEVER use npm or yarn.
8. NEVER import from not_required_1904_12pm/.
9. NEVER give non-PLATFORM_OWNER users access to other tenants' data.
10. NEVER give DEVELOPER or PLATFORM_BUILDER roles access to client CRM data.
11. NEVER store API keys in plain text in the database (use AES-256 encryption).
12. NEVER make AI features crash the app — always degrade gracefully.

### BEFORE EVERY TASK — MENTAL CHECKLIST

- [ ] Have I read the relevant sections of HUBFORTE_AGENT_CONTEXT.md?
- [ ] Does what I'm building already exist somewhere in the codebase?
- [ ] Am I using pnpm (not npm)?
- [ ] Do all new DB queries include WHERE tenant_id = ? scoping?
- [ ] Are frontend and backend module keys matching exactly?
- [ ] Am I adding env vars to .env.example, not .env?
- [ ] Is there a SQL migration file for any schema changes?
- [ ] Will the app still compile and run after my changes?
- [ ] Does any new user-facing error message contain a stack trace? (Should not)
- [ ] Is this change consistent with the professionalism standard?

---

## SECTION 17 — HOW TO UPDATE THIS DOCUMENT

This document must stay accurate. When a phase is completed or something significant changes:

1. Update the relevant section with new information.
2. Update Section 15 (Known Issues) — change status from 🔴/🟠/🟡 to ✅ RESOLVED.
3. Add new modules to Section 5 if created.
4. Add new tables to Section 6 if created.
5. Add a line to Section 18 (Change Log) with: date, what changed, which phase.

Rule: The code is always the truth. If this document contradicts the code,
update this document to match the code — not the other way around.

---

## SECTION 18 — CHANGE LOG

| Date | Change | Phase |
|---|---|---|
| 2026-04-23 | v1.0: Initial audit and system bible created | 0 |
| 2026-04-24 | v2.0: Research-backed update. 7 gaps patched. Enterprise patterns added. Emergency access, role redesign, import priority, AppSheet export, status page, standalone app framework, dual AI config, incident SLAs. | 0 |
| 2026-04-24 | AI permission toggles (byokEnabled, aiDiagnosisEnabled) added to super-admin tenant detail. Documented in Phase 5 extension. Build prompt ready to run. | Phase 5 extension |
| 2026-04-27 | AI permission toggles implemented in super-admin tenant detail. Backend GET/PATCH ai-settings routes, frontend API client support, and AI Permissions UI shipped. Typecheck and build verified clean. | Phase 5 extension |
| 2026-04-27 | Codex audit rejected the first AI permission toggle pass. Remediation required for BYOK disable cleanup, field-level audit logging, and tenant list API/type alignment. | Phase 10 remediation |
| 2026-04-27 | Phase 1: Nav module key fixes, all modules visible in nav | Phase 1 |
| 2026-04-27 | Phase 2: Import wizard (5-step), export ZIP with README+schema | Phase 2 |
| 2026-04-27 | Phase 3: Login redesign, self-service registration, 2FA | Phase 3 |
| 2026-04-27 | Phase 4: Design system, dark mode, command palette, dashboard | Phase 4 |
| 2026-04-27 | Phase 5: Module Control Centre, per-tenant toggles | Phase 5 |
| 2026-04-27 | Phase 6: Role system redesign, friendly names, DEVELOPER role | Phase 6 |
| 2026-04-27 | Phase 7: Health dashboard, incident detector, error protection | Phase 7 |
| 2026-04-27 | Phase 8: Reports engine, pre-built templates, scheduled delivery | Phase 8 |
| 2026-04-27 | Phase 9: Webhooks, integrations page, status page | Phase 9 |
| 2026-04-27 | Phase 10: Dual AI (system+client), BYOK owner-controlled, lead scoring | Phase 10 |
| 2026-04-27 | Phase 11: Standalone app framework, /api/v1/* endpoints | Phase 11 |
| 2026-04-27 | Phase 12: Team management, developer portal, knowledge base | Phase 12 |
| 2026-04-27 | Phase 13: Dockerfiles, docker-compose, GitHub Actions, OCI setup | Phase 13 |
| 2026-04-27 | Audit fixes: CRIT/HIGH/MEDIUM issues from 8-session audit | Post-audit |
| 2026-04-30 | Comprehensive audit completed by Claude + Codex. CRITICAL: App.tsx typecheck, Anthropic SDK, seed passwords fixed. HIGH: plan column, invite email, role labels fixed. See audit/AUDIT_TEMPLATE.md for full findings. | Post-audit |
| 2026-04-30 | Full inch-by-inch audit. All security foundations confirmed. | Audit |
| 2026-04-30 | GLF-1: Removed hardcoded seed password fallbacks from 3 scripts | GLF-1 |
| 2026-04-30 | GLF-2: Renamed X-Hubforte to X-YesCRM-App-Key. Created APP_INTEGRATION_GUIDE.md | GLF-2 |
| 2026-04-30 | GLF-3: Added import row limit (5000). Daily report schedule cron. | GLF-3 |
| 2026-04-30 | GLF-4: Deferred checks completed. Production build verified clean. | GLF-4 |
| | (Add new entries here after each phase is completed) | |

---

*This document was generated from a full structural audit of the Hubforte monorepo and 
research into enterprise patterns from AWS, Salesforce, SAP, Oracle Cloud, and Microsoft Azure.
Version 2.0 supersedes all previous agent instructions.*
*Maintained by: the Hubforte owner via AI-assisted updates.*
*Next review: 2026-04-29*
