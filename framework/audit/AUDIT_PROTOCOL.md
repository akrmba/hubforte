# Hubforte — AUDIT PROTOCOL
### Strict Rules for All Agents Performing Any Audit
**Version:** 1.0 | **Location:** framework/audit/AUDIT_PROTOCOL.md
**MANDATORY READ — Do not begin any audit without reading this document completely.**

---

## WHY THIS PROTOCOL EXISTS

Previous audits had agents:
- Marking things as PASS based on memory or assumption rather than opening the file
- Checking schema files but not migration files (or vice versa)
- Missing that frontend and backend module keys were mismatched
- Reporting "likely present" instead of "confirmed at file X line Y"
- One agent missing what another caught — creating false confidence

This protocol eliminates all of those. Every check must be proven. Not assumed.

---

## THE SINGLE MOST IMPORTANT RULE

**If you did not physically open the file and read the specific line, you cannot say PASS.**

The only acceptable answers are:
- `CONFIRMED — [file path]:[line number] — [exact text found]`
- `MISSING — [file was opened, searched for X, not found]`
- `PARTIAL — [what was found vs what was expected]`
- `ERROR — [file does not exist]`

"Assumed to be present", "likely exists", "should be there", "previous audit confirmed" are all INVALID. They will be treated as MISSING.

---

## PROTOCOL RULES — ALL MANDATORY

### RULE 1 — Always Open the File
Before writing any result, you must open the actual file using your file-reading tools. You must quote at least one specific line from the file as evidence. If you cannot open a file, mark it ERROR and explain why.

### RULE 2 — DB Schema AND Migration Must Both Be Checked
For every database table or column check:
- Step 1: Open the Drizzle schema file in `lib/db/src/schema/`
- Step 2: Open the matching migration file in `lib/db/migrations/`
- Step 3: Confirm BOTH exist and BOTH match
- If schema file exists but migration is missing → PARTIAL, not PASS
- If migration exists but schema file is stale → PARTIAL, not PASS
This was the gap in previous audits. Both must be confirmed.

### RULE 3 — Module Keys Must Be Cross-Checked In One Step
For any module key check:
- Step 1: Find the frontend Nav entry in Layout.tsx — record the exact module key string
- Step 2: Find the backend checkModuleEnabled() call — record the exact key string
- Step 3: Confirm they are byte-for-byte identical
- If you only checked one side → PARTIAL, not PASS

### RULE 4 — Run Commands, Report Actual Output
When a check requires running a command (typecheck, build, audit):
- Run it
- Report the actual exit code
- Report the actual output (errors, warnings, counts)
- Do not say "build should pass" — run it and report what happens

### RULE 5 — Never Skip a Section
The audit template has numbered sections. Complete every section in order. If you run out of context before finishing, stop at the last complete section and clearly mark "STOPPED AT SECTION X — CONTEXT LIMIT". Do not jump ahead or skip sections.

### RULE 6 — Findings Must Include File Path and Line Number
Every finding — PASS or FAIL — must include:
- File path relative to project root
- Specific line number(s)
- The exact text that confirmed or failed the check
Example of correct format:
  `CONFIRMED — artifacts/api-server/src/routes/auth.ts:89 — "checkRateLimit('auth', ip)"`
Example of incorrect format:
  `PASS — rate limiting is applied to login`

### RULE 7 — Two External Benchmarks to Reference
When checking features for completeness, use these two external references:

**Benchmark 1 — Salesforce CRM features:**
If a feature exists in Salesforce that Hubforte plans to have, and you cannot find it in the codebase, mark it MISSING with the note "Salesforce has this feature built-in."
The Salesforce features that matter most: contact management, pipeline stages, activity logging, email campaigns, reports/dashboards, automation rules, mobile access, API/integrations, lead scoring, forecasting.

**Benchmark 2 — Hubforte (first client) requirements:**
Hubforte is a social impact organisation that uses Hubforte primarily for:
- Managing young people (students) through educational programmes
- Cohort and session management (who attends which session)
- Volunteer coordination (matching volunteers to schools)
- Safeguarding records (MANDATORY for any education organisation in the UK)
- Outcome tracking (measuring the impact of their programmes)
- Parent/guardian consent management (legally required for under-18s)
- Coach narratives and student surveys (LMS core feature)
- PDF report generation (presented to funders and commissioners)
- Funder relationship management (grants and funding pipeline)

If any of these Hubforte requirements are missing or broken, mark as CRITICAL regardless of severity.

### RULE 8 — Document the Stale Items
The agent context docs (HUBFORTE_AGENT_CONTEXT_v2.md) still contains some stale text. If you find text in the docs that says "(to be built)", "planned", or "MISSING" for something that actually IS built, note it in Section 18 of the audit template as a documentation gap.

### RULE 9 — Write Findings As You Go
Do not write a summary at the end. Fill in each section of AUDIT_TEMPLATE.md as you complete it. This prevents context loss if you hit the context window limit.

### RULE 10 — For the Verifying Agent (Codex)
When Codex verifies Claude's work:
- Do not just confirm Claude's answers. Re-open the same files independently.
- If Claude says CONFIRMED at line 89, open the file yourself and check line 89.
- Where Claude says PASS, you must agree or disagree with evidence.
- Add your findings as a second column in the results — do not overwrite Claude's findings.
- Where you disagree with Claude, mark as DISPUTED and explain what you found.

---

## WHAT TO DO ABOUT GAPS FOUND

The audit template has a FINDINGS SUMMARY section at the end. Fill it in with:

CRITICAL — things that must be fixed before any client uses the system
HIGH — things that must be fixed before go-live
MEDIUM — things to fix within 30 days
LOW — things to fix eventually
ACCEPTED RISK — things that cannot be fixed now (explain why)
NOT BUILT YET — features planned but not implemented (these are not bugs, they are next phases)

---

## ANTI-PATTERNS TO AVOID

These are the specific mistakes from previous audits. Do not repeat them:

1. "The module control centre has toggles" → WRONG. Show me the file path and line where the toggle component is defined.
2. "Rate limiting is applied" → WRONG. Show me the exact function call and file.
3. "DB schema looks correct" → WRONG. Open the file and quote the column definition.
4. "Migration was verified in previous audit" → WRONG. Open the migration file yourself.
5. "The LMS is connected" → WRONG. Show me VITE_LMS_URL in the .env.example AND the nav item code.
6. "Safeguarding is protected" → WRONG. Show me the 403 guard in the reports route AND the export route AND confirm safeguarding_notes is not in the entityTables map.

Every one of these was either missed or assumed in a previous audit. They must all be explicitly confirmed in this one.
