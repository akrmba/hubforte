# Hubforte — MASTER BUILD PLAN v2.0
### From Vibe-Coded Foundation to Enterprise-Grade Platform
**Version:** 2.0 (Research-backed, gap-patched) | **Date:** 2026-04-24
**Previous version gaps fixed:** 7 gaps closed, 3 weak sections strengthened, enterprise research integrated

---

> **HOW TO USE THIS DOCUMENT**
> Read each phase in order. Every phase has: a plain-English explanation of WHY it matters,
> exactly WHAT to build, and a ready-to-paste prompt for your VS Code Claude/Codex agent.
> The prompts include your actual file paths. Never skip the VERIFY step — it is your proof
> the work was done correctly. Never run Phase N+1 until Phase N is verified.
>
> **VERSION RULE**
> `HUBFORTE_MASTER_PLAN_v2.md` is the active source of truth and the way forward.
> Only reuse older v1 prompt text when this v2 document explicitly tells you to do so.
> When v2 says to reuse v1, the correct legacy file is `framework/HUBFORTE_MASTER_PLAN.md`
> (not `HUBFORTE_MASTER_PLAN_v1.md`).

---

## ⚠️ PART 0 — SECURITY EMERGENCY (Do TODAY — Before Anything Else)

Your live Neon database password, Gmail OAuth secret, JWT signing key, and admin email are
currently in your GitHub repository. This means anyone with repo access — or anyone who finds
it via Google — can delete your database, log in as admin, and send emails from your account.

### 0A — Rotate All Credentials (15 minutes)

**A. Neon Database**
1. Go to https://console.neon.tech → your project → Settings → Reset password
2. Copy the new DATABASE_URL
3. Update it in your local files: `artifacts/api-server/.env` AND `lib/db/.env`
4. Do NOT commit the new password to Git

**B. Gmail OAuth Secret**
1. Go to https://console.cloud.google.com → APIs & Services → Credentials
2. Find the OAuth 2.0 client matching your GMAIL_CLIENT_ID
3. Click → Reset secret
4. Update GMAIL_CLIENT_SECRET in your local `.env`

**C. Generate New JWT + Session Secrets**
Open PowerShell on your Windows laptop and run:
```
node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"
```
Run it twice. Use the two results as your new JWT_SECRET and SESSION_SECRET.

**D. Change Admin Password**
Log into the system → Profile → Change password from `ChangeMe123!` to something strong.
Write it down in a password manager (1Password, Bitwarden, or even your phone's notes app).

**E. Rotate Worker Secret**
Run the node command again. Use as WORKER_SECRET.

### 0B — Fix .gitignore

```
TASK: Fix .gitignore permanently so credentials can never be committed again.

CONTEXT: This is a pnpm monorepo. The file artifacts/api-server/.env was committed to 
git and contains live credentials. This is a security incident that must be closed now.

DO THIS:

STEP 1 — Update root .gitignore with these exact lines:
# ============================================================
# SECURITY — NEVER COMMIT THESE
# ============================================================
.env
.env.*
!.env.example
!.env.production.example
**/.env
**/.env.*
!**/.env.example
lib/db/.env

# Build outputs
**/dist/
**/build/
**/.cache/
**/tsconfig.tsbuildinfo

# Editor/IDE internal files
**/.replit-artifact/
**/.idea/
**/.vscode/settings.json

# Old/temp files
not_required_1904_12pm/
**/tmp-*.pdf
**/tmp-*.html

# Logs (never commit logs)
*.log
**/backups.log
logs/

# OS
.DS_Store
Thumbs.db

# Node
node_modules/
**/node_modules/

STEP 2 — Remove the committed .env files from git tracking (keeps them on disk):
Run these commands one at a time:
  git rm --cached artifacts/api-server/.env
  git rm --cached lib/db/.env
  git add .gitignore
  git commit -m "security: remove committed env files and fix gitignore"
  git push

STEP 3 — Verify:
Run: git status
The .env files should NOT appear in tracked files.
Run: git log --oneline -5
The commit should show at the top.

DO NOT:
- Do not delete the .env files from your local disk
- Do not modify any application code
- Do not touch route files or components

VERIFY: Show me the output of "git status" and confirm .env files are untracked.
```

### 0C — Emergency Access (The "Break Glass" System)

This is what AWS calls "break glass" — a way to access your system if you are ever locked out. 
Enterprise companies like AWS require this to be set up before anything else.

```
TASK: Set up emergency access credentials that allow you to recover the system if you 
are ever locked out of your normal admin account.

CONTEXT: 
This is based on AWS's "break glass" security pattern. The idea: create a second 
emergency admin account whose credentials are stored SEPARATELY from your main login.
If your main account is locked, hacked, or you forget the password — you still have access.

WHAT TO BUILD IN THE DATABASE:

1. In the users table, add a new user record directly via a migration script (NOT via UI):
   - email: emergency@hubforte.internal (a non-real email — cannot receive mail)
   - role: SUPER_ADMIN
   - tenant_id: NULL (super admin has no tenant)
   - is_emergency_account: true (add this boolean column to users table)
   - status: suspended (IMPORTANT: suspended by default — only active during emergency)
   - Notes: This account cannot log in during normal operations

2. Create the database migration:
   File: lib/db/migrations/0XXX_emergency_account.sql
   Add: ALTER TABLE users ADD COLUMN is_emergency_account BOOLEAN DEFAULT FALSE;
   Insert the emergency user record with a hashed password (use bcrypt, same as other users)
   The password should be 32 random characters.

3. Create a script: scripts/emergency-access.ts
   This script when run:
   a) Checks if emergency account exists in DB
   b) Un-suspends it temporarily (sets status = 'active') for 2 hours
   c) Logs the activation to audit_logs with timestamp and reason
   d) After 2 hours: automatically suspends it again (use a setTimeout or cron)
   e) Sends email to SUPER_ADMIN_EMAIL saying "Emergency access was activated at [time]"
   f) Prints the login URL and credentials to the terminal (never saves to a file)

4. Add a route: POST /api/super-admin/emergency-access/activate
   - Requires: special EMERGENCY_ACTIVATION_TOKEN (a secret in .env, separate from JWT_SECRET)
   - This token is used ONLY for emergency access, nothing else
   - When called with the correct token: runs the same logic as the script above
   - Can only be called from localhost (check req.ip === '127.0.0.1' || req.ip === '::1')
   - Rate limited: 3 attempts per hour maximum

5. Add to .env.example:
   EMERGENCY_ACTIVATION_TOKEN=    # 64-char random string, store separately from this file
   SUPER_ADMIN_EMAIL=             # Your email for emergency notifications

HOW YOU USE THIS IF LOCKED OUT:
If you cannot log in:
1. SSH into your OCI server (you have SSH access separately from the app login)
2. Run: node scripts/emergency-access.ts
3. It prints the temporary login credentials to your terminal
4. Log in, fix the issue, log out
5. The account auto-suspends after 2 hours

IMPORTANT STORAGE RULE:
Write the EMERGENCY_ACTIVATION_TOKEN and emergency account password on paper.
Store it physically in a safe place (not digitally, not in email, not in a note app).
This is exactly what AWS recommends: one set of emergency credentials, physically secured.

DO NOT:
- Do not make the emergency account usable during normal operations
- Do not store the emergency password in git or any code file
- Do not let the emergency account bypass audit logging

VERIFY:
Show me:
1. The migration SQL file
2. The emergency-access.ts script  
3. The activate endpoint
4. Confirm the emergency account is suspended by default in the seed data
```

---

## PART 1 — FIX WHAT IS BROKEN (Week 1, Days 2–5)

### Why This Matters First

Everything else depends on this. The modules are built. The module toggle system exists.
The only reason you cannot see Organisations, Contacts, and most other modules in the nav
is three wrong words in one file. Fix these and 80% of your "UI is broken" problem disappears.

### 1A — Fix the Module Key Mismatch (15-minute fix)

```
TASK: Fix the module key mismatch that is hiding Organisations and Contacts from the nav.

CONTEXT:
- File to edit: artifacts/crm/src/components/Layout.tsx
- Problem: The nav array checks module:"schools" for both Organisations and Contacts
- Correct backend keys are: "organisations" and "contacts"
- This one wrong key is causing both nav items to disappear

DO THIS:
1. Open artifacts/crm/src/components/Layout.tsx
2. Find the PRIMARY_NAV array (around line 90-97)
3. Change:
   { href: "/ext/schools",   label: "Organisations", module: "schools" }
   To:
   { href: "/ext/schools",   label: "Organisations", module: "organisations" }
   
4. Change:
   { href: "/ext/contacts",  label: "Contacts",      module: "schools" }
   To:
   { href: "/ext/contacts",  label: "Contacts",      module: "contacts" }

DO NOT change any href values, any other nav items, or any backend files.

VERIFY: Show me the updated PRIMARY_NAV array. Both items must show their correct module key.
```

### 1B — Add All Built-But-Hidden Modules to the Nav

```
TASK: Add every built module to the CRM sidebar navigation with proper section grouping.

CONTEXT:
- File: artifacts/crm/src/components/Layout.tsx
- These modules are fully built in the backend but have no nav entry:
  volunteers, outreach, funders, support, cohorts, outcomes, safeguarding, 
  automation, attachments
- The useFeatureFlags hook is at: artifacts/crm/src/hooks/useFeatureFlags.ts
- Extended pages are at: artifacts/crm/src/pages/extended/

NAVIGATION STRUCTURE TO BUILD:
Organise into sections with thin divider lines and small section labels:

[CORE]
- Home                    (always visible)
- Organisations           (module: "organisations")
- Contacts                (module: "contacts")
- Pipeline                (module: "pipeline")

[ENGAGEMENT]
- Outreach & Campaigns    (module: "outreach")   route: /ext/outreach
- Support Tickets         (module: "support")    route: /ext/support

[PEOPLE]
- Volunteers              (module: "volunteers") route: /ext/volunteers
- Funders                 (module: "funders")    route: /ext/funders

[DELIVERY]
- Programmes              (module: "programmes") route: /ext/programmes
- Cohorts                 (module: "cohorts")    route: /ext/cohorts

[COMPLIANCE]
- Outcomes                (module: "outcomes")   route: /ext/outcomes
- Safeguarding            (module: "safeguarding") route: /ext/safeguarding

[TOOLS]
- Automation              (module: "automation") route: /automation-rules
- Attachments             (module: "attachments") route: /ext/attachments
- Reports                 (module: "reports")    route: /reports

[SYSTEM]
- LMS                     (module: "lms") — external link, opens in new tab
- Settings                (always visible)
- Admin Panel             (role: admin or above)
- Super Admin             (role: super_admin only)

IMPORTANT RULES:
1. Each nav item only shows when useFeatureFlags(moduleKey) returns true
2. Section headers are hidden if ALL items in that section are hidden
3. Active page item has highlighted background
4. Hover state on each item
5. Section labels are subtle (small caps, muted colour)

DO NOT change any route paths. DO NOT touch backend files.

VERIFY: Show me the complete updated nav section of Layout.tsx including all sections.
```

### 1C — Connect LMS to CRM

```
TASK: Connect the LMS frontend to the CRM via nav link and dashboard widget.

CONTEXT:
- CRM: artifacts/crm/ (runs at its own domain/port)
- LMS: artifacts/lms/ (completely separate Vite app, different domain/port)
- These stay as separate apps — do NOT merge them

DO THIS:

STEP 1 — Environment variable for LMS URL:
Add to artifacts/crm/.env.example:
  VITE_LMS_URL=http://localhost:5174
  
Add to artifacts/crm/.env (local only):
  VITE_LMS_URL=http://localhost:5174

STEP 2 — LMS nav item (in Layout.tsx, already has LMS entry from 1B):
- Read URL from: import.meta.env.VITE_LMS_URL
- If URL is not set: clicking shows toast "LMS not configured. Contact your administrator."
- If URL is set: opens in new browser tab
- Add ExternalLink icon (from lucide-react) next to the label

STEP 3 — Dashboard widget:
In the main dashboard page (find it in artifacts/crm/src/pages/):
If lms module is enabled (useFeatureFlags('lms') === true):
  Show a card:
  Title: "Learning Management System"
  Icon: GraduationCap (lucide-react)
  Description: "Manage programmes, cohorts, student reports and more"
  Button: "Open LMS →" (links to VITE_LMS_URL, opens new tab)

VERIFY: Show the LMS nav item code and dashboard widget component.
```

---

## PART 2 — DATA IMPORT & EXPORT (Week 1, Days 4–7)

### Why This Is Now Phase 2 (Not Month 2)

Import/export was incorrectly placed in Month 2 in the previous plan. This is wrong.
A client who cannot bring their data from HubSpot, Salesforce, or a spreadsheet on
Day 1 will not sign up. It is a mandatory feature, not a nice-to-have.

Enterprise research finding: Salesforce data migration best practice requires loading in
parent-before-child order (Accounts → Contacts → Opportunities → Activities). Your import
system must know this and handle it automatically.

GDPR/data portability regulation finding: Any client has the legal right to export all
their personal data in a machine-readable standard format (CSV, JSON). Not offering this
is a compliance risk, especially if you serve EU clients.

### 2A — Client Import System

```
TASK: Build a production-grade multi-step import wizard for bringing data from any CRM.

CONTEXT:
- Existing import endpoint: POST /api/import (audit what it currently does first)
- Existing route: /import (check what UI exists, if any)
- Database worker: worker/ handles background jobs
- All imports must be tenant-scoped (every row gets the correct tenant_id)

STEP 1 — AUDIT FIRST (do not build if it already exists):
Read these files before writing any code:
- artifacts/api-server/src/routes/ (find any import-related route files)
- artifacts/crm/src/pages/ (find any import-related page files)
Report what currently exists and what is missing.

STEP 2 — BACKEND (build or enhance what exists):

New/enhanced endpoints at /api/import:

POST /api/import/upload
  - Accepts: multipart/form-data with file (CSV or XLSX, max 50MB)
  - Parses the file, detects headers
  - Returns: { fileId, headers: string[], preview: first5rows[] }
  - Stores file temporarily for the session (use a tmp folder or DB)

POST /api/import/validate
  - Body: { fileId, entityType, fieldMapping: { csvColumn: crmField }[] }
  - entity types: contacts, organizations, deals (opportunities), activities
  - Runs full validation on the entire file:
    - Required fields present?
    - Email format valid?
    - Date format valid?
    - Duplicate detection (check existing records by email/name)
  - Returns: { 
      totalRows, validRows, errorRows, duplicateRows,
      errors: [{ row, field, message }],
      duplicates: [{ row, matchedId, matchType }]
    }

POST /api/import/execute
  - Body: { fileId, entityType, fieldMapping, duplicateAction: 'skip'|'update'|'create' }
  - Enqueues import job in the worker queue
  - Returns: { jobId }

GET /api/import/status/:jobId
  - Returns: { status: 'queued'|'processing'|'complete'|'failed', processed, total, errors }

GET /api/import/history
  - Returns last 20 imports for this tenant: { date, entityType, total, success, errors }

SMART FIELD MAPPING PRESETS:
Create a mapping file at artifacts/api-server/src/lib/importMappings.ts
Include preset mappings for:
- Salesforce exports (their exact column names → our field names)
- HubSpot exports (their exact column names → our field names)
- Pipedrive exports
- Zoho CRM exports
- Generic CSV (email → email, first name → first_name, etc.)

PARENT-BEFORE-CHILD IMPORT ORDER:
When importing mixed entity types, always process in this order:
1. organizations (parent)
2. contacts (child of organizations)
3. deals/opportunities (child of contacts + organizations)
4. activities (child of contacts + deals)

STEP 3 — FRONTEND:

Build a 5-step wizard at /import:

Step 1 — Choose source:
  Large icon cards: "From CSV/Spreadsheet", "From Salesforce", "From HubSpot", 
  "From Pipedrive", "From Zoho", "Other CSV"
  Each shows instructions for how to export from that system
  All lead to Step 2 (all use CSV underneath)

Step 2 — Upload file:
  Large drag-and-drop zone
  Accepted: .csv, .xlsx, .xls
  Max size: 50MB shown clearly
  Progress bar while uploading
  After upload: show first 5 rows in a preview table

Step 3 — Map fields:
  Left column: headers from the CSV
  Right column: dropdown of Hubforte fields for that entity type
  Auto-suggest mappings based on the preset (if Salesforce selected, auto-map known fields)
  Required fields marked with red asterisk
  "Skip this column" option for unmappable columns
  "Save this mapping" checkbox (saves for next time)

Step 4 — Validate:
  Show: X rows ready, Y rows have issues, Z duplicates found
  If errors: list them (row number, field, problem) — first 20 shown, rest downloadable
  Duplicate options: "Skip duplicates", "Update existing records", "Import as new"
  "Fix errors and re-upload" button
  "Import valid rows only (skip errors)" button

Step 5 — Importing:
  Progress bar with live count: "Importing... 450 of 1,000 contacts"
  This polls GET /api/import/status/:jobId every 2 seconds
  On complete: success screen with summary
  Email notification sent when complete
  "View import history" link

VERIFY:
1. The import wizard shows all 5 steps
2. The backend can parse a CSV and return field headers
3. The validation catches missing required fields
4. Show me the Salesforce field mapping preset
```

### 2B — Universal Data Export (Client Data Portability)

```
TASK: Build a complete data export system that lets clients export ALL their data 
in any format, to any system — including AppSheet, generic tools, and systems that 
don't exist yet.

CONTEXT:
Research finding: GDPR and modern data portability standards require that clients can
export ALL their personal data in machine-readable standard formats (CSV, JSON).
The key principle: data portability means data that works in ANY system, not just
popular ones. JSON and CSV are universal. Anything can read them.

The "systems that don't exist yet" problem is solved by: exporting in clean, 
well-documented JSON with a schema file. Any developer in the world can read a 
schema file and import the data into any system.

BACKEND:

New endpoints at /api/export:

POST /api/export/full
  - Starts a background job to export ALL entity data for the tenant
  - Exports: contacts, organizations, activities, notes, tasks, deals, campaigns,
    support tickets, volunteers, funders, and any other non-safeguarding entities
  - Note: safeguarding_notes are excluded from standard export (handled separately by law)
  - Returns: { jobId }
  - Notifies by email when complete (sends download link)

POST /api/export/entity
  - Body: { entityType, format: 'csv'|'json'|'xlsx' }
  - Exports a single entity type
  - For < 5,000 rows: returns file immediately
  - For > 5,000 rows: background job + email

GET /api/export/download/:exportId
  - Streams the export file
  - Link expires after 24 hours (security best practice)

GET /api/export/history
  - Lists past exports for the tenant

EXPORT FORMATS:
1. CSV — works with Excel, Google Sheets, AppSheet, and any CRM
2. JSON — works with any developer tool, API integration, or database import
3. XLSX — for clients who prefer Excel
4. The full export (ZIP) includes a README.md explaining the data structure
   and a schema.json file showing all fields and their types

This README + schema approach is what makes it work with "systems that don't exist yet":
Any developer reads the schema, maps the fields, and imports to anything.

FRONTEND — Export page at /export (or as a tab under /import):

"My Data" section with:

Card 1 — Export Everything:
  Title: "Full Data Export"
  Description: "Download all your data as a ZIP file. Includes all contacts, organisations,
  deals, activities, notes, tasks, and more in CSV and JSON formats."
  Button: "Request Export"
  Shows: Last export date, "Download" button if recent export exists

Card 2 — Export by Module:
  Grid of module cards (same modules as the nav)
  Each card: module name, record count, "Export CSV" button, "Export JSON" button

Card 3 — Moving to Another Platform?
  Quick guides with icons:
  - Moving to Salesforce → CSV instructions
  - Moving to HubSpot → CSV instructions  
  - Moving to AppSheet → JSON instructions
  - Using for any other tool → download schema.json

SAFEGUARDING NOTE:
The standard export explicitly excludes safeguarding_notes. Show a notice:
"Safeguarding records are handled separately under data protection law. Contact your 
Data Protection Officer or system administrator for a compliant export of these records."

DO NOT:
- Do not include safeguarding_notes in any standard export
- Do not let exports cross tenant boundaries
- Do not allow download links to work after 24 hours

VERIFY:
1. POST /api/export/full creates a background job
2. The export ZIP contains contacts.csv, contacts.json, and README.md
3. The README explains the data structure in plain English
4. The export page shows all 3 cards
```

---

## PART 3 — AUTH & LOGIN REDESIGN (Week 2)

### Why This Matters

Your current login is seeded via .env files. There is no way for a new client to sign up
themselves. There is no 2FA. The login page looks like a placeholder.

Enterprise finding: Every top SaaS company (Salesforce, HubSpot, SAP) has self-service
signup, email verification, and MFA. Clients expect these. Absence signals "not enterprise-ready."

### 3A — New Login Page

```
TASK: Redesign the login page to be modern, professional, and trust-building.

CONTEXT:
- File: artifacts/crm/src/pages/LoginPage.tsx
- Backend auth endpoint already exists: POST /api/auth/login
- Do not change the API call logic — only the visual design

DESIGN:

Split-screen layout:
LEFT PANEL (40% width, dark navy background):
  - Hubforte logo (text logo with a subtle icon)
  - Tagline: "The intelligent platform for teams that mean business"
  - Three feature bullets with check icons:
    ✓ All your CRM, LMS, and operations in one place
    ✓ Every module on or off, per client, instantly  
    ✓ AI that works for your team, not the other way around
  - Subtle gradient or pattern background
  
RIGHT PANEL (60% width, white/light background):
  - "Welcome back" heading (large)
  - "Sign in to your workspace" (subtitle, muted)
  - Email field with envelope icon
  - Password field with lock icon + show/hide eye button
  - "Remember me for 30 days" checkbox
  - "Forgot your password?" link (→ /auth/forgot-password)
  - "Sign in" button (full width, primary teal colour, with arrow icon)
  - Divider: "—— or ——"
  - "Need an account? Start your free workspace →" (→ /auth/register)
  
ERROR STATES:
  - Failed login: red alert above form: "Email or password is incorrect. Please try again."
    (Never say which one is wrong — security best practice from Salesforce/AWS)
  - Loading state: button shows spinner + "Signing in..." text, all inputs disabled
  
After successful login: show a brief "Welcome back, [First Name]" toast notification.

DO NOT change the API call, routing, or token logic.

VERIFY: Show me the full updated LoginPage.tsx component.
```

### 3B — Tenant Self-Service Registration

```
TASK: Build tenant self-service signup so new clients can create their workspace 
without you having to manually set up .env credentials.

CONTEXT:
- Backend: artifacts/api-server/src/routes/auth.ts
- Frontend: artifacts/crm/src/pages/
- Database: tenants table and users table exist
- Email sending: check how emails are currently sent in the codebase (look for nodemailer
  or similar in artifacts/api-server/src/lib/) — use the same pattern

BACKEND — Add to auth.ts:

1. POST /api/auth/register
   Rate limit: 5 requests per IP per hour (use express-rate-limit if already installed)
   Body: { workspaceName, firstName, lastName, email, password, agreedToTerms: true }
   
   Validation:
   - workspaceName: required, 2-100 chars
   - email: valid format, not already registered
   - password: min 8 chars, must contain at least 1 number and 1 letter
   - agreedToTerms: must be true
   
   On success:
   - Create new tenant: { name: workspaceName, status: 'pending_verification', plan: 'trial' }
   - Create first user: { role: 'OWNER', tenantId: newTenant.id, status: 'pending_verification' }
   - Copy default module flags from moduleRegistry defaults to tenant_feature_flags
   - Generate verification token (32-byte random hex string)
   - Store: verification_token on the user record (add column if missing)
   - Send verification email: "Verify your email to activate your Hubforte workspace"
     (email contains link: https://[APP_URL]/auth/verify?token=[token])
   - Return: { message: "Check your email to verify your account." }

2. GET /api/auth/verify?token=xxx
   - Find user by verification_token
   - Set user.status = 'active'
   - Set tenant.status = 'active'
   - Clear the verification_token
   - Return redirect: /auth/login?verified=true

3. POST /api/auth/forgot-password
   - Check if this endpoint already exists — do not duplicate it
   - If it exists: just confirm it works
   - If not: create it

FRONTEND:

Create: artifacts/crm/src/pages/RegisterPage.tsx
Route: /auth/register

Form:
  - "Create your workspace" heading
  - "Start free — no credit card needed" subheading
  - Workspace Name field (company name)
  - Your First Name and Last Name (two fields side by side)
  - Work Email
  - Password (with a strength indicator bar: Weak/Fair/Strong/Very Strong)
  - Confirm Password
  - Checkbox: "I agree to the Terms of Service and Privacy Policy"
  - "Create workspace" button
  
Success screen (shown after submit):
  - Checkmark icon
  - "Check your email"
  - "We sent a verification link to [email]"
  - "Didn't get it? Resend" link
  - Link back to login

On LoginPage: add "?verified=true" detection — if present, show:
  "Email verified! You can now sign in." green success banner.

Create: artifacts/crm/src/pages/ForgotPasswordPage.tsx (if not exists)
Route: /auth/forgot-password

VERIFY:
1. Show me the register endpoint
2. Show me the RegisterPage.tsx component
3. Show me where the route is added in App.tsx
```

### 3C — Two-Factor Authentication (2FA/MFA)

```
TASK: Add TOTP-based two-factor authentication (compatible with Google Authenticator, 
Authy, and 1Password).

CONTEXT:
- Use library: otplib (install: pnpm add otplib in api-server)
- TOTP is the same standard used by Google, Salesforce, AWS — it's the gold standard
- Users opt in — it's not forced on everyone immediately

BACKEND — Add to artifacts/api-server/src/routes/auth.ts:

New DB columns needed on users table (create migration):
  totp_secret TEXT NULL
  totp_enabled BOOLEAN DEFAULT FALSE
  totp_pending_secret TEXT NULL  (stores secret before user verifies it)

New DB table: user_backup_codes
  id, user_id, code_hash (bcrypt), used_at, created_at

Endpoints:

POST /api/auth/2fa/setup
  Auth required. Generates TOTP secret.
  Returns: { secret, qrCodeUrl, manualEntryCode }
  (use otplib.authenticator.generateSecret() and otplib.authenticator.keyuri())
  Stores secret in totp_pending_secret (not yet activated)

POST /api/auth/2fa/verify-setup
  Auth required. Body: { token } (6-digit code)
  Verifies token against totp_pending_secret
  If valid:
    - Sets totp_secret = totp_pending_secret
    - Sets totp_enabled = true
    - Clears totp_pending_secret
    - Generates 8 backup codes (random 10-char strings)
    - Stores hashed backup codes in user_backup_codes
    - Returns: { backupCodes: string[] } — shown ONCE, user must save them

POST /api/auth/2fa/disable
  Auth required. Body: { currentPassword, token }
  Requires BOTH password AND totp code to disable (security best practice)
  Sets totp_enabled = false, clears totp_secret

MODIFY POST /api/auth/login:
  After password verification, if user.totp_enabled === true:
    - Do NOT return full JWT yet
    - Generate a short-lived temp token (15-minute expiry, different from main JWT)
    - Return: { requires2FA: true, tempToken: "..." }
  
  New endpoint: POST /api/auth/2fa/complete
    Body: { tempToken, code }
    Verifies TOTP code (or backup code) against the user
    If valid: returns the real JWT cookie (same as normal login)
    If backup code: mark it as used, warn user to generate new ones

FRONTEND:

New page: artifacts/crm/src/pages/TwoFactorPage.tsx
Route: /auth/2fa
Shown automatically after login if requires2FA is true in the response

  Layout:
    - "Two-Factor Authentication" heading
    - "Enter the 6-digit code from your authenticator app"
    - 6-digit input (auto-advances to next field, auto-submits when 6 digits entered)
    - "Verify" button
    - "Use a backup code instead" → shows text input for backup code
    - "Back to login" link

In Settings page (profile/security tab):
  Security section showing:
    - 2FA status: "Enabled" (green badge) / "Disabled" (grey badge)
    - If disabled: "Enable 2FA" button → shows setup wizard:
      Step 1: "Scan this QR code with your authenticator app" (show QR code image)
      Step 2: "Enter the 6-digit code to verify" (input + confirm button)
      Step 3: "Save your backup codes" (list of 8 codes + "Download" + "Copy" buttons)
    - If enabled: "Disable 2FA" button → shows confirmation dialog requiring password + code

VERIFY:
1. The 2FA setup flow (QR code generation)
2. The 2FA verify page
3. The login flow modification (tempToken returned when 2FA is required)
```

---

## PART 4 — UI COMPLETE REDESIGN (Weeks 2–3)

### The Professional Standard Rule

You said: "no one should know this is vibe coded."

This is not about hiding anything. It means: the UI must look, feel, and behave at
the same level of professionalism as Salesforce, HubSpot, or Linear.

Standards every component must meet:
- Consistent spacing (4px grid system)
- Every loading state has a skeleton or spinner
- Every error has a human-readable message
- Every empty state has a helpful message and action button
- Mobile-responsive (at least down to 768px tablet)
- Dark mode works properly across all pages
- No broken layouts, no truncated text, no overlapping elements

### 4A — Design System & Dark Mode

```
TASK: Establish the Hubforte design system with dark mode and consistent tokens.

CONTEXT:
- Frontend: artifacts/crm/
- Using: Tailwind CSS + shadcn/ui (already installed)

DO THIS:

1. Update artifacts/crm/src/index.css with CSS custom properties:

:root {
  /* Brand */
  --brand-primary: #0891b2;      /* Teal */
  --brand-secondary: #0f172a;    /* Deep navy */
  --brand-accent: #f59e0b;       /* Amber */
  --brand-success: #10b981;      /* Green */
  --brand-danger: #ef4444;       /* Red */
  --brand-warning: #f59e0b;      /* Amber */
  
  /* Light mode */
  --bg-base: #ffffff;
  --bg-surface: #f8fafc;
  --bg-elevated: #ffffff;
  --border-default: #e2e8f0;
  --text-primary: #0f172a;
  --text-secondary: #64748b;
  --text-muted: #94a3b8;
}

.dark {
  --bg-base: #0f172a;
  --bg-surface: #1e293b;
  --bg-elevated: #1e293b;
  --border-default: #334155;
  --text-primary: #f1f5f9;
  --text-secondary: #94a3b8;
  --text-muted: #64748b;
}

2. Update tailwind.config.ts to add brand colours and enable darkMode: 'class'

3. Create: artifacts/crm/src/components/ThemeProvider.tsx
   - Reads from localStorage: key 'hubforte-theme', values: 'light'|'dark'|'system'
   - Applies 'dark' class to <html> element
   - Exports: ThemeProvider component + useTheme() hook + ThemeToggle button

4. Update main.tsx to wrap everything in ThemeProvider

5. Add ThemeToggle button to the top bar in Layout.tsx
   (Sun icon for light, Moon icon for dark, Monitor icon for system)

DO NOT change any API calls or routing.

VERIFY: Show the ThemeProvider component and confirm dark mode applies to the root element.
```

### 4B — Sidebar Polish & Command Palette

```
TASK: Polish the sidebar navigation and add a command palette for power users.

CONTEXT: Layout.tsx (already updated in Phase 1)

SIDEBAR IMPROVEMENTS:

1. Collapsible: 
   - Expanded state: 240px wide (icon + label)
   - Collapsed state: 64px wide (icon only + tooltip on hover)
   - Toggle button at bottom of sidebar (chevron left/right)
   - State saved to localStorage: 'hubforte-sidebar-collapsed'

2. Active state: current route has teal background, white text

3. Badges on nav items:
   - Tasks: show count of tasks due today (red badge if overdue)
   - Support: show count of open tickets
   Fetch these from the dashboard stats endpoint

4. User section at the bottom of sidebar:
   - User avatar (initials circle, brand teal background)
   - Full name and role text
   - Clicking opens a small popover:
     - "My Profile" link
     - "Settings" link
     - Dark mode toggle
     - Divider
     - "Sign out" button (red text)

TOP BAR:

Left: Current page title (dynamic based on current route)
Centre: Global search bar 
  - Placeholder: "Search contacts, deals, organisations..."
  - On click: opens command palette (see below)
  - Keyboard shortcut: Cmd+K (Mac) or Ctrl+K (Windows)
Right:
  - Quick-create button (+): dropdown with "New Contact", "New Organisation", 
    "New Deal", "New Task", "New Campaign" (respects which modules are enabled)
  - Notification bell with unread count badge
  - Theme toggle
  - User avatar → opens profile popover

COMMAND PALETTE:
Create: artifacts/crm/src/components/CommandPalette.tsx

A modal overlay triggered by Ctrl+K or clicking the search bar.
  - Shows instantly with a text input focused
  - As you type: filters and shows matching results from:
    1. Navigation pages (all nav items)
    2. Recently visited pages (last 5, stored in localStorage)
    3. Quick actions: "Create Contact", "Create Deal", etc.
  - Keyboard navigation: up/down arrows move selection, Enter navigates
  - Escape closes it
  - Background is semi-transparent black overlay

This is how Linear, Vercel, and Notion handle search — it feels premium.

VERIFY:
1. Collapsible sidebar works and state persists on refresh
2. Command palette opens on Ctrl+K and filters items as you type
3. User popover shows at bottom of sidebar
```

### 4C — Dashboard Redesign

```
TASK: Redesign the main dashboard to be a powerful at-a-glance business overview.

CONTEXT:
- Existing dashboard API: GET /api/dashboard/stats and GET /api/dashboard/activity
- Find the current dashboard component in artifacts/crm/src/pages/
- All sections must check module flags — only show data for enabled modules
- Use recharts for charts (already in the project)

LAYOUT:

ROW 1 — KPI CARDS (4 cards across):
Each card has: icon, label, number, delta from last month (↑12% or ↓3%)
1. Total Contacts (module: contacts)
2. Open Pipeline Value — formatted as currency (module: pipeline)
3. Tasks Due Today — red badge if overdue count > 0 (always visible)
4. Open Support Tickets (module: support) OR Active Campaigns (module: outreach) 
   depending on which is enabled

ROW 2 — TWO COLUMNS:
Left (65%): Activity Feed
  - List of last 10 activities with avatar, description, entity name, time ago
  - Activities have type icons: phone, email, meeting, note, task
  - "View all activities →" link at bottom

Right (35%): Quick Actions Panel
  - "New Contact" button (module: contacts)
  - "New Organisation" button (module: organisations)
  - "New Deal" button (module: pipeline)
  - "New Task" button (always)
  - "Send Campaign" button (module: outreach)

ROW 3 — CHARTS (2 columns):
Left: Pipeline by Stage — horizontal bar chart (module: pipeline)
  Each bar: stage name, deal count, total value
Right: Activity This Week — bar chart, 7 bars for 7 days (always visible)

ROW 4 — LMS CARD (module: lms):
  A full-width teal card:
  "Learning Management System — [X] active cohorts, [Y] students enrolled this week"
  "Open LMS →" button

ROW 5 — SYSTEM STATUS ROW (super_admin only):
  Small cards: API Status ✅, Error Rate: 0.1%, Last deployment: 2 days ago
  "View health dashboard →" link

IMPORTANT: Every section that needs data should show a skeleton loader while loading,
not a blank space. Use shadcn/ui Skeleton component.

VERIFY: Show me the full dashboard component with all rows implemented.
```

---

## PART 5 — MODULE CONTROL CENTRE (Week 3)

### What This Is

A one-click dashboard where you can turn any module on or off for any client.
This is what makes Hubforte a platform, not just an app.

Enterprise research finding: SAP SuccessFactors uses a Role-Based Permissions (RBP) 
framework where admins start with the most generic role (all employees) and add
specific permissions on top. Oracle Fusion CRM assigns job roles to users based on their
function (Sales Manager, Sales Rep, etc.), not generic labels like "Admin" or "Viewer."

```
TASK: Build the Module Control Centre — a super-admin panel for managing all feature 
flags for all tenants from a visual UI.

CONTEXT:
- Existing feature flag endpoints: check /api/super-admin/ and /api/feature-flags/
- Module definitions: lib/db/src/moduleRegistry.ts
- Flags stored: feature_flags (global) and tenant_feature_flags (per-tenant)
- Only SUPER_ADMIN can access this

BACKEND (check what exists, build what's missing):

Required endpoints:
GET /api/super-admin/tenants
  Returns: [{ id, name, status, userCount, enabledModuleCount, createdAt }]

GET /api/super-admin/tenants/:tenantId/modules
  Returns: all modules for this tenant with { key, enabled, isOverride, defaultValue }
  isOverride = true means this tenant has a custom value different from global default

PATCH /api/super-admin/tenants/:tenantId/modules/:moduleKey
  Body: { enabled: boolean }
  Creates or updates a tenant_feature_flags row
  Clears the 1-minute cache for this tenant
  Returns: { key, enabled }

GET /api/super-admin/modules/global
  Returns global defaults from feature_flags table

PATCH /api/super-admin/modules/global/:moduleKey
  Updates global default (affects all tenants without custom override)
  Returns warning: affects X tenants

POST /api/super-admin/tenants/:tenantId/modules/reset
  Resets ALL tenant overrides to global defaults

FRONTEND at /super-admin/modules:

SECTION 1 — Global Module Defaults:
  Organised by category (Core CRM, Delivery, Compliance, etc.)
  Each module: name, description, toggle switch, "required" badge if required
  Warning when changing global: "This affects [X] tenants without individual overrides"
  Required modules: show disabled toggle with tooltip "This module cannot be disabled"

SECTION 2 — Per-Tenant Management:
  Search box: type tenant name to filter
  Tenant list table: name, status, plan, users, enabled modules count
  Click a tenant → expand accordion showing their module grid
  Each module: toggle showing enabled/disabled AND whether it's custom or using default
  "Reset to defaults" button per tenant (with confirmation dialog)
  "Custom" badge when a tenant has an override different from global

SECTION 3 — Quick Overview:
  Summary table: all tenants across the top, all modules down the side
  Green dot = enabled, grey dot = disabled
  Lets you see at a glance which clients have what

TOGGLE UX RULES:
- Optimistic update: toggle switches immediately, API confirms or reverts
- If API fails: toggle reverts + toast error shown
- Disabling a REQUIRED module: show warning dialog with tenant count affected
- Double confirmation for required core modules (contacts, organisations)

VERIFY:
1. Show the per-tenant module toggle working
2. Show global defaults section
3. Confirm cache is cleared after a toggle

Phase 5 Extension — AI Permission Toggles (added 2026-04-24):
The tenant detail panel in the Module Control Centre includes an
AI Permissions section with two owner-controlled toggles:

byokEnabled:
- Default: false for all tenants
- Effect: shows/hides BYOK configuration in tenant Settings page
- On disable: clears stored tenant AI key immediately
- Logged to audit_logs on every change

aiDiagnosisEnabled:
- Default: false for all tenants
- Effect: shows/hides AI Diagnose button on support tickets
- Always uses System AI (Anthropic) regardless of tenant AI config
- Does not count against tenant AI budget
- Logged to audit_logs on every change

DB columns: tenants.byok_enabled, tenants.ai_diagnosis_enabled
Backend: GET /api/super-admin/tenants/:id/ai-settings
Backend: PATCH /api/super-admin/tenants/:id/ai-settings
Frontend: AI Permissions section in super-admin tenant detail panel
Implementation status: initial build completed on 2026-04-27; compile checks passed, but Codex audit rejected the pass pending remediation
Audit findings:
- Disabling BYOK currently writes a blank encrypted_api_key instead of clearing BYOK cleanly end-to-end
- Audit log payload does not capture field-level old/new values or target tenant context as documented
- Frontend Tenant type expects AI flags that the tenant list endpoint does not return
Verification: pnpm --filter @workspace/api-server typecheck
Verification: pnpm --filter @workspace/crm typecheck
Verification: build succeeds
```

---

## PART 6 — ROLE SYSTEM REDESIGN (Week 3)

### Why the Current Roles Are "Outdated"

The current roles (SUPER_ADMIN, ADMIN, MANAGER, OPERATOR, VIEWER) are generic IT roles, 
not real business roles. Nobody in a sales team calls themselves an "Operator."

Enterprise research finding: Oracle Fusion CRM uses job roles that match actual business
functions — Sales Manager, Sales VP, Customer Success Manager, etc. SAP uses Permission 
Roles that are assigned to permission groups. The best-in-class approach is a combination:
system roles (what the person can DO technically) + job titles (what they ARE in the business).

Research finding on sales org hierarchy (2025): The modern sales org is:
CRO → VP Sales → Sales Director → Sales Manager → Account Executive → SDR/BDR

```
TASK: Redesign the role system to match real business functions and modern SaaS patterns.

CONTEXT:
- Current roles in code: SUPER_ADMIN, ADMIN, MANAGER, OPERATOR, VIEWER
- These are stored in users.role column
- Role checks are done in auth middleware and frontend guards
- This is a significant change — do it carefully

NEW ROLE SYSTEM:

SYSTEM ROLES (who they are in the platform):
Keep these in the database as the technical access layer:

1. PLATFORM_OWNER (was: SUPER_ADMIN)
   Access: Everything. All tenants. All system settings. Break glass.
   Only 1 person: you.
   Key change from before: rename for clarity, keep all existing SUPER_ADMIN checks.

2. WORKSPACE_OWNER (new, was roughly: ADMIN for the top user)
   Access: Everything within their tenant. Cannot see other tenants.
   Can: manage all users in their workspace, configure modules, view billing.
   Cannot: see system health, other tenants, global settings.
   
3. WORKSPACE_ADMIN (was: ADMIN)
   Access: Full CRM/LMS feature access.
   Can: manage users (except WORKSPACE_OWNER), configure workspace settings, run imports.
   Cannot: change module flags, see billing.

4. TEAM_MANAGER (was: MANAGER)
   Access: Full CRM features. Can see all team members' records and reports.
   Can: assign records to any team member, run reports on whole team.
   Cannot: manage users, change settings.

5. TEAM_MEMBER (was: OPERATOR — renamed to be human-friendly)
   Access: Full CRM features on own records and assigned records.
   Can: create, edit, delete own records. See shared records.
   Cannot: see other users' private records, run org-wide reports.

6. READ_ONLY (was: VIEWER — same, clearer name)
   Access: View all accessible records, run reports.
   Cannot: create, edit, or delete anything.

7. DEVELOPER (new role — see Phase 11)
   Access: Error logs, health dashboard, API docs, system traces.
   Cannot: See any tenant data (contacts, deals, etc.)
   
OPTIONAL JOB TITLE FIELD:
Add a separate job_title field to users table (VARCHAR 100, nullable).
This is display-only — shown on user profile, in assignments, in email signatures.
Examples: "Sales Manager", "Account Executive", "SDR", "Customer Success Manager"
This is NOT used for permissions — it's just a human label on top of the role.

MIGRATION PLAN:
1. Add job_title column to users table (non-breaking, nullable)
2. Keep existing role values in database BUT add a mapping:
   'SUPER_ADMIN' → displayed as 'Platform Owner'
   'ADMIN' → displayed as 'Workspace Admin'  
   'MANAGER' → displayed as 'Team Manager'
   'OPERATOR' → displayed as 'Team Member'
   'VIEWER' → displayed as 'Read Only'
3. Add new PLATFORM_OWNER and WORKSPACE_OWNER and DEVELOPER values to the role enum
4. Update all role checks: 'SUPER_ADMIN' still works (backward compatible)
   Add: PLATFORM_OWNER maps to same permissions as SUPER_ADMIN

FRONTEND CHANGES:
1. Update all role display names to the new labels
2. In user management: show the friendly name, not the database value
3. Role selector dropdowns: show friendly names with descriptions
4. Role descriptions (shown as tooltip):
   - Platform Owner: "Full system access. Reserved for the Hubforte administrator."
   - Workspace Owner: "Manages this workspace including users and module settings."
   - Workspace Admin: "Full CRM access with user management."
   - Team Manager: "Manages team performance and pipeline visibility."
   - Team Member: "Standard CRM access for day-to-day work."
   - Read Only: "Can view records and reports but cannot make changes."

DO NOT:
- Do not break existing auth middleware checks
- Do not change role names in the database for existing users (just display them differently)
- Do not remove any existing permission checks

VERIFY:
1. Show the migration file for job_title column
2. Show the role enum update
3. Show how the user management UI displays the new friendly names
```

---

## PART 7 — THE NERVOUS SYSTEM (Weeks 3–4)

### Why This Is Critical

You said: "clients should never ever be facing an unresolved issue."

Enterprise research finding from Microsoft Azure's SaaS Well-Architected Framework:
"Acknowledge that incidents are inevitable and prepare for them by defining an incident 
response plan. This proactive approach prevents you from having to devise a response 
strategy during your first incident."

The industry standard severity levels for SaaS incidents:

| Severity | Condition | Response Target | Resolution Target |
|---|---|---|---|
| P1 — Critical | System down or auth broken | 5 minutes | 1 hour |
| P2 — High | Major feature broken for many users | 15 minutes | 4 hours |
| P3 — Medium | Feature degraded, workaround exists | 2 hours | 24 hours |
| P4 — Low | Minor issue, cosmetic | 24 hours | 72 hours |

### 7A — Owner Health Dashboard

```
TASK: Build a real-time System Health Dashboard for you (the PLATFORM_OWNER).

CONTEXT:
- Monitoring data already exists in: request_logs, error_logs, remediation_runs, ai_logs
- The remediationEngine.ts already exists — do not modify it, only call it
- Use WebSockets for real-time updates
- This is only visible to PLATFORM_OWNER (SUPER_ADMIN) role
- Route: /super-admin/health

BACKEND:

STEP 1 — Check if ws (WebSocket library) is in package.json. If not: pnpm add ws @types/ws
          in artifacts/api-server/

STEP 2 — Create: artifacts/api-server/src/routes/health.ts

Endpoints:

GET /api/super-admin/health/summary
Returns:
{
  systemStatus: 'healthy'|'degraded'|'critical',
  statusReason: string,         // e.g. "Error rate 4.2% over last 15 min"
  uptime: number,               // seconds since server start
  requestsLastHour: number,
  errorsLastHour: number,
  errorRate: number,            // percentage
  p95ResponseMs: number,        // 95th percentile response time
  activeSessions: number,       // users currently logged in
  remediationRunsToday: number,
  autoFixedToday: number,
  activeTenantsToday: number,
  dbConnectionsOk: boolean
}

Status logic:
  healthy: errorRate < 1% AND p95ResponseMs < 1000
  degraded: errorRate 1-5% OR p95ResponseMs 1000-3000
  critical: errorRate > 5% OR p95ResponseMs > 3000 OR dbConnectionsOk === false

GET /api/super-admin/health/errors?limit=50&page=1&status=new
Returns errors from error_logs with fields:
  id, message, errorCode, stackTrace, occurrenceCount, firstSeen, lastSeen,
  affectedRoute, affectedModule, affectedTenantId, severity,
  aiExplanation, aiSuggestedFix, status, autoFixed

GET /api/super-admin/health/requests?minutes=60
Returns request volume per minute (for charts)

GET /api/super-admin/health/module-status
Returns per-module: { moduleKey, requestsToday, errorsToday, errorRate, lastErrorAt }

POST /api/super-admin/health/errors/:errorId/explain
  Calls aiProvider.ts with this exact prompt:
  System: "You are a technical support specialist helping a non-programmer understand 
  system errors. Be clear, concise, and use simple language. Never use jargon without 
  explaining it."
  User: "Explain this error in plain English and give step-by-step fix instructions:
  [error message and stack trace]"
  Stores result in error_logs.aiExplanation and error_logs.aiSuggestedFix

POST /api/super-admin/health/errors/:errorId/status
  Body: { status: 'investigating'|'fixed'|'ignored' }

POST /api/super-admin/health/remediation/run
  Triggers the remediationEngine manually
  Returns run results

STEP 3 — WebSocket setup:
In artifacts/api-server/src/index.ts:
  Create WebSocket server
  Every 30 seconds: broadcast health summary to connected SUPER_ADMIN clients
  When new error logged: broadcast { type: 'new_error', data: error }
  Authentication: verify JWT on WebSocket connection (extract from cookie/header)

FRONTEND at /super-admin/health:

ROW 1 — Status Banner:
  Large status indicator: 🟢 ALL SYSTEMS HEALTHY / 🟡 DEGRADED / 🔴 CRITICAL
  System uptime
  "Last checked: 30 seconds ago" (live countdown)
  "Run Auto-Fix Now" button (triggers remediation/run endpoint)

ROW 2 — 6 KPI CARDS (live updating via WebSocket):
  1. Requests/hour — with sparkline chart (last 60 values)
  2. Error Rate % — red background if > 2%
  3. Response Time p95 — red if > 1000ms
  4. Active Sessions
  5. Auto-fixes today — green if > 0
  6. Active tenants today

ROW 3 — CHARTS:
  Left: Request volume last hour (line chart, 60 data points, updates every 30s)
  Right: Error rate last 24 hours (line chart, 24 data points)

ROW 4 — RECENT ERRORS TABLE:
  Columns: Severity | Error Message | Module | First Seen | Count | Status | Actions
  Colour-coded rows: red=critical, orange=warning, blue=info
  Actions per row:
  - "Explain (AI)" → calls explain endpoint → shows result in an expandable panel below the row
  - "Mark Fixed" → changes status to fixed, greyed out
  - "Ignore" → marks as ignored
  Expandable detail: full stack trace + AI explanation + suggested fix steps
  AI explanation shown in a clean, readable card (not a code block)

ROW 5 — MODULE HEALTH GRID:
  Card per module: name, requests today, errors today, status dot
  Clicking a module card filters the errors table to show only that module's errors

VERIFY:
1. The health summary endpoint returns the correct status calculation
2. The AI explain endpoint returns a plain-English explanation
3. The WebSocket broadcasts every 30 seconds
4. The health dashboard page renders all rows
```

### 7B — Incident Response Framework

```
TASK: Build the automated incident detection, alerting, and client communication system.

CONTEXT:
Research finding from enterprise SaaS: "The goal is simple: when someone says 'this is a P1',
everyone understands what that means — how many users are affected, how fast to respond,
who gets paged, and how often to communicate."

BUILD:

STEP 1 — Install node-cron if not already: pnpm add node-cron @types/node-cron

STEP 2 — Create: artifacts/api-server/src/lib/incidentDetector.ts

Runs every 5 minutes. Checks:

P1 — CRITICAL (alert immediately):
  - System error rate > 10% in last 10 minutes
  - Any 500 error on /api/auth/* routes
  - Database connection failure (failed health check)
  - Worker has been unresponsive > 30 minutes
  - Any request returning 503 for > 5 minutes

P2 — HIGH (alert within 15 minutes):
  - Error rate 5-10% for 15+ minutes
  - Avg response time > 3 seconds for 10+ minutes
  - Any module returning errors on > 30% of its requests
  - Auth token failures spiking (> 20 in 5 minutes)

P3 — MEDIUM (alert within 2 hours):
  - Error rate 1-5% for 30+ minutes (trending bad)
  - Response time 1-3 seconds for 20+ minutes
  - More than 5 new unique errors in last hour
  - Worker queue depth growing consistently

P4 — LOW (collect, report in daily digest):
  - Any new unique error type
  - Slow queries (> 500ms)
  - Minor validation errors trending up

Deduplication: Do not send the same P1/P2 alert more than once per 30 minutes.
Store sent alerts in a new table: incidents
  id, severity, condition, message, detectedAt, resolvedAt, acknowledgedAt, 
  notificationsSent (array), tenantIdsAffected (array)

STEP 3 — Create: artifacts/api-server/src/lib/incidentNotifier.ts

Delivery methods:

1. In-app notification (always):
   Write to notifications table for all PLATFORM_OWNER users
   Priority: 'critical' for P1, 'high' for P2, 'normal' for P3
   Message format: "🔴 P1 INCIDENT: [condition]. [X] tenants affected. Action required."

2. Email (for P1 and P2):
   To: SUPER_ADMIN_EMAIL from .env
   Subject: "🔴 P1 — Hubforte: [condition]" or "🟡 P2 — Hubforte: [condition]"
   Body (plain text for reliability):
     Severity: P1 — CRITICAL
     Detected: [timestamp]
     Condition: [description in plain English]
     Affected: [X tenants, Y users]
     Error rate: [X%]
     
     What to do:
     1. Open health dashboard: [link]
     2. Run auto-remediation: [link]  
     3. Check the error knowledge base: [link]
     
     This alert will re-send in 30 minutes if not acknowledged.

3. Slack (optional, if Slack webhook URL is configured in integrations):
   Send a formatted Slack message to your ops channel

STEP 4 — Client-Facing Status Communication:

When a P1 or P2 incident is detected:
Automatically do these things:
a) Update status page (if Instatus/Statuspage API key configured in env)
b) Send an email to ALL affected tenant WORKSPACE_OWNER users:
   Subject: "Hubforte — We are aware of an issue affecting your account"
   Body:
     "We have detected an issue that may be affecting your use of Hubforte.
     Our team has been automatically notified and is investigating.
     
     You can monitor the status at: [STATUS_PAGE_URL]
     
     We will update you as soon as the issue is resolved.
     Reference: INC-[incidentId]
     
     We apologise for any inconvenience."
   
Note: Only send this for P1 and P2. P3 and P4 are internal only.
Add SEND_CLIENT_INCIDENT_EMAILS=true to .env.example — default to false initially.
You can turn it on when you're confident in the incident detection accuracy.

VERIFY:
1. Show incidentDetector.ts with P1/P2/P3/P4 check logic
2. Show incidentNotifier.ts email format
3. Show the incidents table migration
4. Show the client notification email template
```

### 7C — Client-Facing Error Protection

```
TASK: Ensure no raw errors, stack traces, or technical details ever reach a client.

CONTEXT: Every enterprise SaaS company has this. It's the foundation of trust.

BACKEND:

Update the global error handler in artifacts/api-server/src/app.ts:

The consistent error response shape (always this structure, no exceptions):
{
  "error": true,
  "code": "ERROR_CODE",           // Machine-readable
  "message": "Human message",     // Client-safe plain English
  "requestId": "uuid-v4-here"     // For support reference
}

ERROR CODE MAP:
400 VALIDATION_ERROR → "Please check your input and try again."
401 UNAUTHORISED → "Please sign in to continue."
403 FORBIDDEN → "You don't have permission to perform this action."
404 NOT_FOUND → "The item you requested could not be found."
409 CONFLICT → "A conflict occurred. Please refresh and try again."
422 UNPROCESSABLE → "The data provided cannot be processed. Please check your input."
429 RATE_LIMITED → "Too many requests. Please wait a moment before trying again."
500 SYSTEM_ERROR → "Something went wrong on our end. Our team has been notified. Reference: [requestId]"
503 UNAVAILABLE → "This service is temporarily unavailable. Please try again in a moment."

For 500 errors ONLY:
  1. Generate UUID as requestId
  2. Log the FULL error (message + stack + request details) to error_logs table with requestId
  3. Return ONLY the requestId to the client — never the stack trace
  4. The incident detector will pick this up within 5 minutes

Also add: module circuit breaker
  If a module has 10+ 500-errors in last 5 minutes:
    Return: { "code": "MODULE_DEGRADED", "message": "This feature is temporarily unavailable. 
    Our team has been notified and is investigating." }
    
FRONTEND:

Create: artifacts/crm/src/components/ErrorBoundary.tsx
  React error boundary that catches any uncaught rendering errors.
  Shows: friendly page with "Something went wrong" message, Refresh button, Go to Dashboard button.
  Never shows stack trace to users.
  Logs the error to /api/log-client-error (already exists).
  Wrap entire App in this boundary in main.tsx.

Update the API client hooks in lib/api-client-react/:
  Standard error handling for all responses:
  - 401 → redirect to /auth/login
  - 403 → show toast: "You don't have permission to do that"
  - 404 → show toast: "Not found"
  - 429 → show toast: "Slow down — too many requests. Please wait a moment."
  - 500 → show toast: "Something went wrong. Support reference: [requestId]" 
          with a tiny "Copy reference" button

Empty states: for every list/table page that shows no data,
  add a friendly empty state component:
  - Icon relevant to the page
  - "No [items] yet" message
  - "Add your first [item]" button
  Example: contacts page with no contacts → person icon + "No contacts yet" + "Add contact" button

VERIFY:
1. Show the updated error handler in app.ts
2. Show the ErrorBoundary component
3. Confirm the 500 response never includes a stack trace in production
```

---

## PART 8 — REPORTS & ANALYTICS (Month 2)

### What Salesforce Gets Right About Reports

Salesforce's reports are self-service — any sales rep can build a report without IT help.
They have pre-built templates, saved reports, dashboards, and scheduled email delivery.
That's the standard we're matching.

```
TASK: Build the complete Reports & Analytics module with pre-built sales reports,
a visual report builder, and scheduled email delivery.

[Full prompt from previous v1.0 plan still valid here — use the Phase 7 prompt 
from `framework/HUBFORTE_MASTER_PLAN.md`]

ADDITIONS to the v1.0 prompt:

Pre-built reports to add (from research):
- Lead Velocity Report: time from lead created to won/lost
- Win Rate by Source: where your best leads come from
- Rep Leaderboard: ranked by deals won this month
- Contacts Without Activity: at-risk relationships (no touch in 30/60/90 days)
- Campaign ROI: deals attributed to each campaign

Report Builder additions:
- Date presets: "This week", "Last 30 days", "This quarter", "This year", "All time"
- Group by: group results by a field (e.g., group contacts by organisation)
- Chart type selector: table, bar, line, pie, number

Scheduled reports:
- Set a report to run daily/weekly/monthly
- Email the result (as CSV attachment) to selected users
- Store in report_schedules table

VERIFY: All pre-built report cards render, report builder Step 1-4 works, CSV export works.
```

---

## PART 9 — INTEGRATION FRAMEWORK (Month 2)

### The Integration Philosophy

Hubforte should be the hub of a client's tech stack. Every tool they use should connect to it.
Think of how Zapier works: you set up a connection once, and everything flows automatically.
That's the experience we're building — but native, not requiring a third-party service.

[Use the Phase 8 prompts from v1.0 in `framework/HUBFORTE_MASTER_PLAN.md` — 
8A Universal Import/Export (now Part 2) and 8B Webhook & Integration Framework — 
both remain valid]

### Status Page (New — was missing in v1.0)

```
TASK: Set up a public status page so clients always know the system health.

CONTEXT:
This is how AWS, Salesforce, Stripe, and every trusted SaaS company builds trust.
Clients check the status page before raising a support ticket.
Use Instatus (instatus.com) — has a free tier, takes 10 minutes to set up.
This is NOT something to build from scratch — use a managed service.

DO THIS (manual setup, not code):

1. Sign up at https://instatus.com (free tier)
2. Create a new status page named "Hubforte Status"
3. Add these components:
   - API Service
   - CRM Application
   - LMS Application  
   - Authentication Service
   - Database
4. Set the custom domain to: status.[yourdomain].com
5. Enable email/SMS subscription for clients
6. Get the Instatus API key

THEN (code changes):
1. Add to .env.example: INSTATUS_API_KEY= and INSTATUS_PAGE_ID=

2. Create: artifacts/api-server/src/lib/statusPage.ts
   Functions:
   - updateComponentStatus(componentName, status: 'operational'|'degraded'|'outage')
   - createIncident(title, body, affectedComponents)
   - resolveIncident(incidentId, resolutionNote)

3. Call from incidentNotifier.ts:
   When P1 detected: createIncident("Service disruption", description, ['API Service'])
   When incident resolved: resolveIncident(id, "The issue has been identified and resolved.")

4. Add "System Status" link to the login page footer: "Check system status →"
   This links to your Instatus page URL.

VERIFY: Show the statusPage.ts utility file. Confirm the INSTATUS env vars are in .env.example.
```

---

## PART 10 — AI LAYER (Month 2–3)

### AI Configuration for Owner vs Clients

BYOK (Bring Your Own Key):
BYOK is owner-controlled and disabled by default for all tenants.
The PLATFORM_OWNER enables it per tenant via the Module Control Centre
when a client specifically requests it. Clients cannot self-enable it.
When enabled, the tenant's key applies to their client AI features only
— never to system or technical AI features.

You specified this clearly:
- For you (system/monitoring/error-fixing AI): Anthropic (Claude) first, OpenAI second, optional others
- For clients (features like email compose, lead scoring): OpenRouter first (DeepSeek V3), then others
- BYOK: clients can bring their own key

This is implemented via two separate AI configurations:

```
TASK: Implement the dual AI configuration — system AI for the owner, 
client AI via OpenRouter for tenants, and BYOK support.

CONTEXT:
- Existing: artifacts/api-server/src/lib/aiProvider.ts
- This already has OpenAI, Anthropic, OpenRouter support
- Need to split: system AI (owner tools) vs tenant AI (client features)

STEP 1 — Update .env.example:
# Owner/System AI (for health dashboard, error explanations, remediation)
SYSTEM_AI_PROVIDER=anthropic          # anthropic | openai
ANTHROPIC_API_KEY=                    # Your Anthropic key (Claude)
OPENAI_API_KEY=                       # Your OpenAI key (backup)

# Default Client AI (used when tenant has no custom key)
DEFAULT_CLIENT_AI_PROVIDER=openrouter
OPENROUTER_API_KEY=                   # Your OpenRouter key
DEFAULT_CLIENT_AI_MODEL=deepseek/deepseek-chat   # DeepSeek V3

STEP 2 — Update aiProvider.ts:
Add a new function: getAIProvider(context: 'system' | 'client', tenantId?: string)
  If context === 'system': use SYSTEM_AI_PROVIDER (Anthropic or OpenAI)
  If context === 'client':
    Check tenant_ai_config for this tenantId
    If tenant has custom config: use their key
    Otherwise: use DEFAULT_CLIENT_AI (OpenRouter + DeepSeek V3)

[Continue with the full Phase 9 AI features from v1.0 in `framework/HUBFORTE_MASTER_PLAN.md`:
BYOK, Email Composer, Lead Score, Next Best Action, Navigation Helper, AI Settings page]

NOTE: AI ticket diagnosis is a SYSTEM feature, not a client feature.
Default: disabled for all tenants.
Enablement: PLATFORM_OWNER only, per tenant, on explicit request.
AI provider: always System AI (Anthropic), never tenant client AI.
Budget: does not count against any tenant's AI budget.

ADDITIONAL AI FEATURE — Daily Owner Briefing:
Every morning at 8am (use node-cron), send the PLATFORM_OWNER an email:
Subject: "Hubforte Daily Brief — [Date]"
Content (generated by System AI = Claude):
  - System health status yesterday
  - New tenants/users who signed up
  - Top errors that occurred (and were they fixed)
  - Deals won across all tenants yesterday (if visible to super_admin)
  - Any remediation policies that fired
  - Action items for today
This is YOUR AI assistant keeping you informed without you logging in.

VERIFY:
1. System AI uses Anthropic by default
2. Client AI uses OpenRouter DeepSeek by default
3. BYOK system correctly overrides for a tenant with custom config
4. Daily briefing email structure
```

---

## PART 11 — STANDALONE APP FRAMEWORK (Month 2–3)

### The Plugin Pattern

You said you want to build standalone web apps (voice agents, attachment monitoring, etc.)
and attach them to Hubforte "with ease." 

The framework for this is a standard API contract: every standalone app plugs into Hubforte
using the same three things:
1. Shared authentication (same JWT, same session)
2. Webhook events (Hubforte pushes events to the app; the app pushes data back)
3. Standard API endpoints (the app calls Hubforte's API to read/write CRM data)

```
TASK: Build the Standalone App Framework — the standard pattern for connecting 
any external app to Hubforte.

CONTEXT:
This enables: voice agents, attachment monitoring, quote builders, e-signature tools,
or any future app to connect to Hubforte without rebuilding auth or data sync from scratch.

BUILD:

STEP 1 — App Registry:
New DB table: registered_apps
  id, tenantId, appName, appSlug, appUrl, webhookUrl, 
  apiKey (for app-to-Hubforte calls), webhookSecret, scopes (array), 
  status: 'active'|'inactive', createdAt

New endpoints under /api/apps:
  GET /api/apps — list registered apps for this tenant
  POST /api/apps — register a new app
    Body: { appName, appUrl, webhookUrl, scopes: ['contacts.read', 'activities.write', ...] }
    Returns: { apiKey, webhookSecret } — shown once, like a password
  DELETE /api/apps/:id — remove an app

Scopes (what external apps can do):
  contacts.read, contacts.write
  organizations.read, organizations.write
  activities.read, activities.write
  deals.read, deals.write
  notes.read, notes.write
  lms.read (for voice agents that look up student info)
  
STEP 2 — App Authentication:
External apps authenticate to Hubforte's API using:
  Header: X-Hubforte-App-Key: [apiKey]
  This is a separate auth path from JWT — for machine-to-machine communication
  
Create middleware: authenticateApp()
  Checks X-Hubforte-App-Key header
  Finds the registered_apps row
  Applies scope restrictions to what the request can access

STEP 3 — Standard App API endpoints:
Under /api/v1/ (versioned for external app consumption):
  These are the same data as the main API but with app-scoped auth:
  GET /api/v1/contacts?search=&limit=20
  GET /api/v1/contacts/:id
  POST /api/v1/activities (for voice agents logging calls)
  GET /api/v1/organizations/:id
  POST /api/v1/notes (for attaching call transcripts)
  GET /api/v1/deals (for voice agents to see deal context)

STEP 4 — Developer Documentation:
Create: docs/APP_INTEGRATION_GUIDE.md

This document explains to any developer (including future you) how to:
1. Register their app in Hubforte
2. Authenticate using the API key
3. Use the standard endpoints
4. Set up webhooks to receive events
5. Example code for: voice agent, attachment tracker

Include a quick-start example:
  # Connect a voice agent to Hubforte
  1. Register your app in Hubforte → get apiKey
  2. When a call starts: GET /api/v1/contacts?search=[phone_number]
  3. When call ends: POST /api/v1/activities { type: 'call', duration: 120, notes: transcript }
  4. That's it — the call is logged in CRM automatically

STEP 5 — Integrations UI (in main CRM):
Add a page at /admin/apps showing:
  Title: "Connected Apps"
  Description: "Connect Hubforte to custom tools and standalone applications"
  
  Your apps: list of registered apps with status, last used, scopes, delete button
  "Register New App" button → form for name, URL, scopes
  "Developer Guide" link → docs/APP_INTEGRATION_GUIDE.md
  
  Pre-made app templates (informational, not actual integration):
  - Voice Agent Template (link to docs)
  - Attachment Monitor Template (link to docs)
  - Custom Analytics App Template (link to docs)

VERIFY:
1. POST /api/apps creates an app with apiKey and webhookSecret
2. GET /api/v1/contacts works with X-Hubforte-App-Key header
3. Show APP_INTEGRATION_GUIDE.md with the voice agent quick-start
```

---

## PART 12 — TEAM ACCESS & DEVELOPER PORTAL (Month 3)

### The "Vibe Coder Access" Role

You said: "if I need vibe coder type access, I need to provide that as well."

Vibe coder access = ability to use AI agents to make changes with context about the system.
This is a role called PLATFORM_BUILDER. It means:
- Can read system context (architecture docs, error logs, module registry)
- Can understand what AI agents have access to
- Can run agent-assisted changes
- Cannot see actual client data

Regular DEVELOPER = can see errors and system traces, but cannot run changes.

```
TASK: Build team access management with developer portal and error knowledge base.

CONTEXT: [Use the full Phase 11 prompt from v1.0 in `framework/HUBFORTE_MASTER_PLAN.md` — it remains valid]

ADDITIONS:

PLATFORM_BUILDER role (new):
  Access: DEVELOPER access PLUS:
  - Can read framework/ and docs/ documentation via the admin UI
  - Can see agent context (HUBFORTE_AGENT_CONTEXT.md content via UI)
  - Can trigger test deployments (not production — reads current git state)
  - Cannot see client data
  
  This role is for someone you give agent-assisted development access to.
  They get: the error, the AI explanation, the codebase context, the agent bible —
  everything they need to use Claude/Codex to fix the problem.

"Share with Developer" flow:
  When you find an error in the knowledge base:
  1. Click "Share with Developer"
  2. System generates a shareable link (viewable with DEVELOPER or PLATFORM_BUILDER role)
  3. The linked page shows: error, AI explanation, fix steps, relevant code files (names only)
  4. Send the link to your developer — they log in with their role and see exactly what to fix
  5. When they mark it fixed: you get notified

VERIFY: [Same as the v1.0 Phase 11 verify steps in `framework/HUBFORTE_MASTER_PLAN.md`]
```

---

## PART 13 — DEPLOYMENT (Month 3)

[Use the full Phase 10 prompt from v1.0 in `framework/HUBFORTE_MASTER_PLAN.md` —
all Docker, GitHub Actions, OCI setup. Add this section:]

### Cloud-Agnostic Guarantee

Every environment variable must be injectable via environment (not hardcoded).
Every service must work by just changing one environment variable for each cloud provider.
Test quarterly: can this be deployed to Railway in under 30 minutes?

---

## PART 14 — VOICE & FUTURE FEATURES (Month 4+)

### Voice Agent Integration (using Standalone App Framework from Part 11)

Once Part 11 is built, adding a voice agent is a 3-step process:
1. Build voice agent using Vapi.ai (easiest) or Twilio + OpenAI Realtime API
2. Register it as a Hubforte app via POST /api/apps
3. Use /api/v1/ endpoints to log calls and look up contacts

The voice agent becomes another plug-in — not embedded in the core.

### Attach.io-Style Attachment Monitoring

Once attachments module is complete:
- Add view tracking: when a shared document link is opened, log who, when, how long
- Show in the CRM: "John Smith opened your proposal at 2:34pm, spent 4 minutes on page 3"
- This is built on the existing attachments module + a standalone tracking micro-service

### Quote & Proposal Builder

- Uses Puppeteer (already in the project)
- Templates stored in the DB
- One click: populate with contact/deal data → generate PDF → send via email
- Track opens via attachment monitoring

---

## SUMMARY: Day-by-Day Action Plan

### Day 1 (TODAY)
- [ ] Rotate all credentials (Neon, Gmail, JWT)
- [ ] Fix .gitignore and push to GitHub  
- [ ] Set up emergency access script (Phase 0C)

### Day 2
- [ ] Phase 1A: Fix module key mismatch (15 minutes)
- [ ] Verify Organisations and Contacts appear in nav

### Day 3–4
- [ ] Phase 1B: Add all modules to nav with sections
- [ ] Phase 1C: Connect LMS

### Day 5–6
- [ ] Phase 2A: Client import wizard
- [ ] Phase 2B: Data export with README + schema

### Day 7
- [ ] Verify entire Phase 1 and 2 work end-to-end

### Week 2
- [ ] Phase 3A: Login redesign
- [ ] Phase 3B: Tenant self-service registration
- [ ] Phase 3C: 2FA

### Week 3
- [ ] Phase 4A–4C: UI design system, sidebar, dashboard
- [ ] Phase 5: Module Control Centre
- [ ] Phase 6: Role system redesign

### Week 4
- [ ] Phase 7A–7C: Nervous system (health dashboard, incident detection, error protection)

### Month 2
- [ ] Phase 8: Reports
- [ ] Phase 9: Integration framework + status page
- [ ] Phase 10: AI layer

### Month 3
- [ ] Phase 11: Standalone app framework
- [ ] Phase 12: Team access + developer portal
- [ ] Phase 13: Deployment

---

*Document version 2.0 — Updated with enterprise research from AWS, Salesforce, SAP, Oracle.*
*All gaps from v1.0 audit have been addressed.*
*Add amendments at the bottom. Never edit phase numbers in place.*
