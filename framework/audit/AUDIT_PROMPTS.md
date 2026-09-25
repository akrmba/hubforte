# Hubforte — AUDIT PROMPTS
### Two prompts — one for Claude, one for Codex
**Location:** framework/audit/AUDIT_PROMPTS.md
**Usage:** Copy one prompt at a time. Paste into VS Code. Do not modify the prompt.

---

## PROMPT 1 — FOR CLAUDE (Does the audit, fills Column A)

Copy everything between the lines and paste into VS Code Claude:

---START CLAUDE PROMPT---

TASK: Perform a comprehensive inch-by-inch audit of the Hubforte project.
You will fill in Column A of the audit template file.

MANDATORY FIRST STEPS — Do these before anything else:
1. Read `framework/audit/AUDIT_PROTOCOL.md` completely
2. Read `framework/HUBFORTE_AGENT_CONTEXT_v2.md` completely
3. Read `framework/HUBFORTE_MASTER_PLAN_v2.md` sections 1-5

Then open `framework/audit/AUDIT_TEMPLATE.md` and fill in every
"Claude (Column A): ___" field in order from Section 1 to Section 17.

STRICT RULES FROM THE PROTOCOL (non-negotiable):
- Every answer must include the file path and line number as evidence
- You must physically open each file — do not answer from memory
- For every DB check: open BOTH the schema file AND the migration file
- For every module key check: open BOTH Layout.tsx AND routes/index.ts
- Run all build commands and paste the actual output
- Never write "assumed", "likely", or "should be" — only CONFIRMED or MISSING
- If you hit your context limit before finishing: stop at the last complete section
  and write "STOPPED AT SECTION [X] — CONTEXT LIMIT" — do not skip ahead

EXTERNAL BENCHMARKS TO USE:
When you cannot find a feature in the code:
- Check if Salesforce has this feature (it is our competitor benchmark)
- Check if Hubforte would need this feature (they are our first client —
  an education/social impact org that needs: safeguarding, LMS, cohorts,
  outcome tracking, consent management, volunteer management, funders,
  PDF reports, student surveys)
If a Hubforte requirement is missing, mark it CRITICAL regardless of
how minor it seems.

WRITE YOUR FINDINGS DIRECTLY INTO:
`framework/audit/AUDIT_TEMPLATE.md`

Fill in Column A fields as you go. Do not wait until the end.
Save the file after each section.

When you are done, write a summary in Section 17 (Findings Summary)
including your final verdict: DEPLOYMENT READY / DEPLOY WITH CAUTION / NOT READY

---END CLAUDE PROMPT---

---

## PROMPT 2 — FOR CODEX (Verifies Claude's work, fills Column B)

Copy everything between the lines and paste into Codex:

---START CODEX PROMPT---

TASK: Independently verify a comprehensive audit of the Hubforte project.
Claude has already filled in Column A of the audit template.
Your job is to fill in Column B with your own independent findings.

MANDATORY FIRST STEPS — Do these before anything else:
1. Read `framework/audit/AUDIT_PROTOCOL.md` completely
2. Open `framework/audit/AUDIT_TEMPLATE.md` — read all of Claude's Column A findings
3. Read `framework/HUBFORTE_AGENT_CONTEXT_v2.md` sections 1, 7, 10, 16

YOUR ROLE — INDEPENDENT VERIFIER:
- Do NOT simply agree with Claude's findings
- For every check where Claude wrote CONFIRMED at line X: open that file yourself
  and verify the line number and text are correct
- Where you agree: write CONFIRMED — [your own evidence at file:line]
- Where you disagree: write DISPUTED — [what you found vs what Claude reported]
- Where Claude wrote MISSING: verify it is actually missing (search the codebase)
- Where Claude wrote PARTIAL: confirm whether it is partial or actually complete

EXTRA CHECKS THAT PREVIOUS AUDITS MISSED:
These specific items were missed in earlier audits. Check them explicitly:
1. DB schema files AND migration files (open both separately for every DB check)
2. Module key cross-check: frontend Layout.tsx key vs backend routes/index.ts key
   (previous audits checked one side but not always both in the same check)
3. Import/export running in worker queue vs API process (check where jobs are enqueued)
4. SendGrid and Slack: are they real working connectors or just UI cards?
5. `registered_apps` table: does the schema file exist AND the migration file?

AFTER FILLING COLUMN B:
Add your own verdict to Section 17:
- If you agree with Claude: write "Codex agrees: [VERDICT]"
- If you disagree: write "Codex verdict: [VERDICT] — differs from Claude because [reason]"
- List any items Claude marked PASS that you found to be actually FAIL or PARTIAL

WRITE YOUR FINDINGS DIRECTLY INTO:
`framework/audit/AUDIT_TEMPLATE.md`

Fill in Column B fields. Do not overwrite Column A.
Save after each section.

---END CODEX PROMPT---

---

## WHAT TO DO AFTER BOTH PROMPTS ARE DONE

1. Both agents have filled in `framework/audit/AUDIT_TEMPLATE.md`
2. Upload that file to the conversation with the owner
3. The owner pastes this message:
   "Here is the completed audit. Please analyse it and give me the fix plan."
4. The owner's AI (Claude in the main conversation) reads both columns,
   identifies where agents agreed and disagreed, and produces:
   - A consolidated fix list (CRITICAL → HIGH → MEDIUM → LOW)
   - Ready-to-run fix prompts for each issue
   - A verdict on deployment readiness

---

## FOLDER STRUCTURE FOR THIS AUDIT SYSTEM

Put these files in your project at:
```
framework/
└── audit/
    ├── AUDIT_PROTOCOL.md      ← Rules agents must follow (read first)
    ├── AUDIT_TEMPLATE.md      ← Agents fill this in (upload when done)
    └── AUDIT_PROMPTS.md       ← This file — copy-paste prompts
```

The agents do not need any other files. The protocol and template contain
all the instructions they need. Just point them at this folder.

---

## HOW OFTEN TO RUN THIS AUDIT

Run the full audit:
- Before any major deployment
- After completing 2 or more phases of new features
- Whenever something unexpected breaks in production
- Before bringing on a new major client

Run a partial audit (Sections 1-3 only):
- After any security-related fix
- After any database schema change
- After any new module is added

---

## TIPS FOR GETTING THE BEST RESULTS

1. Run Claude first, then Codex. Do not run them at the same time.
2. Give Claude plenty of context window — this is a large audit.
   If Claude's session runs out partway through, start a new session
   and paste the same prompt with: "Continue from Section X where the
   previous session stopped."
3. After Codex verifies, look at any DISPUTED items first.
   These are where the two agents disagree — they need your attention.
4. The findings in Section 17 are the most important part to upload.
   If the full file is too large, you can upload just Sections 14-17.
