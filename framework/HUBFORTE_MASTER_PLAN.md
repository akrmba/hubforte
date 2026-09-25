# Hubforte — Master Build Plan
### The Complete Roadmap: From Vibe-Coded Foundation to Salesforce Competitor
**Version:** 1.0 | **Date:** 2026-04-23 | **Author:** System Audit + AI Planning

---

> **How to use this document:**
> Every phase has a plain-English explanation of WHAT and WHY, followed by a ready-to-paste prompt for your VS Code AI agent (Claude or Codex). Copy the prompt box exactly — it has been written to include the right file paths from your actual codebase. After every phase, there is a "How to verify it worked" checklist. Never skip verification.

---

## ⚠️ PART 0 — EMERGENCY ACTIONS (Do These RIGHT NOW, Before Any Coding)

These are not optional. Your live database password, Gmail OAuth secret, JWT signing key, and admin email are currently committed to your GitHub repository. Anyone who has access to your repo — or finds it — can:
- Log into your database and delete everything
- Log in as your admin account
- Send emails from your Gmail account

### Step 1 — Revoke Compromised Credentials (takes 15 minutes)

Do each of these in order:

**A. Neon Database (Most Critical)**
1. Go to https://console.neon.tech
2. Open your project → Settings → Connection pooling
3. Click "Reset password" — this gives you a new DATABASE_URL
4. Immediately update this in your local `.env` files (api-server and lib/db)
5. Do NOT commit the new password to Git

**B. Gmail OAuth**
1. Go to https://console.cloud.google.com → APIs & Services → Credentials
2. Find the OAuth 2.0 Client ID that matches `GMAIL_CLIENT_ID` in your .env
3. Click it → Reset secret — this invalidates the old `GMAIL_CLIENT_SECRET`
4. Update your local .env
5. Do NOT commit to Git

**C. Generate New JWT & Session Secrets**
Run this command in your terminal (PowerShell on Windows):
```
node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"
```
Run it twice — one for JWT_SECRET, one for SESSION_SECRET. Paste them in your local .env.

**D. Change Admin Password**
1. Log into your system
2. Go to your profile/settings
3. Change the password from `ChangeMe123!` to something strong

**E. Rotate Worker Secret**
Run the same node command again, use as WORKER_SECRET.

### Step 2 — Fix .gitignore (so this never happens again)

Paste this prompt into VS Code Claude/Codex:

```
TASK: Fix .gitignore to prevent credential files from ever being committed again.

CONTEXT: This is a pnpm monorepo. The .env file at artifacts/api-server/.env was 
committed to git and contains live credentials. This must never happen again.

DO THIS:
1. Open the root .gitignore file (create it if it doesn't exist)
2. Add ALL of these patterns:

# Environment files (NEVER commit these)
.env
.env.local
.env.production
.env.staging
**/.env
**/.env.local
**/.env.production
lib/db/.env

# Build artifacts
**/dist/
**/build/
**/.cache/

# Replit internal files  
**/.replit-artifact/

# Temp/old files
not_required_1904_12pm/
**/tmp-*.pdf
**/tmp-*.html
**/backups.log
**/tsconfig.tsbuildinfo

# Node modules
node_modules/
**/node_modules/

# Logs
*.log
logs/

# OS files
.DS_Store
Thumbs.db

3. After adding to .gitignore, run this git command to stop tracking the .env file:
   git rm --cached artifacts/api-server/.env
   git rm --cached lib/db/.env

4. Verify by running: git status
   The .env files should show as "untracked" or not appear at all.

DO NOT:
- Do not delete the .env files from disk (you need them locally)
- Do not modify any application code
- Do not touch any route files or components

VERIFY:
Show me the final .gitignore content and the output of "git status"
```

### Step 3 — Clean the not_required_1904_12pm folder

Paste this prompt:

```
TASK: Safely remove the not_required_1904_12pm directory from the repository.

CONTEXT: This folder contains personal JSON files, old patch scripts, and a 
Claude extension tarball that should never have been committed. The folder name 
itself says "not required".

DO THIS:
1. Run: git rm -r --cached not_required_1904_12pm/
2. This removes it from git tracking but keeps it on your disk
3. The .gitignore update from the previous task will prevent it coming back
4. Do NOT physically delete the folder in case there's anything in it you need
   (you can review and delete manually later)

DO NOT:
- Do not modify any code files
- Do not delete the folder from disk yet

VERIFY:
Show me: git status
The folder should appear as "untracked" and not be in any future commits.
```

---

## PART 1 — Project Reality Check

### What You Have (The Good)

Your project is genuinely impressive for a solo vibe-coder. You have built:

- A proper multi-tenant backend (Express + PostgreSQL with row-level tenant isolation)
- A complete module toggle system (the architecture is right, just the frontend keys are wrong)
- 62 database tables covering CRM, LMS, compliance, monitoring, and automation
- An auto-remediation engine with 25+ policies
- A full LMS with student surveys, coach workflows, PDF reports, and QR code attendance
- Structured logging, audit trails, and change data capture
- A campaign worker system
- Comprehensive documentation (36 docs files, ops runbooks)
- AI provider abstraction (OpenAI / Anthropic / OpenRouter switchable)

### What Is Broken Right Now

These are the actual reasons you're not happy with the system:

1. **Organisations and Contacts nav items are invisible** — because the frontend checks for a module called `schools` but the backend uses `organisations` and `contacts`. One line change fixes this.

2. **Most modules have no nav link** — Volunteers, Funders, Safeguarding, Outcomes, Automation, Support, Cohorts, Sessions, Attachments — all built, none visible in the nav.

3. **LMS is completely disconnected** from the CRM — it's a separate app with no link.

4. **The login system uses hardcoded .env credentials** — no way for new tenants to sign up themselves.

5. **The UI shows only 5 items in the sidebar** regardless of what modules are on.

6. **No owner-facing monitoring dashboard** — you have monitoring data in the DB but can't see it without querying the database directly.

---

## PART 2 — The Vision

### What Hubforte Is

Hubforte is a multi-tenant, modular business platform that combines:
- **CRM** (contacts, organisations, pipeline, campaigns, support)
- **LMS** (programmes, cohorts, sessions, student outcomes)
- **Operations** (safeguarding, consent, field history, automation)
- **Analytics** (reports, dashboards, saved reports)

With a philosophy that no two clients are the same. A school uses Safeguarding + LMS + Programmes. A sales company uses Pipeline + Outreach + Campaigns. A nonprofit uses Funders + Volunteers + Outcomes. You turn on exactly what each client needs.

### The Nervous System Philosophy

A human body has a nervous system that detects pain anywhere — a cut on your finger reaches your brain in milliseconds. Hubforte should work the same way:

- Any error, anywhere in the system → reaches you (the owner) immediately
- The system should explain the error in plain English
- AI should suggest or apply the fix automatically where possible
- Clients should never see an unhandled error — they see a polite "something went wrong, we're on it"
- You should be able to deploy a fix within hours, not days
- The system should predict problems before they happen (rising error rates, slow queries, full queues)

### The Integration Philosophy

Hubforte connects to everything. Think of it like electricity — any appliance can plug into a socket. SendGrid, Mailchimp, Zapier, HubSpot, Salesforce, Twilio, Stripe — they all plug in. Clients import their data easily and can export it just as easily if they leave. No lock-in. That trust is what makes them stay.

---

## PART 3 — The Salesforce Comparison

### What Salesforce Has (Their Strengths)

| Salesforce Feature | Current Status in Hubforte | Build Priority |
|---|---|---|
| Contact & Account Management | ✅ Built | Fix nav visibility |
| Lead Management & Scoring | ⚠️ Partial (contacts exist, no lead scoring) | Phase 7 |
| Opportunity/Pipeline Management | ✅ Built | Fix nav visibility |
| Sales Forecasting | ❌ Not built | Phase 7 |
| Email Campaigns / Marketing | ✅ Built (outreach/campaigns) | Fix nav visibility |
| Reports & Dashboards | ✅ Built | All modules enabled |
| Workflow Automation | ✅ Built (automation rules) | Fix nav visibility |
| Mobile App | ❌ Not built | Phase 10 (PWA first) |
| Quote Management / CPQ | ❌ Not built | Phase 8 |
| Customer Portal (self-service) | ❌ Not built | Phase 9 |
| AppExchange / Marketplace | ❌ Not built | Future |
| Telephony/CTI | ❌ Not built | Phase 11 (Voice agents) |
| Territory Management | ❌ Not built | Phase 8 |
| SSO / Social Login | ❌ Not built | Phase 4 |
| Two-Factor Authentication | ❌ Not built | Phase 4 |
| AI Lead Scoring (Einstein) | ❌ Not built | Phase 8 |
| AI Email Generation | ⚠️ Backend exists, no UI | Phase 8 |
| Document Generation (PDFs) | ⚠️ Partial (LMS reports only) | Phase 8 |
| E-Signature | ❌ Not built | Phase 9 |
| Data Import/Export | ⚠️ Built but not verified | Phase 6 |
| API for developers | ⚠️ OpenAPI spec exists | Phase 6 |

### What Hubforte Has That Salesforce Doesn't

| Hubforte Unique Feature | Why It Matters |
|---|---|
| Built-in LMS (full) | Salesforce has to partner with third parties |
| Safeguarding module | Not available in Salesforce without custom dev |
| Student outcome tracking | Built for education/nonprofits out of the box |
| Programme + Cohort + Session management | No equivalent in Salesforce |
| Consent management for minors | Built for regulated industries |
| Auto-remediation engine | Salesforce monitors but doesn't self-heal |
| Price: fraction of the cost | Salesforce starts at £165/user/month |
| Module toggles per tenant | Salesforce requires expensive config to limit features |
| BYOK AI (planned) | Clients bring their own AI keys |
| Open source potential | Salesforce is fully closed |

---

## PART 4 — The Full Build Roadmap

### Overview of All Phases

| Phase | Name | Timeline | Impact |
|---|---|---|---|
| 0 | Security Emergency | TODAY | Prevents system compromise |
| 1 | Fix What's Broken | Week 1 | Restores all hidden modules |
| 2 | Clean & Organise | Week 1 | Remove dead code and clutter |
| 3 | Auth & Login Redesign | Week 2 | Professional login, tenant onboarding |
| 4 | UI Complete Rebuild | Weeks 2–3 | All modules visible, proper design |
| 5 | Module Control Centre | Week 3 | Owner dashboard for toggling modules |
| 6 | The Nervous System | Weeks 3–4 | Real-time monitoring, AI error fixes |
| 7 | Reports & Analytics | Month 2 | Full sales reporting, forecasting |
| 8 | Integration Framework | Month 2 | Import/export, webhooks, connectors |
| 9 | AI Layer | Month 2–3 | Client AI, lead scoring, email gen |
| 10 | Deployment | Month 3 | Windows → GitHub → OCI, cloud-agnostic |
| 11 | Team Access System | Month 3 | Developer portal, role management |
| 12 | Voice & Future | Month 4+ | Voice agents, advanced features |

---

## PHASE 1 — Fix What's Broken (Week 1)

### What We're Fixing

This phase fixes the core reason most of your modules are invisible:
1. The frontend checks `module: "schools"` for Organisations and Contacts — should be `organisations` and `contacts`
2. The nav shows only 5 items — needs to show ALL enabled modules
3. The LMS has no link from the CRM

### 1A — Fix the Module Key Mismatch

**Copy this prompt into VS Code Claude:**

```
TASK: Fix the module key mismatch in the CRM frontend navigation.

CONTEXT: 
- Project is a pnpm monorepo at Hubforte/
- The CRM frontend is at artifacts/crm/
- The main layout/nav file is at artifacts/crm/src/components/Layout.tsx
- This file has a PRIMARY_NAV array around line 90-97
- Currently "Organisations" and "Contacts" both check module: "schools"
- The backend expects module keys: "organisations" and "contacts"
- This mismatch means the nav shows the wrong items based on the wrong flag

DO THIS:
1. Open artifacts/crm/src/components/Layout.tsx
2. Find the PRIMARY_NAV array (around line 90)
3. Change the entry for "Organisations" from module: "schools" to module: "organisations"
4. Change the entry for "Contacts" from module: "schools" to module: "contacts"
5. Save the file

DO NOT:
- Do not change any other nav items
- Do not change anything in the backend
- Do not rename any routes
- Do not change the href values

VERIFY:
Show me the updated PRIMARY_NAV array after the change.
Expected result:
  { href: "/ext/schools", label: "Organisations", module: "organisations" }
  { href: "/ext/contacts", label: "Contacts", module: "contacts" }
```

### 1B — Add All Hidden Modules to the Nav

**Copy this prompt into VS Code Claude:**

```
TASK: Add all built but hidden modules to the CRM sidebar navigation.

CONTEXT:
- File: artifacts/crm/src/components/Layout.tsx
- The PRIMARY_NAV array currently shows only 6 items
- There are many more modules that are built but have no nav link
- Users can only reach them by typing the URL directly
- All modules should appear in the nav but ONLY when their flag is enabled
- The useFeatureFlags hook is already in the codebase at artifacts/crm/src/hooks/useFeatureFlags.ts
- Extended pages live at artifacts/crm/src/pages/extended/

MODULES TO ADD (with their backend module keys and existing routes):
1. Volunteers — module key: "volunteers" — route: /ext/volunteers
2. Funders — module key: "funders" — route: /ext/funders  
3. Outreach / Campaigns — module key: "outreach" — route: /ext/outreach
4. Support Tickets — module key: "support" — route: /ext/support
5. Cohorts — module key: "cohorts" — route: /ext/cohorts
6. Outcomes — module key: "outcomes" — route: /ext/outcomes
7. Safeguarding — module key: "safeguarding" — route: /ext/safeguarding
8. Automation — module key: "automation" — route: /automation-rules
9. Attachments — module key: "attachments" — route: /ext/attachments

NAVIGATION STRUCTURE:
Organise the nav into sections using dividers. Suggested structure:
  [Core]
  - Home (always visible)
  - Organisations (module: organisations)
  - Contacts (module: contacts)
  - Pipeline (module: pipeline)
  
  [Engagement]
  - Outreach & Campaigns (module: outreach)
  - Support (module: support)
  
  [People]
  - Volunteers (module: volunteers)
  - Funders (module: funders)
  
  [Delivery]  
  - Programmes (module: programmes)
  - Cohorts (module: cohorts)
  
  [Compliance]
  - Outcomes (module: outcomes)
  - Safeguarding (module: safeguarding)
  
  [Tools]
  - Automation (module: automation)
  - Attachments (module: attachments)
  - Reports (module: reports)
  
  [System]
  - LMS (module: lms) — links to the LMS app URL (read from env var VITE_LMS_URL)
  - Settings (always visible)
  - Admin (visible only to admin/super_admin roles)
  - Super Admin (visible only to super_admin role)

DO THIS:
1. Read the current Layout.tsx fully before making changes
2. Add the above sections and items to the nav
3. Each item should use the same pattern as existing items: check useFeatureFlags for the module key
4. For the LMS link, use an external link (opens in new tab) to the LMS URL
5. Add section header labels with a subtle separator (look at the existing pattern in Layout.tsx)
6. Keep the existing logic for role-based items (admin, super_admin)

DO NOT:
- Do not change route paths
- Do not remove existing items
- Do not change the authentication logic
- Do not touch any backend files

VERIFY:
Show me the updated navigation section of Layout.tsx showing all the new items.
```

### 1C — Connect LMS to CRM

**Copy this prompt into VS Code Claude:**

```
TASK: Connect the LMS app to the CRM navigation and add a proper link.

CONTEXT:
- CRM frontend: artifacts/crm/ (runs on port 5173 in dev, its own URL in production)
- LMS frontend: artifacts/lms/ (separate Vite app, runs on different port/URL)
- The LMS URL in production will be a separate domain or subdomain
- We need to store the LMS URL in the CRM's environment variables

DO THIS:

STEP 1 — Add LMS URL to CRM environment config:
1. Open artifacts/crm/.env.example (or create it if missing)
2. Add: VITE_LMS_URL=http://localhost:5174
   (This is the dev URL; in production this will be the real LMS domain)
3. Also add to artifacts/crm/.env (local only, not committed to git):
   VITE_LMS_URL=http://localhost:5174

STEP 2 — In Layout.tsx (already modified in the previous task):
1. The LMS nav item should read the URL from: import.meta.env.VITE_LMS_URL
2. If the URL is not set, it should still show the nav item but clicking it shows a 
   toast notification: "LMS URL not configured. Contact your administrator."
3. The LMS link should open in a new browser tab (target="_blank")
4. Add a small external link icon next to the LMS label

STEP 3 — Add a banner/widget on the CRM dashboard:
1. Find the dashboard page at artifacts/crm/src/pages/ (look for Dashboard or Home page)
2. If the LMS module is enabled (useFeatureFlags('lms') === true), show a card:
   Title: "Learning Management System"
   Description: "Access student programmes, cohorts, and reports"
   Button: "Open LMS" → links to VITE_LMS_URL
   
DO NOT:
- Do not merge the LMS code into the CRM — they stay as separate apps
- Do not change the LMS app code
- Do not change any backend routes
- Do not touch authentication logic

VERIFY:
Show me:
1. The updated .env.example for artifacts/crm/
2. The LMS nav item code in Layout.tsx
3. The LMS dashboard widget/card code
```

---

## PHASE 2 — Clean & Organise (Week 1)

### What We're Doing

Removing all the clutter from 12+ months of iterative building. Dead files slow down AI agents and make the project confusing. This is like clearing a messy desk before starting work.

### 2A — Remove Dead Code

**Copy this prompt into VS Code Claude:**

```
TASK: Clean up dead files and folders from the Hubforte project. Read-only scan first, 
then remove only what I confirm.

CONTEXT: This is a pnpm monorepo. We have done an audit and identified the following 
as safe to remove. Do NOT remove anything not on this list.

SCAN AND REPORT FIRST (before removing anything):
For each item below, confirm it exists and check if anything imports from it:
1. artifacts/api-server/tmp-puppeteer-check.pdf
2. scripts/backups.log
3. lib/db/run-migration-0003.mjs
4. lib/db/run-migration-0005.mjs
5. lib/db/check-columns.mjs
6. lib/db/list-tables.mjs
7. artifacts/crm/src/pages/extended/ContactDetailPage.tsx — check if it's imported anywhere
8. artifacts/crm/src/pages/extended/FundingDetailPage.tsx — check if it's imported anywhere
9. artifacts/crm/src/pages/extended/TrustDetailPage.tsx — check if it's imported anywhere
10. artifacts/crm/src/pages/extended/VolunteerDetailPage.tsx — check if it's imported anywhere
11. artifacts/lms/src/pages/SchoolsPage.tsx — check if it's imported anywhere in LMS App.tsx

THEN: Show me a list of:
- Items that are safe to delete (nothing imports them)
- Items that ARE imported somewhere (list what imports them — do not delete these)

AFTER I CONFIRM: Only then remove the safe-to-delete items.

DO NOT:
- Do not delete not_required_1904_12pm/ (already handled via .gitignore)
- Do not remove any route files
- Do not touch .replit-artifact/ directories (leave them, they don't affect the app)
- Do not modify any backend or frontend logic files

VERIFY:
After deletion, run: find . -name "*.tsx" -empty (shows any remaining empty files)
```

### 2B — Consolidate Documentation

**Copy this prompt into VS Code Claude:**

```
TASK: Organise the docs folder so AI agents always read the right things.

CONTEXT:
- The docs/ folder has 36 files accumulated from different build sessions
- Many may be outdated or contradictory
- We need ONE master reference document for agents to read (being created separately)
- We need the remaining docs organised clearly

DO THIS:
1. List all files in docs/ with their file sizes and last-modified dates
2. List all files in ops/ 
3. List all files in framework/
4. List all files in scripts/archive/ if it exists

THEN create a file at docs/INDEX.md with:
- A table listing every doc file, what it covers, and whether it's likely current or possibly outdated
- Based on file names and sizes only — do not read the full content of each file

DO NOT:
- Do not delete any doc files yet
- Do not modify any doc content
- Do not touch any code files

VERIFY:
Show me the docs/INDEX.md you created.
This will help us later decide what to archive vs keep.
```

---

## PHASE 3 — Auth & Login Redesign (Week 2)

### What We're Doing

Your current login comes from `.env` credentials set at seed time. There's no way for a new client to sign up themselves. There's no 2FA. The login page probably looks basic. This phase fixes all of that.

### 3A — New Login Page Design

**Copy this prompt into VS Code Claude:**

```
TASK: Redesign the CRM login page to be modern, professional, and trust-building.

CONTEXT:
- Current login page: artifacts/crm/src/pages/LoginPage.tsx
- UI components available: shadcn/ui (already installed)
- The backend auth endpoint is: POST /api/auth/login (accepts {email, password})
- The existing auth hooks/logic should not be changed, only the visual design

DESIGN REQUIREMENTS:
1. Split-screen layout:
   - Left side (40%): Brand panel with gradient background, Hubforte logo text, 
     tagline "The smarter way to manage what matters", 3 key feature bullet points
   - Right side (60%): Login form

2. The login form should have:
   - "Welcome back" heading
   - "Sign in to your workspace" subheading  
   - Email field with icon
   - Password field with show/hide toggle button
   - "Remember me" checkbox
   - "Forgot password?" link (route it to /auth/forgot-password)
   - "Sign in" button (full width, primary colour)
   - Below the button: "New to Hubforte? Contact your administrator to get access"
   
3. Colours & style:
   - Use a professional dark navy + teal accent colour scheme
   - Clean sans-serif font (Inter or system font)
   - Subtle background pattern or gradient on the brand panel
   - Form panel should be white/light with good spacing and shadow

4. Error states:
   - If login fails: show a red alert box with "Invalid email or password. Please try again."
   - Do not say which one is wrong (security best practice)
   - Input fields should show red border on error

5. Loading state:
   - Button shows spinner and "Signing in..." text while API call is in progress
   - Fields are disabled during loading

DO NOT:
- Do not change the API call logic
- Do not change the route (/auth/login or wherever it redirects)
- Do not add social login yet (that's a later phase)
- Do not add any new API endpoints

VERIFY:
Show me the full updated LoginPage.tsx component.
The design should look clearly better than a basic form.
```

### 3B — Tenant Self-Service Onboarding

**Copy this prompt into VS Code Claude:**

```
TASK: Create a tenant onboarding flow so new clients can sign themselves up without 
needing you to set credentials in .env files.

CONTEXT:
- Backend: artifacts/api-server/
- Database schema: lib/db/src/schema/ (tenants table and users table exist)
- Current situation: Admin credentials are seeded via ADMIN_EMAIL + SEED_PASSWORD env vars
- Goal: A self-service sign-up page where new organisations create their workspace

THIS IS A BACKEND + FRONTEND TASK:

BACKEND — Add these endpoints to artifacts/api-server/src/routes/auth.ts:

1. POST /api/auth/register-tenant
   Body: { organisationName, adminEmail, adminFirstName, adminLastName, password }
   Logic:
   - Validate all fields (email format, password min 8 chars with 1 number)
   - Check email is not already registered
   - Create a new row in the tenants table (status: 'pending_verification')
   - Create the first user as ADMIN role (not SUPER_ADMIN)
   - Set all default module flags for the new tenant (use the defaults from moduleRegistry)
   - Send a verification email (use existing email/nodemailer setup — check how 
     emails are sent elsewhere in the codebase and use the same pattern)
   - Return: { message: "Verification email sent" }
   - Rate limit this endpoint: max 5 requests per IP per hour

2. GET /api/auth/verify-email?token=xxx
   Logic:
   - Find the tenant by verification token
   - Set tenant status to 'active'
   - Return redirect to login page with ?verified=true query param

FRONTEND — Create a registration page at artifacts/crm/src/pages/RegisterPage.tsx:

1. Route: /auth/register
2. Form fields:
   - Organisation Name
   - Your First Name
   - Your Last Name  
   - Work Email
   - Password (with strength indicator)
   - Confirm Password
   - Checkbox: "I agree to the Terms of Service"
3. On success: Show a page saying "Check your email — we sent you a verification link"
4. Add "Create new workspace" link on the LoginPage below the sign-in button

ALSO: Create /auth/forgot-password page with:
- Email field
- "Send reset link" button  
- POST /api/auth/forgot-password endpoint (already may exist — check first)
- If it exists, just build the UI for it

DO NOT:
- Do not modify the existing login endpoint
- Do not remove the .env seed system (still needed for development)
- Do not give new self-registered tenants SUPER_ADMIN role

VERIFY:
1. Show me the new backend endpoints
2. Show me the RegisterPage.tsx component
3. Show me where the new routes are added in the frontend router (App.tsx)
```

### 3C — Two-Factor Authentication (2FA)

**Copy this prompt into VS Code Claude:**

```
TASK: Add Time-based One-Time Password (TOTP) two-factor authentication to Hubforte.

CONTEXT:
- Backend: artifacts/api-server/
- This uses the TOTP standard (compatible with Google Authenticator, Authy, 1Password)
- Library to use: install "otplib" (npm package, very standard)
- Users opt-in to 2FA from their profile settings

BACKEND — Add to artifacts/api-server/src/routes/auth.ts:

1. POST /api/auth/2fa/setup
   - Auth required
   - Generates a TOTP secret for the current user
   - Returns: { secret, qrCodeUrl } (use otplib to generate)
   - Temporarily stores secret (not activated yet) in users table
   - Add columns to users table: totp_secret (text, nullable), totp_enabled (boolean, default false)

2. POST /api/auth/2fa/verify-setup
   - Auth required
   - Body: { token } (6-digit code from authenticator app)
   - Verifies the token against the stored secret
   - If valid: sets totp_enabled = true on the user
   - Returns: { success: true, backupCodes: [...] } (generate 8 one-time backup codes)
   - Store hashed backup codes in a new table: user_backup_codes

3. POST /api/auth/2fa/disable
   - Auth required
   - Body: { password, token }
   - Requires current password AND valid TOTP token to disable
   - Sets totp_enabled = false, clears totp_secret

4. Modify POST /api/auth/login:
   - If user has totp_enabled = true:
     - Do not return the full JWT yet
     - Return: { requires2FA: true, tempToken: "..." } (short-lived 5-min token)
   - Add a new endpoint: POST /api/auth/2fa/complete
     - Body: { tempToken, totpCode }
     - Verifies code, then returns the real JWT

FRONTEND — Add to settings page (find the existing settings/profile page):

1. A "Security" section with:
   - Current status: "Two-factor authentication: Enabled / Disabled"
   - "Enable 2FA" button (if disabled) → walks through setup flow:
     Step 1: Show QR code to scan with authenticator app
     Step 2: Enter 6-digit code to confirm it works
     Step 3: Show backup codes (with "Download" and "Copy" buttons)
   - "Disable 2FA" button (if enabled) → requires password + TOTP confirmation

2. A new page /auth/2fa-verify (shown after login if 2FA is required):
   - Clean page with "Enter your authentication code" 
   - 6-digit input field (auto-advance on full entry)
   - "Verify" button
   - "Use backup code instead" link
   - Uses the tempToken from the login response

DO NOT:
- Do not change anything about the existing JWT logic beyond the login modification
- Do not make 2FA mandatory for all users (it's opt-in)
- Do not implement SMS-based 2FA (TOTP is more secure and free)

VERIFY:
Show me:
1. The new auth route additions
2. The 2FA setup UI component  
3. The 2FA verify page component
```

---

## PHASE 4 — UI Complete Rebuild (Weeks 2–3)

### What We're Doing

A UI that stands out, loads fast, works on mobile, has dark mode, and clearly shows the power of the system. This is the face your clients see every day.

### 4A — Design System & Theme

**Copy this prompt into VS Code Claude:**

```
TASK: Create a consistent design system for Hubforte that looks modern and professional.

CONTEXT:
- Frontend: artifacts/crm/
- Using: shadcn/ui + Tailwind CSS
- Goal: A design that looks as polished as Salesforce Lightning or HubSpot

DESIGN DECISIONS:
Primary colour: Deep teal/cyan (#0891b2 or similar)
Secondary colour: Deep navy (#0f172a)
Accent: Amber/yellow (#f59e0b) for highlights and calls-to-action
Font: System font stack (Inter if available, fallback to system-ui)
Border radius: Subtle (6-8px), not too rounded
Shadows: Minimal, professional
Dark mode: YES — must support dark mode

DO THIS:

1. Create or update artifacts/crm/src/index.css with CSS custom properties:
   :root {
     --brand-primary: #0891b2;
     --brand-secondary: #0f172a;
     --brand-accent: #f59e0b;
   }
   Plus all the shadcn/ui CSS variables for both light and dark modes.

2. Update tailwind.config.js (or tailwind.config.ts) in artifacts/crm/ to:
   - Add brand colours to the theme
   - Enable dark mode via 'class' strategy (so user can toggle)

3. Create a ThemeProvider component at artifacts/crm/src/components/ThemeProvider.tsx:
   - Reads user preference from localStorage ('theme': 'light'|'dark'|'system')
   - Applies 'dark' class to <html> element when needed
   - Exports useTheme() hook and ThemeToggle button component

4. Update artifacts/crm/src/main.tsx to wrap the app in ThemeProvider

5. Add a theme toggle button to the Layout.tsx top bar (sun/moon icon)

DO NOT:
- Do not change any API calls or data logic
- Do not change routing
- Do not redesign page content yet (that's next task)
- Keep all existing functionality working

VERIFY:
Show me:
1. The CSS variables in index.css
2. The ThemeProvider component
3. The theme toggle button in Layout
4. The app should still compile and run without errors
```

### 4B — Dashboard Redesign

**Copy this prompt into VS Code Claude:**

```
TASK: Redesign the main dashboard (home page) of Hubforte to be a powerful, 
at-a-glance overview of the business.

CONTEXT:
- Current dashboard: look at the component at artifacts/crm/src/pages/ (find the 
  main dashboard/home page)
- Backend dashboard endpoint: GET /api/dashboard/stats and GET /api/dashboard/activity
- The existing API already returns: pipeline value, contacts count, activities, tasks, etc.
- Use the design system established in Phase 4A

DASHBOARD LAYOUT:

Row 1 — KPI Cards (4 across):
- Total Contacts (with delta vs last month)
- Open Pipeline Value (currency formatted)
- Tasks Due Today (with overdue count in red)
- Open Support Tickets (if support module is on)

Row 2 — Main Content (2 columns):
Left (60%): Activity Feed
  - Last 10 activities with icon, description, entity name, timestamp
  - "View all activities" link
Right (40%): Quick Actions panel
  - "New Contact" button
  - "New Organisation" button  
  - "New Task" button
  - "New Deal" button (if pipeline enabled)

Row 3 — Charts (2 columns):
Left: Pipeline by Stage (horizontal bar chart OR funnel)
  - Shows count and value at each pipeline stage
  - Only visible if pipeline module is enabled
Right: Activities This Week (simple bar chart)
  - 7 bars, one per day, showing activity count
  - Uses recharts (already in the project)

Row 4 — Module Status Cards:
- For each ENABLED module: show a card with module name, icon, quick stat, link
- If a module is disabled: show a faded "Unlock [Module Name]" card

IMPORTANT: Every section should respect module flags.
If pipeline is off → hide the pipeline KPI and chart.
If support is off → hide the tickets KPI.
Use useFeatureFlags() hook for all checks.

DO NOT:
- Do not change the backend dashboard endpoints
- Do not add new API endpoints in this task
- Do not modify any other pages

VERIFY:
Show me the full redesigned dashboard component.
```

### 4C — Sidebar & Overall Layout Polish

**Copy this prompt into VS Code Claude:**

```
TASK: Polish the main Layout (sidebar + top bar) to match modern SaaS standards.

CONTEXT:
- Layout file: artifacts/crm/src/components/Layout.tsx
- This was already modified in Phase 1 to add all nav items
- Now we need to polish it visually and add power-user features

SIDEBAR IMPROVEMENTS:

1. Collapsible sidebar:
   - Default: expanded (240px wide) showing icons + labels
   - Collapsed: narrow (64px) showing icons only with tooltips
   - State saved in localStorage
   - A chevron/arrow button to toggle at the bottom of sidebar

2. Section headers and dividers between nav groups (as planned in Phase 1B)

3. Active state: Current page highlighted with brand colour background

4. Hover effects: Subtle background on hover

5. Each nav item: icon (left) + label (right) + optional badge for counts
   - Tasks section: show count of tasks due today as a number badge
   - Support: show count of open tickets

6. Bottom of sidebar:
   - User avatar/initials circle
   - User name and role
   - "Sign out" option (popover on click)

TOP BAR IMPROVEMENTS:

1. Left: Page title (dynamic, matches current page)
2. Centre: Global search bar (links to existing /search endpoint)
3. Right: 
   - Quick create button (+) with dropdown: New Contact, New Org, New Task, New Deal
   - Notifications bell with unread count badge
   - Theme toggle (sun/moon)
   - User menu (avatar → profile, settings, sign out)

KEYBOARD SHORTCUTS:
1. Cmd/Ctrl + K → Opens a command palette (simple version):
   - Text input
   - Shows recently visited pages
   - Shows all nav items
   - Typing filters the list
   - Enter navigates to selected item
   This is a modal overlay — do not use an external library, build a simple one.

DO NOT:
- Do not change routing
- Do not change any data fetching
- Do not touch backend files

VERIFY:
Show me:
1. The collapsible sidebar implementation
2. The top bar with quick-create, notifications, and search
3. The command palette component
```

---

## PHASE 5 — Module Control Centre (Week 3)

### What We're Doing

A proper dashboard just for you (and your admins) where you can toggle any module on or off for any tenant with a click. This replaces manual database queries.

**Copy this prompt into VS Code Claude:**

```
TASK: Build a Module Control Centre — a super-admin panel to manage all feature flags 
for all tenants from a UI.

CONTEXT:
- Backend feature flag endpoints are at /api/super-admin/ or /api/admin/
- Feature flags are stored in: feature_flags (global) and tenant_feature_flags (per-tenant)
- The moduleRegistry.ts at lib/db/src/moduleRegistry.ts defines all modules with keys, 
  categories, defaults, and descriptions
- This panel is only visible to SUPER_ADMIN role
- It should be under /super-admin/modules route

BUILD THIS:

BACKEND — Check what endpoints already exist for feature flags:
1. Look in artifacts/api-server/src/routes/ for any super-admin or feature-flag routes
2. If they don't exist, create endpoints:
   - GET /api/super-admin/tenants — list all tenants with name, status, user count
   - GET /api/super-admin/tenants/:tenantId/modules — get all module flags for a tenant
   - PATCH /api/super-admin/tenants/:tenantId/modules/:moduleKey — toggle a module
     Body: { enabled: true/false }
   - GET /api/super-admin/modules — get global module defaults
   - PATCH /api/super-admin/modules/:moduleKey — update global default
   - GET /api/super-admin/overview — summary stats: tenants count, active tenants, 
     most-used modules

FRONTEND — Create page at artifacts/crm/src/pages/ (add it to the Super Admin section):

PAGE: Module Control Centre

LAYOUT:
Top: "Module Control Centre" heading, brief description

Section 1 — Global Defaults
  - Card for each module in moduleRegistry
  - Organised by category (Core CRM, Delivery, Compliance, etc.)
  - Each card shows: module name, description, default state, toggle switch
  - Changing a global default affects ALL tenants that haven't been individually customised
  - Show warning: "This affects all tenants without individual overrides"

Section 2 — Per-Tenant Management
  - Search/filter box: type tenant name to filter
  - List of tenants (table: name, status, user count, enabled modules count)
  - Click a tenant → expand to show their module grid
  - Module grid: same card pattern, toggle to override for this tenant only
  - Visual indicator showing "Using default" vs "Custom override"
  - "Reset to defaults" button per tenant

Section 3 — Quick Module Toggle
  - For your own use: a simple grid of all modules with their global on/off state
  - Big clear toggle switches, easy to see at a glance
  - Show each module: enabled / disabled / coming soon

IMPORTANT UX RULES:
- Toggling is instant (optimistic UI — update the toggle immediately, then confirm API)
- If API fails, revert the toggle and show error toast
- NEVER toggle without confirmation when disabling a required module
  (modules marked required: true in moduleRegistry should show a warning popup)
- Each toggle should show: "Last changed: [date]" in a tooltip

DO NOT:
- Do not allow disabling core modules (contacts, organisations, activities) without 
  a double-confirmation dialog
- Do not allow a non-super-admin to access this page
- Do not change the existing checkModuleEnabled backend middleware

VERIFY:
Show me:
1. The backend endpoints (new or existing ones found)
2. The Module Control Centre page component
3. The tenant detail panel with module toggles
```

---

## PHASE 6 — The Nervous System (Weeks 3–4)

### What We're Building

This is the most important phase for you as a vibe coder. A real-time system that:
- Watches every error across the entire system
- Explains them in plain English (not technical jargon)
- Suggests or applies fixes automatically
- Warns you BEFORE things get critical
- Makes sure clients never see raw errors

Think of it as your personal system health dashboard + AI assistant that runs 24/7.

### 6A — Owner Health Dashboard

**Copy this prompt into VS Code Claude:**

```
TASK: Build a real-time System Health Dashboard for the Hubforte owner.

CONTEXT:
- Backend has these monitoring tables: request_logs, error_logs, remediation_runs, 
  remediation_policies, ai_logs
- The remediationEngine.ts at artifacts/api-server/src/lib/remediationEngine.ts 
  already exists with 25+ policies
- We need to expose this data through a real-time dashboard
- Use WebSockets (ws library — check if already installed, or install it) for real-time updates
- This dashboard is ONLY for SUPER_ADMIN role
- Route: /super-admin/health

BACKEND:

1. Create a new route file: artifacts/api-server/src/routes/health.ts
   Mount it at /api/super-admin/health

Endpoints:
- GET /api/super-admin/health/summary
  Returns:
  {
    systemStatus: 'healthy' | 'degraded' | 'critical',  // calculated from error rates
    uptime: seconds,
    requestsLastHour: number,
    errorsLastHour: number,
    errorRate: percentage,
    p95ResponseTime: milliseconds,
    activeSessions: number,
    dbConnectionsActive: number,
    remediationRunsToday: number,
    autoFixedToday: number,
    modulesEnabled: number,
    activeTenantsToday: number
  }

- GET /api/super-admin/health/errors?limit=50&page=1
  Returns recent errors from error_logs table with:
  {
    id, errorCode, message, stackTrace,
    occurrenceCount, firstSeen, lastSeen,
    affectedRoute, affectedTenantId,
    aiExplanation: string | null,  // plain English explanation
    aiSuggestedFix: string | null,  // plain English fix steps
    status: 'new' | 'investigating' | 'fixed' | 'ignored',
    autoFixed: boolean
  }

- GET /api/super-admin/health/requests?minutes=60
  Returns request volume and response time data grouped by minute (for charts)

- GET /api/super-admin/health/module-status
  Returns per-module health: request counts, error counts, last error time

- POST /api/super-admin/health/errors/:errorId/status
  Body: { status: 'investigating' | 'fixed' | 'ignored' }
  Updates the error status

- POST /api/super-admin/health/errors/:errorId/generate-explanation
  Calls AI to generate plain English explanation + fix steps for this error
  Stores result back in error_logs
  Uses the existing aiProvider.ts — call it with this system prompt:
  "You are a technical support AI. Explain the following error in plain, non-technical 
  English that a non-programmer can understand. Then provide step-by-step fix instructions 
  that a non-programmer could follow. Be specific and actionable."

- POST /api/super-admin/health/run-remediation
  Manually triggers the remediationEngine to run all policies
  Returns the run results

2. WebSocket endpoint (real-time updates):
   - Add WebSocket support to the server
   - Every 30 seconds, broadcast to connected SUPER_ADMIN clients:
     { type: 'health_update', data: <summary object> }
   - When a new error is logged, broadcast:
     { type: 'new_error', data: <error object> }

FRONTEND — Create page at /super-admin/health:

LAYOUT:

Row 1 — Status Banner
  - Large status indicator: 🟢 HEALTHY / 🟡 DEGRADED / 🔴 CRITICAL
  - System uptime
  - Last updated timestamp (live)
  - "Run Auto-Fix Now" button (triggers remediation)

Row 2 — 6 KPI Cards (real-time, updating via WebSocket)
  1. Requests/hour (with sparkline)
  2. Error rate % (red if >2%)
  3. Avg response time (red if >1000ms)
  4. Active sessions
  5. Auto-fixes today
  6. Active tenants

Row 3 — Charts (2 columns)
  Left: Request volume over last hour (line chart, updates every 30s)
  Right: Error rate over last 24 hours (line chart)

Row 4 — Recent Errors Table
  Columns: Severity, Error, Affected Module, First Seen, Last Seen, Count, Status, Actions
  - Colour-coded rows (red=critical, orange=warning, grey=info)
  - "Explain (AI)" button → calls generate-explanation endpoint, shows result inline
  - "Mark Fixed" button
  - "View Details" expands to show full stack trace + AI explanation

Row 5 — Module Health Grid
  - Card per module: name, requests today, errors today, status dot

IMPORTANT: 
- Update the error logging middleware to save more structured data:
  In artifacts/api-server/src/lib/logger.ts or wherever errors are logged,
  ensure we save: route, method, tenantId, userId, statusCode, errorCode

DO NOT:
- Do not change the remediationEngine.ts logic (only call it)
- Do not expose any of this to non-super-admin users
- Do not delete any error logs (only mark status)

VERIFY:
Show me:
1. The health route endpoints
2. The WebSocket implementation
3. The health dashboard page component
```

### 6B — Client-Facing Error Protection

**Copy this prompt into VS Code Claude:**

```
TASK: Ensure clients (tenants) NEVER see raw error messages or stack traces. 
All errors should be gracefully handled.

CONTEXT:
- Backend: artifacts/api-server/src/
- Frontend: artifacts/crm/src/
- Current situation: Errors may return raw stack traces to clients in development mode

BACKEND CHANGES:

1. Update the global error handler in artifacts/api-server/src/app.ts 
   (find the error handling middleware — it's usually at the bottom of app.ts):
   
   RULE 1: In production (NODE_ENV=production), NEVER return stack traces
   RULE 2: All errors must return a consistent JSON shape:
   {
     "error": true,
     "code": "ERROR_CODE",     // machine-readable
     "message": "...",         // human-friendly message
     "requestId": "..."        // for support reference
   }
   
   ERROR CODE MAP (create this mapping):
   - 400: "VALIDATION_ERROR" → "Please check your input and try again."
   - 401: "UNAUTHORISED" → "Please sign in to continue."
   - 403: "FORBIDDEN" → "You don't have permission to do that."
   - 404: "NOT_FOUND" → "The requested item could not be found."
   - 429: "RATE_LIMITED" → "Too many requests. Please wait a moment."
   - 500: "SYSTEM_ERROR" → "Something went wrong on our end. Our team has been notified."
   - 503: "SERVICE_UNAVAILABLE" → "This service is temporarily unavailable."

   For 500 errors: Generate a unique requestId (uuid), log the full error with requestId
   to error_logs table, return ONLY the requestId to the client.
   This way support can look up what happened without exposing it to the client.

2. Add a circuit breaker for module routes:
   If a module has thrown errors 10+ times in the last 5 minutes:
   - Return a specific response: { "code": "MODULE_DEGRADED", "message": "This feature 
     is temporarily unavailable. Our team has been notified and is working on a fix." }
   - Log an alert-level error (so the health dashboard shows it)

FRONTEND CHANGES:

1. Update the API client (find it in lib/api-client-react/ or artifacts/crm/src/) 
   to handle errors consistently:
   - 401 → redirect to login
   - 403 → show toast: "You don't have permission to do that"
   - 404 → show toast: "Not found"  
   - 500 → show toast: "Something went wrong. Reference: [requestId]" 
           with a copy-to-clipboard button for the requestId

2. Add a global error boundary component (ErrorBoundary.tsx) in artifacts/crm/src/components/:
   - Catches any React rendering errors
   - Shows a friendly page: "Something went wrong. We've noted this and will fix it."
   - Has a "Refresh page" button and "Go to dashboard" button
   - Does NOT show any stack trace

3. Wrap the entire app in the ErrorBoundary in main.tsx

4. For empty states (no data), add friendly empty state components:
   - "No contacts yet. Add your first contact to get started." with an action button
   These are better than blank tables.

DO NOT:
- Do not remove any existing error logging (keep all logs going to the DB)
- Do not change the monitoring/health dashboard (that still gets full details)
- Do not modify the remediationEngine

VERIFY:
Show me:
1. The updated error handler middleware in app.ts
2. The ErrorBoundary component
3. How the API client handles the standard error shapes
```

### 6C — Predictive Monitoring & Alerts

**Copy this prompt into VS Code Claude:**

```
TASK: Add predictive monitoring so you get warned BEFORE things break, 
and add an alert system so critical issues notify you immediately.

CONTEXT:
- Build on top of the health endpoints created in Phase 6A
- We need: trend detection, threshold alerts, and notification delivery

BACKEND:

1. Create a monitoring scheduler:
   Check if the project uses node-cron or any scheduling library (look in package.json).
   If not, install node-cron.
   
   Create: artifacts/api-server/src/lib/monitoringScheduler.ts
   
   This runs EVERY 5 MINUTES and checks these conditions:
   
   CRITICAL ALERTS (notify immediately):
   - Error rate > 10% in last 10 minutes
   - Any 500 error on /api/auth routes (auth system may be broken)
   - Database connection failures
   - Worker has been down > 30 minutes
   - Any security-related error codes (rate limiting triggered 50+ times)
   
   WARNING ALERTS (notify if not acknowledged in 1 hour):
   - Error rate > 2% for last 30 minutes (degrading trend)
   - Average response time > 2 seconds for last 10 minutes
   - Any module returning errors on >50% of requests
   - Queue depth growing consistently for 15 minutes
   - Disk/memory warning (if accessible)
   
   PREDICTIVE ALERTS:
   - Error rate doubling in last 30 minutes (warn before it peaks)
   - Response time trending upward for 20 minutes straight
   - More than 3 new unique errors in last hour (something changed)

2. Alert delivery:
   Create: artifacts/api-server/src/lib/alertDelivery.ts
   
   Delivery methods to implement:
   a) In-app notification (write to notifications table — already exists)
      Target: SUPER_ADMIN users only
      Priority: high
      
   b) Email alert (use existing email setup in the codebase)
      To: SUPER_ADMIN_EMAIL env var (add this to .env.example)
      Subject: "🔴 Hubforte Alert: [condition]" or "🟡 Hubforte Warning: [condition]"
      Body: Plain English description, what triggered it, link to health dashboard
      
   Alert deduplication: Don't send the same alert more than once per hour
   Store sent alerts in a new table: monitoring_alerts
   (id, condition, severity, sentAt, acknowledgedAt, message)

3. Add a GET /api/super-admin/health/alerts endpoint:
   Returns recent monitoring alerts with acknowledged status
   
4. Add a POST /api/super-admin/health/alerts/:id/acknowledge endpoint

FRONTEND ADDITIONS to the health dashboard (Phase 6A):

1. Add an "Alerts" section above the error table:
   - List of recent alerts with severity, time, message, "Acknowledge" button
   - Unacknowledged critical alerts show a pulsing red indicator

2. Update the notification bell in the top bar:
   - When a critical alert arrives via WebSocket: play a subtle sound AND flash the bell
   - Show alert type in the notification list with different icon (⚠️ system alert vs 🔔 regular)

3. Add Alert Configuration UI (in settings or health dashboard):
   - Toggle each alert type on/off
   - Set SUPER_ADMIN_EMAIL for email alerts
   - Test button: "Send test alert" 

DO NOT:
- Do not implement SMS yet (that's a later integration)
- Do not make alerts visible to tenant admins (owner only)
- Do not spam — always deduplicate

VERIFY:
Show me:
1. The monitoringScheduler.ts file
2. The alertDelivery.ts file
3. The monitoring_alerts table migration
4. The alerts UI in the health dashboard
```

---

## PHASE 7 — Reports & Analytics (Month 2)

### What We're Doing

Sales teams live and die by reports. This phase turns the existing report engine into a powerful, self-service analytics tool comparable to Salesforce Reports.

**Copy this prompt into VS Code Claude:**

```
TASK: Build a comprehensive Reports & Analytics module with sales-focused views 
and a report builder UI.

CONTEXT:
- Existing report engine endpoint: POST /api/reports/execute
- Supports: filtering, sorting, pagination, CSV export, saved reports
- Supported entity types: organizations, contacts, tasks, activities, notes, volunteers,
  funders, funding_opportunities, programmes, students, placements, programme_cohorts,
  programme_sessions, session_attendance, outcome_frameworks, outcome_records,
  consent_records, parent_guardians
- Saved reports: already in DB table saved_reports
- Custom dashboards: already in DB table dashboards
- This module is gated behind module key: "reports"

BUILD A 4-SECTION REPORTS PAGE at /reports:

SECTION 1 — Pre-Built Sales Reports (always available when module is on)
These are templated reports with a one-click run button:

Sales Reports (shown when pipeline module is on):
1. "Open Pipeline by Stage" — opportunities grouped by stage with values
2. "Deals Won This Month" — closed-won opportunities, revenue, by owner
3. "Deals Lost This Month" — closed-lost with loss reason analysis
4. "Top 10 Accounts by Pipeline Value" — organisations with most opportunity value
5. "Sales Activity by Rep" — calls, emails, meetings per user this month
6. "Pipeline Velocity" — average days in each stage
7. "Revenue Forecast (Next 90 Days)" — weighted pipeline value by close date

Contact Reports (always available):
8. "New Contacts This Month" — contacts created, by source
9. "Contacts Without Activity (30+ days)" — at-risk contacts
10. "Contacts by Organisation" — hierarchy view

Activity Reports:
11. "Activity Summary by Type" — calls vs emails vs meetings this week/month
12. "Overdue Tasks" — tasks past due date by assignee

Campaign/Outreach Reports (if outreach module on):
13. "Campaign Performance" — opens, clicks, replies by campaign
14. "Email Engagement by Contact" — who's most engaged

Support Reports (if support module on):
15. "Open Tickets by Priority" 
16. "Average Resolution Time"

For each pre-built report: a card showing the report name, description, last run time, 
"Run Report" button, "Schedule" button, "Save to Dashboard" button.

SECTION 2 — Report Builder UI
A drag-and-drop (or step-by-step) interface to build custom reports:

Step 1: Choose Entity (dropdown: contacts, organisations, deals, activities...)
Step 2: Choose Fields to display (checkbox list of available columns for that entity)
Step 3: Add Filters (field + operator + value rows, add/remove rows)
         Operators: equals, not equals, contains, greater than, less than, is empty, 
         is between (date range), is in list
Step 4: Choose Sort (field + direction)
Step 5: Preview (run the report live, show first 20 rows)
Step 6: Save the report (name, description, category)

SECTION 3 — Saved Reports
- Grid of saved report cards
- Each card: name, entity type, last run, owner, "Run", "Edit", "Delete" buttons
- "Run" exports to table view below (or CSV download)
- Reports can be shared: "Share with all users in my team"

SECTION 4 — Dashboard Builder
- A grid layout where you can add saved report results as charts/tables
- Chart types: bar, line, pie, table, number (single KPI)
- Drag to resize and rearrange
- Save as a named dashboard
- Users can set their "default dashboard" 
- The main home page can embed a saved dashboard

BACKEND ADDITIONS:
1. Add these pre-built report query templates as named reports in the DB on startup
   (using the seed script or a migration)
2. Add GET /api/reports/templates — returns list of pre-built templates
3. Add POST /api/reports/schedule — schedule a report to run daily/weekly and 
   email the result as CSV (store in a report_schedules table)

DO NOT:
- Do not change the existing /api/reports/execute endpoint logic
- Do not remove any existing saved reports functionality
- safeguarding_notes is BLOCKED from reports — enforce this in the frontend too 
  (don't show it as an option in the report builder)

VERIFY:
Show me:
1. The updated reports page with all 4 sections
2. The report builder component (Steps 1-4 at minimum)
3. The pre-built report cards
```

---

## PHASE 8 — Integration Framework (Month 2)

### What We're Building

The ability to connect Hubforte with any other tool — just like Zapier connects everything. This makes Hubforte the hub of any client's tech stack.

### 8A — Universal Import/Export

**Copy this prompt into VS Code Claude:**

```
TASK: Build a production-grade import/export system that lets clients import from 
ANY CRM and export to ANY system.

CONTEXT:
- Existing import endpoint: /api/import (check what it currently does)
- Existing export: may be in /api/importexport or similar
- Goal: Bulletproof import from CSV with smart field mapping, and full data export

IMPORT SYSTEM:

Build a multi-step import wizard at /import (already in the nav):

Step 1 — Choose Source
  - Icons for common sources: "From CSV", "From Salesforce (CSV)", 
    "From HubSpot (CSV)", "From Pipedrive (CSV)", "From Zoho (CSV)"
  - Each source has instructions showing how to export CSV from that system
  - All options ultimately accept a CSV — just with different field mapping presets

Step 2 — Upload File
  - Drag-and-drop file upload area (CSV or Excel .xlsx)
  - File size limit: 50MB
  - Preview first 5 rows after upload
  - Show detected column headers

Step 3 — Map Fields
  - Two-column table: "Your file's column" → "Hubforte field"
  - Auto-suggest mappings (if column header is "First Name", suggest → first_name)
  - Required fields marked with *
  - Option to skip unmappable columns
  - "Save this mapping as template" checkbox

Step 4 — Validate
  - Run validation on entire file BEFORE importing
  - Show: "X rows ready to import, Y rows have issues"
  - List all validation errors with row numbers (email format, required fields, etc.)
  - "Fix errors and re-upload" or "Import valid rows only"
  - Duplicate detection: "X contacts already exist by email. Skip duplicates / Update existing / Import as new"

Step 5 — Import
  - Show progress bar (import runs in background via worker queue)
  - Real-time count: "Imported 450 / 1000 contacts"
  - On completion: "Import complete. 450 imported, 0 errors, 50 duplicates skipped."
  - Email notification on completion with summary
  - Import log stored in DB (importable history)

EXPORT SYSTEM:
Build an export page at /export (or add to the existing import-export route):

1. Export All Data — "Download everything" button
   - Exports all entities as a ZIP file with:
     contacts.csv, organisations.csv, activities.csv, deals.csv, notes.csv, tasks.csv
   - This is the "data portability" export for clients who want to leave
   - One-click export, runs in background, emails when ready

2. Export Per Module
   - Each module card with "Export CSV" button
   - Downloads immediately for <5000 rows, emails for larger files

3. Export to Specific Formats:
   - CSV (standard)
   - Excel (.xlsx) 
   - JSON (for developers/API use)

BACKEND:
1. Audit the existing /api/import endpoint — show me what it currently does
2. If it's incomplete, build the validation and duplicate detection
3. Add worker-queue based import processing (check how the worker already processes jobs)
4. Add a GET /api/import/history endpoint — last 10 imports with status
5. Add a GET /api/export/full endpoint (triggers background job, returns jobId)

DO NOT:
- Do not delete the existing import code — build on top of it
- Do not allow importing to safeguarding_notes through the standard import
- Do not import without tenant isolation (all imported rows must have correct tenantId)

VERIFY:
Show me:
1. The import wizard component (all 5 steps)
2. The export options page
3. The updated backend import validation logic
```

### 8B — Webhook & Integration Framework

**Copy this prompt into VS Code Claude:**

```
TASK: Build a webhook and integration system so Hubforte can connect to any external tool.

CONTEXT:
- This is Hubforte's "Zapier socket" — any external system can trigger Hubforte or be 
  triggered BY Hubforte
- Backend: artifacts/api-server/
- Need: outgoing webhooks (Hubforte pushes to external URL) AND incoming webhooks 
  (external services push to Hubforte)

PART A — OUTGOING WEBHOOKS (Hubforte notifies external systems):

New DB table: webhooks
  - id, tenantId, name, url, secret, events (array), active, createdAt
  - events: list of event types this webhook listens to

Event types to support:
  contact.created, contact.updated, contact.deleted,
  deal.created, deal.updated, deal.won, deal.lost,
  activity.created, task.created, task.completed,
  campaign.sent, support.ticket.created, support.ticket.resolved,
  user.created

Backend endpoints:
  GET /api/integrations/webhooks — list webhooks for current tenant
  POST /api/integrations/webhooks — create new webhook (with validation of URL)
  PATCH /api/integrations/webhooks/:id — update
  DELETE /api/integrations/webhooks/:id — delete
  POST /api/integrations/webhooks/:id/test — sends a test payload to the URL

Webhook delivery:
  Create: artifacts/api-server/src/lib/webhookDelivery.ts
  - When an entity event fires, find all active webhooks for that tenant and event
  - POST the event payload to each webhook URL
  - Include HMAC signature header (X-Hubforte-Signature) using webhook secret
  - Retry up to 3 times with exponential backoff on failure
  - Log all delivery attempts (success/fail) in webhook_delivery_log table

Integrate with existing entities:
  In the organizations routes, contacts routes, opportunities routes — after create/update/delete:
  call webhookDelivery.dispatch(tenantId, eventType, entityData)

PART B — INCOMING WEBHOOKS (external systems notify Hubforte):

Create a universal receiver endpoint:
  POST /api/webhooks/receive/:tenantId/:token
  - token is a per-tenant secret (stored in webhooks table as inbound_token)
  - Accepts any JSON payload
  - Puts it in a queue for processing
  - Returns 200 immediately (webhook delivery best practice)

PART C — PRE-BUILT CONNECTORS UI:

Create page at /integrations showing:

Available Connectors (displayed as cards with logo, name, description, status):

Row 1 — Email & Marketing:
  - SendGrid (email sending) — configuration: API key, from address
  - Mailchimp (marketing lists) — configuration: API key, list ID
  - Gmail (already built)

Row 2 — Communication:
  - Slack (notifications) — sends alerts to Slack channel — configuration: webhook URL
  - Twilio (SMS) — configuration: account SID, auth token, from number
  
Row 3 — Other Tools:
  - Zapier — shows the incoming webhook URL and instructions
  - Make (Integromat) — same as Zapier
  - Custom Webhook — DIY webhook setup

Row 4 — CRM Import:
  - Salesforce — link to import page with Salesforce-specific instructions
  - HubSpot — same
  - Pipedrive — same

Each connector card:
  - Logo, name, description
  - Status badge: Connected / Not configured / Coming soon
  - "Configure" button → opens a side panel with fields to enter credentials
  - Store connector credentials in DB: integration_configs table (encrypted)

BACKEND for SendGrid (as an example implementation):
  When outreach module sends an email AND SendGrid is configured:
  Use SendGrid API instead of the default nodemailer
  Check integration_configs for 'sendgrid' connector for the tenant

DO NOT:
- Do not implement all connectors at once — just build the FRAMEWORK and implement 
  SendGrid and Slack as working examples
- Do not store API keys in plain text — use encryption (check if the project has 
  an encryption utility, if not use Node.js crypto AES-256)
- Do not charge for integrations yet (no billing system)

VERIFY:
Show me:
1. The webhook creation and delivery system
2. The integrations page with connector cards
3. The SendGrid connector implementation (as a working example)
4. The Slack connector (sends a test notification)
```

---

## PHASE 9 — AI Layer (Month 2–3)

### What We're Building

POLICY UPDATE (supersedes original text below):
BYOK is disabled by default. Owner-controlled only. Clients cannot
self-enable. Support ticket AI diagnosis is a system/technical feature
— disabled for clients by default. See HUBFORTE_AGENT_CONTEXT_v2.md
for the full updated AI policy.

AI that helps your clients' teams work smarter — not a chatbot for chatting, but AI woven into the workflow. Lead scoring, email generation, navigation help. And BYOK so cost-conscious clients control their spend.

**Copy this prompt into VS Code Claude:**

```
TASK: Build the client-facing AI layer with BYOK (Bring Your Own Key) support 
and workflow AI features.

CONTEXT:
- Existing AI provider abstraction: artifacts/api-server/src/lib/aiProvider.ts
- This already supports OpenAI, Anthropic, and OpenRouter
- Target low-cost model: OpenRouter with DeepSeek V3 (model ID: deepseek/deepseek-chat)
- Current system AI routes: /api/ai/* (ungated — fix this too)
- Goal: AI features that help SALES TEAMS specifically

PART A — BYOK SYSTEM:

1. New DB table: tenant_ai_config
   - tenantId, provider, apiKey (encrypted), model, monthlyBudgetUSD, usageThisMonth
   
2. Backend endpoints:
   GET /api/settings/ai — returns current tenant AI config (key masked: "sk-...xxxx")
   POST /api/settings/ai — save/update AI config
     Body: { provider, apiKey, model, monthlyBudget }
   DELETE /api/settings/ai — remove custom config (revert to system default)
   GET /api/settings/ai/usage — returns usage this month vs budget

3. Update aiProvider.ts:
   - Before using system AI keys, check if the tenant has their own config in tenant_ai_config
   - If yes: use their key and model
   - If no: use system default (your OpenRouter key with DeepSeek V3 as default)
   - Track usage per tenant in tenant_ai_config.usageThisMonth
   - If usage > monthlyBudget, return error: "AI budget reached. Update your AI settings."

4. Default system AI model:
   Update .env.example to add:
   AI_DEFAULT_PROVIDER=openrouter
   AI_DEFAULT_MODEL=deepseek/deepseek-chat
   (DeepSeek V3 via OpenRouter: ~$0.27/million tokens — very cost effective)

PART B — GATE THE /api/ai/* ROUTES:

Currently /api/ai/* has no module flag. Fix this:
In artifacts/api-server/src/routes/ wherever /ai routes are mounted:
Add checkModuleEnabled('ai') middleware
Add 'ai' module to the moduleRegistry with default: true

PART C — AI FEATURES FOR SALES TEAMS:

1. Email Composer AI (add to outreach/campaign creation):
   Button: "Generate with AI"
   Form: Target audience description, tone (professional/friendly/urgent), key message
   Calls: POST /api/ai/compose-email with the form data
   Returns: A draft email subject + body
   User can edit before sending

2. Contact Summary AI (add to contact detail page):
   Shows a small card: "AI Summary" 
   Content: Last activity, open tasks, deal stage, recent notes — summarised in 2-3 sentences
   Button to refresh summary
   Calls: POST /api/ai/contact-summary/:contactId

3. Lead Score AI:
   Add a "Lead Score" field to contacts (a number 0-100)
   Calculation: Based on activity count, email engagement, deal stage, last contact date
   Show as a coloured badge: Cold (0-30), Warm (31-60), Hot (61-80), Ready (81-100)
   POST /api/ai/score-lead/:contactId — runs scoring logic (rules-based + AI explanation)
   Recalculate on contact update (background job, not blocking)
   In the contacts list: sortable by lead score, filter by score range

4. Next Best Action:
   On the contact detail page, below the activity timeline:
   "What to do next" card — calls AI with contact context
   Returns: One specific recommended action ("This contact hasn't been contacted in 14 days 
   and has an open proposal. Send a follow-up email.")
   Shows as a callout with a "Log this as a task" button

5. AI Navigation Helper (lightweight, not a full chatbot):
   A small "?" floating button in the corner
   Clicking opens a small popup with: text input "What are you looking for?"
   On input: Uses AI to map the question to a page/feature and provides a direct link
   Example: "How do I see my pipeline?" → "Your pipeline is here: [Pipeline link]"
   This is NOT a general AI chat — it's strictly navigation-focused
   Cap it at 10 requests per user per day (prevent abuse)

PART D — AI SETTINGS PAGE:

Add to settings: "AI & Intelligence" section showing:
- Current AI source: "System default (DeepSeek V3)" or "Your own key ([provider])"
- Form to enter own key (BYOK)
- Monthly usage bar chart
- Budget limit setting
- Toggle for each AI feature on/off
- "Test AI connection" button

DO NOT:
- Do not build a general AI chat interface for clients
- Do not allow AI to access safeguarding data
- Do not expose the system API keys to tenant users in any response
- Do not block the system if AI fails — all AI features should degrade gracefully 
  (show "AI unavailable" instead of crashing)

VERIFY:
Show me:
1. The tenant_ai_config backend and BYOK implementation
2. The Email Composer AI component
3. The Lead Score badge on contacts
4. The AI settings page
```

---

## PHASE 10 — Deployment (Month 3)

### What We're Building

A clean, reproducible deployment pipeline from your Windows laptop → GitHub → OCI (Oracle Cloud). Cloud-agnostic so you can switch to DigitalOcean, Railway, or Render without rewriting anything.

**Copy this prompt into VS Code Claude:**

```
TASK: Create a complete deployment setup for Hubforte — Docker for all services, 
GitHub Actions CI/CD, and OCI configuration.

CONTEXT:
- Monorepo with 3 deployable services:
  1. api-server (Express backend) — port 3000
  2. crm (React Vite SPA) — static files
  3. lms (React Vite SPA) — static files  
  4. worker (campaign worker) — already has Dockerfile
- Database: Neon PostgreSQL (managed, stays outside containers)
- Target: Oracle Cloud Free Tier (2 ARM compute instances)
- Must also work on: DigitalOcean, Railway, Render, Fly.io (cloud-agnostic)

CREATE THESE FILES:

1. artifacts/api-server/Dockerfile:
FROM node:20-alpine
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
ENV NODE_ENV=production
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s CMD wget -qO- http://localhost:3000/healthz || exit 1
CMD ["node", "dist/index.js"]

2. artifacts/crm/Dockerfile:
Multi-stage: build React app, then serve with nginx
(write the full Dockerfile using nginx:alpine)

3. artifacts/lms/Dockerfile:
Same pattern as CRM

4. docker-compose.yml (at project root — for LOCAL DEVELOPMENT only):
Services: api-server, crm, lms, worker
Shared network
Environment variables from .env files
Port mappings for development

5. docker-compose.prod.yml (for production):
Same services but with production settings
Use environment variables from actual env vars (not .env files)
Add healthchecks
Add restart: always
Add resource limits

6. .github/workflows/deploy.yml:
Triggers on: push to main branch
Steps:
  - Checkout code
  - Run tests (pnpm test)
  - Build Docker images
  - Push to GitHub Container Registry (ghcr.io)
  - SSH into OCI server and pull + restart containers
  (use GitHub Secrets for SSH key and OCI host)

7. ops/OCI_SETUP.md:
Step-by-step guide for Oracle Cloud Free Tier:
  - Create instance (Ampere ARM, 4 OCPU, 24GB RAM — free tier)
  - Install Docker + Docker Compose
  - Set up nginx reverse proxy with SSL (Certbot/Let's Encrypt)
  - Copy environment variables (never from git — type them in manually)
  - Pull and run containers
  - Set up automated DB backup to Oracle Object Storage (free tier)

8. .env.production.example (at project root):
  A template showing ALL required env vars for production
  With instructions for each value
  NO actual values — just placeholders and comments

IMPORTANT — CLOUD AGNOSTIC RULE:
In the docker-compose files and Dockerfiles, do not use any OCI-specific APIs.
Everything must work by just changing environment variables and the deployment target.
Include a note in ops/ explaining how to deploy to: Railway, Render, Fly.io as alternatives.

DO NOT:
- Do not change any application code
- Do not create any cloud provider accounts or credentials
- Do not modify the database schema

VERIFY:
Show me:
1. All 5 Dockerfiles/compose files
2. The GitHub Actions workflow
3. The OCI_SETUP.md guide
4. The .env.production.example
```

---

## PHASE 11 — Team Access System (Month 3)

### What We're Building

When you hire developers or managers, they need the right level of access without seeing things they shouldn't. And when you're showing them an error, you need to be able to say "here's the error in plain English, here's how to fix it."

**Copy this prompt into VS Code Claude:**

```
TASK: Build a team access management system with roles, developer access, and an 
error knowledge base in plain English.

CONTEXT:
- Current roles: SUPER_ADMIN, ADMIN, MANAGER, OPERATOR, VIEWER
- Need to add: DEVELOPER role with code-level access but not client data
- Backend users table already exists with role column
- Need: A proper team management UI, developer portal, and error knowledge base

PART A — ENHANCED ROLE SYSTEM:

Update the roles with clearer permissions:

SUPER_ADMIN (only you):
  - Full access to everything
  - Module Control Centre
  - Health Dashboard  
  - Team Management (can create/delete any user)
  - Super Admin panel
  - Can see all tenants
  
OWNER (per-tenant):
  - Full access within their tenant
  - Can manage their tenant's users
  - Can configure modules (within what SUPER_ADMIN allows)
  - Can see billing/usage
  - CANNOT see other tenants
  
ADMIN (per-tenant):
  - Full CRM access
  - Can manage users within their team (except OWNER role)
  - Reports, settings, imports
  
MANAGER:
  - All CRM features
  - Can view all team members' data
  - Cannot manage users or settings
  
OPERATOR:
  - Standard CRM features
  - Can only see/edit own records + shared records
  
VIEWER:
  - Read-only access to all records
  
DEVELOPER (system-level, not per-tenant):
  - Can see: error logs, health dashboard, API documentation, system status
  - Can see: code-level information, request traces, performance metrics
  - CANNOT see: any actual client/tenant data, CRM records, contacts, deals
  - This role is for your future employees who fix bugs

Add a new table: role_permissions (or a JSON permissions map in code):
Define exactly what endpoints each role can access.

PART B — TEAM MANAGEMENT UI:

Create page at /admin/team:

1. User List Table:
   Columns: Name, Email, Role, Status (active/suspended), Last Login, Actions
   Actions: Edit role, Suspend/Activate, Reset password, Delete

2. Invite User:
   - Click "Invite user" button
   - Enter email + select role
   - System sends invitation email with set-password link
   - Invitation expires in 48 hours

3. Pending Invitations section:
   - List of invitations not yet accepted
   - "Resend" and "Cancel" buttons

4. User Profile (when you click a user):
   - Basic info, role, last login, active sessions
   - "Force logout all sessions" button
   - Login history (last 10 logins with IP, device)
   - Reset 2FA button (if user is locked out)

PART C — ERROR KNOWLEDGE BASE (for communicating with future developers):

Create page at /super-admin/knowledge-base:

This is a database of all errors that have occurred, each with:
- Error code / pattern
- Plain English explanation (auto-generated by AI, editable by you)
- Step-by-step fix instructions (editable)
- Status: Known issue / Fixed in version / Working as expected / Needs investigation
- First seen, last seen, occurrence count
- Was it auto-fixed by the remediation engine?

BUILD:
1. Backend: GET /api/super-admin/knowledge-base — returns error_logs with AI explanations
2. Backend: PATCH /api/super-admin/knowledge-base/:errorId — update explanation or fix steps
3. Backend: POST /api/super-admin/knowledge-base/:errorId/generate-explanation
   (same as in Phase 6, if not already built)

Frontend:
- Search bar (search by error message or code)
- Filter by status, module, date range
- Each error row: expandable with full details, AI explanation, fix steps
- Edit button → inline editor for explanation and fix steps
- "Create Task" button → creates a task assigned to a developer user: 
  "Fix: [error name] — [AI description]"
- Export to CSV/Markdown for sharing with external developers

IMPORTANTLY:
When you hire a developer and want to tell them about an error:
1. Find it in the knowledge base
2. Click "Share with developer" → generates a shareable internal link
3. The developer (with DEVELOPER role) can see the error details, logs, and fix steps
4. They cannot see any client data

DO NOT:
- Do not remove existing role checks
- Do not give DEVELOPER role access to any tenant data
- Do not implement billing or subscription management yet

VERIFY:
Show me:
1. The role permissions map
2. The team management page
3. The invite user flow
4. The error knowledge base UI
```

---

## PHASE 12 — Voice, Advanced & Future Features (Month 4+)

These are planned but require more research and external services. Here is what to build and the approach for each.

### Voice-Based Customer Support & Sales Agents

**What to build:** An AI voice agent that can handle customer support calls and assist sales reps.

**Approach:**
- Use Twilio Voice + OpenAI Realtime API (or a service like Vapi.ai or Bland.ai)
- Vapi.ai recommendation: Much easier to integrate than building from scratch. Free tier available.
- The agent reads CRM data (contacts, tickets, deals) to answer questions
- All calls are logged to the activities table automatically
- Transcripts saved as notes

**Prompt to give your agent when ready:**
```
Research and implement a voice AI agent using Vapi.ai that:
1. Can handle inbound support calls (looks up contact in CRM by phone number)
2. Can make outbound sales follow-up calls (reads deal details from CRM)
3. Logs every call as an activity in Hubforte
4. Saves transcript as a note on the contact record
5. Has configurable script per tenant (stored in DB)
Reference the Vapi.ai documentation for the latest API.
Integrate with the existing contacts and activities backend endpoints.
```

### Attach.io-Style Attachment Monitoring

**What to build:** Track every document, image, and file — who viewed it, when, how long.

**Approach:**
- Already have an `attachments` module — extend it
- Add: view tracking pixel / signed URL expiry
- Show: "John Smith opened the proposal at 2:34pm, spent 4 minutes on it"
- This is powerful for sales (know when a prospect reads your quote)

### Quote & Proposal Builder

**What to build:** Create professional PDFs directly from Hubforte.

**Approach:**
- Use Puppeteer (already in the codebase — there's a tmp-puppeteer-check.pdf)
- Build a template editor (HTML/CSS based)
- One-click: populate with contact/deal data, generate PDF, send via email
- Track opens (links back to attachment monitoring)

### E-Signature

**Approach:** Integrate with SignWell (free tier available) or DocuSign.
Much easier than building from scratch. Use their API to send documents for signing.

### Mobile PWA

**Approach:**
- Add service worker to the CRM Vite app
- Add PWA manifest
- Offline reading of contacts (cached)
- Push notifications via web push API
- This makes it installable on phones without building a native app

---

## PART 5 — AI Strategy & Cost Management

### Recommended AI Models (Low Cost)

| Use Case | Model | Provider | Cost per 1M tokens | Notes |
|---|---|---|---|---|
| System default (all features) | DeepSeek V3 | OpenRouter | ~$0.27 input | Best value, very capable |
| Quick lookups, lead scoring | DeepSeek V3 | OpenRouter | Same | Fast and cheap |
| Navigation AI helper | GLM-4-Flash | OpenRouter | ~$0.07 input | Cheapest option |
| Complex analysis | DeepSeek R1 | OpenRouter | ~$0.55 input | For reports/insights |
| Client BYOK (their choice) | Any | Their own | Their cost | They pay, you don't |

### Cost Estimate for YOU (System AI Costs)

Assume 50 active users across all tenants, each using AI 10 times per day:
- 500 AI calls/day × avg 500 tokens = 250,000 tokens/day
- DeepSeek V3 at $0.27/million = $0.07/day = ~$2.10/month

That's extremely affordable. Add client BYOK and your costs drop further as you grow.

### OpenRouter Setup

```
In your .env:
AI_DEFAULT_PROVIDER=openrouter
OPENROUTER_API_KEY=your-openrouter-key-here
AI_DEFAULT_MODEL=deepseek/deepseek-chat

OpenRouter URL: https://openrouter.ai — free to sign up
Rate limits on free tier: 200 requests/day
Paid tier: Pay as you go, no monthly fee
```

---

## PART 6 — Deployment Strategy

### The Windows → GitHub → OCI Flow

```
Your laptop (Windows + VS Code)
    ↓
Make changes, test locally (npm run dev)
    ↓
Git commit + push to GitHub (main branch)
    ↓
GitHub Actions triggers automatically
    ↓
Builds Docker images
    ↓
Pushes to GitHub Container Registry (free)
    ↓
SSH into OCI server, pulls new images
    ↓
Restarts containers (zero-downtime with docker compose)
    ↓
Live for all clients
```

### The Rollback Plan (If Something Breaks)

```
# On your OCI server (SSH in):
# Roll back to previous version:
docker compose pull api-server:previous
docker compose up -d api-server

# Or rollback to a specific tag:
docker pull ghcr.io/yourusername/hubforte-api:v1.2
```

### If You Want to Move Away from OCI

The Dockerfiles work on any cloud. Just change the deployment target:
- **Railway:** Push to GitHub, connect Railway, deploy in 5 minutes. No server management.
- **Render:** Same as Railway, free tier available.
- **DigitalOcean App Platform:** Slightly more control, $5/month.
- **Fly.io:** Best for global deployment, good free tier.

---

## PART 7 — Team Access Plan

### When You Hire Your First Developer

1. Create them a DEVELOPER role account in Hubforte
2. They get: error knowledge base, health dashboard, API docs, request traces
3. They do NOT get: any client data, module toggles, tenant management

To tell them about a bug:
1. Open the error knowledge base
2. Find the error
3. Click "Share with developer"
4. Send them the link (they log in with their developer account to view it)
5. The AI explanation + fix steps are already there

### When You Hire a Sales/Support Employee

1. Create them an OPERATOR account under the relevant tenant
2. They see: only their client's CRM data
3. They do NOT see: other tenants, system health, error logs, module control

### What You (SUPER_ADMIN) Always Control

- Module toggle for every tenant
- All user accounts and roles  
- System health and errors
- AI configuration
- Billing and usage
- Which employees see what

---

## PART 8 — Client Success Strategy

### "Never Face an Unresolved Issue" — How This Works

**Client Experience:**
1. Something breaks for a client → they see a friendly error message with a reference code
2. The nervous system alerts you immediately (in-app + email)
3. The AI knowledge base already has the explanation + fix steps
4. You (or your developer) can fix and deploy within hours
5. Client gets an update: "The issue you encountered has been resolved."

**Target SLAs (Service Level Agreements):**
- Critical issues (client cannot use the system): Fix within 4 hours
- Standard issues (feature not working): Fix within 24 hours
- Minor issues (cosmetic, slow): Fix within 72 hours

**Build a Status Page (Phase 8 or later):**
- A public page at status.hubforte.com
- Shows current system status (green/yellow/red)
- Incident history
- Maintenance windows
- Clients can subscribe for email updates
- Use: Statuspage (free tier) or Instatus (free)

### Data Portability Guarantee (Trust Builder)

When a client wants to leave:
1. They click "Export All My Data" in settings
2. Get a ZIP file with every record they ever created
3. In any standard format (CSV + JSON)
4. Works seamlessly without you having to do anything manually

This builds trust and removes sales objections.

---

## SUMMARY: Your First Week of Actions

### Day 1 (TODAY):
- [ ] Rotate all credentials (Neon DB, Gmail OAuth, JWT secrets)
- [ ] Fix .gitignore
- [ ] Run: `git rm --cached artifacts/api-server/.env`
- [ ] Push these gitignore changes to GitHub

### Day 2:
- [ ] Phase 1A: Fix module key mismatch (single line change)
- [ ] Verify Organisations and Contacts are now visible in nav

### Day 3–4:
- [ ] Phase 1B: Add all hidden modules to nav
- [ ] Phase 1C: Connect LMS to CRM

### Day 5:
- [ ] Phase 2A: Clean dead code (with agent scanning first)
- [ ] Verify app still works after cleanup

### Day 6–7:
- [ ] Phase 3A: New login page design
- [ ] Take screenshots and share to validate design before moving on

### Week 2: Phase 3B (tenant onboarding) + Phase 4 (UI)
### Week 3: Phase 5 (Module Control Centre) + Phase 6 (Nervous System)
### Month 2: Phases 7, 8, 9
### Month 3: Phases 10, 11
### Month 4+: Phase 12

---

*This document was generated from a full audit of the Hubforte codebase on 2026-04-23.*
*All file paths reference the actual monorepo structure found during audit.*
*Update this document after each phase is complete.*
