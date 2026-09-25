# Hubforte — Agent Governance
**Last updated:** 2026-05-02
**Status:** Active — all AI agents must read this before making any changes

---

## The Core Rule

AI agents are assistants, not operators. They can diagnose, propose, and prepare fixes.
They cannot deploy to production, modify production data, or bypass the approval pipeline.

---

## What AI Agents Are Allowed To Do

| Action | Allowed |
|--------|---------|
| Read source code files | ✅ |
| Read error logs (no PII) | ✅ |
| Read sanitized incident summaries | ✅ |
| Create a git branch | ✅ |
| Edit source code files | ✅ |
| Create SQL migration files | ✅ |
| Push to a `fix/*` or `feature/*` branch | ✅ |
| Run typechecks locally | ✅ |
| Propose a fix in plain English | ✅ |

## What AI Agents Must Never Do

| Action | Forbidden | Why |
|--------|-----------|-----|
| Push directly to `main` | ❌ | Bypasses approval gate |
| SSH into any server | ❌ | Direct production access |
| Run migrations directly on production DB | ❌ | Must go through pipeline |
| Access production database credentials | ❌ | Security boundary |
| Read customer data records | ❌ | Privacy boundary |
| Approve their own pull request | ❌ | Conflict of interest |
| Modify `remediationEngine.ts` | ❌ | Unless explicitly instructed |
| Disable monitoring or alerting | ❌ | Safety boundary |
| Bypass GitHub review or deployment gates | ❌ | Governance boundary |

---

## The Fix Workflow

Every AI-assisted fix must follow this path:

```
1. AI reads sanitized incident package (no customer data)
2. AI creates a git branch: fix/ERR-YYYY-MMDD-XXXX-description
3. AI edits source files and creates migration if needed
4. AI pushes the branch
5. GitHub Actions runs CI automatically
6. If CI passes → staging deploy runs automatically
7. Smoke tests run against staging
8. Owner reviews and approves in GitHub
9. Production deploy runs through GitHub Actions
10. Post-deploy health check runs
11. If health check fails → owner triggers rollback manually
```

---

## AI Incident Package (What AI Can See)

When diagnosing an incident, AI agents receive:

✅ Allowed:
- Error reference ID (`errorRefId`)
- Plain-English incident summary
- Sanitized stack trace (no customer data values)
- Affected endpoint and HTTP method
- Recent deployment history (git SHAs, timestamps)
- Recent migration history
- Staging environment diagnostics
- Test results

❌ Not allowed:
- Full customer database records
- Customer names, emails, or contact details
- Safeguarding note content
- Production database credentials
- SSH keys or server access
- Any secret values

---

## Runtime Verification Rules

Before any agent makes a change, it must verify:

1. **Does this already exist?** Search the codebase before building.
2. **Is this the right file?** Read `framework/HUBFORTE_AGENT_CONTEXT_v2.md` for context.
3. **Does every DB query include `tenant_id` scoping?** No exceptions for entity tables.
4. **Do frontend and backend module keys match exactly?** One typo = silent module failure.
5. **Is there a SQL migration for every schema change?** Never use `drizzle-kit push`.
6. **Will the app still compile after this change?** Run typecheck before claiming done.
7. **Does any user-facing error message contain a stack trace?** It must not.

---

## Safeguarding Data — Special Rules for Agents

1. Never read `safeguarding_notes.content` directly — it is encrypted.
2. Never include safeguarding data in any log, summary, or incident report.
3. Never access safeguarding notes through the report engine or standard export.
4. Never pass safeguarding content to any AI model.
5. Safeguarding route changes require explicit owner instruction.

---

## The Non-Negotiable Safety Rules

From `framework/HUBFORTE_AGENT_CONTEXT_v2.md`:

1. NEVER commit `.env` files or credentials to git.
2. NEVER bypass tenant isolation — every non-SUPER_ADMIN query must be scoped by `tenant_id`.
3. NEVER modify `remediationEngine.ts` unless explicitly instructed.
4. NEVER let frontend module keys differ from backend `checkModuleEnabled()` keys.
5. NEVER use npm or yarn — always use pnpm.
6. NEVER access safeguarding notes through the report engine or standard import/export.
7. ALWAYS check if something already exists before building it.
8. ALWAYS add new DB tables as Drizzle schema files with a corresponding SQL migration.
9. ALWAYS use the existing `aiProvider.ts` for AI calls — never call OpenAI/Anthropic directly.
