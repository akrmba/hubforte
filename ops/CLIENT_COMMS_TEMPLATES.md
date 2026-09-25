# Hubforte Client Communications Templates

**Scope:** Pre-written messages for communicating with Hubforte staff during incidents, maintenance, and deploys.
**Last updated:** 2026-04-11

**Rules:**
- Replace all `[BRACKETED]` placeholders before sending
- Send via the team's normal communication channel (email, Slack, Teams)
- Keep language non-technical — these go to charity staff, not developers
- Never mention agents, AI, or internal tooling
- For unplanned outages, send the initial notice within 15 minutes of detection
- Always send a resolution notice — even if the fix was quick

---

## 1. Scheduled Maintenance Announcement (Send Before)

**Subject:** Hubforte scheduled maintenance — [DATE] at [TIME]

Hi team,

We'll be performing a scheduled update to Hubforte on **[DATE] at [TIME] (UK time)**. The system will be unavailable for approximately **[DURATION]**.

**What to expect:**
- You'll see a maintenance message if you try to access Hubforte during this window
- No data will be lost — all your work is safe
- The system will be back automatically when the update is complete

**What you need to do:**
- Save any in-progress work before [TIME]
- If you're mid-campaign, the campaign will resume automatically after maintenance

If you have any questions, reply to this message.

Thanks,
[YOUR NAME]

---

## 2. Maintenance Complete (Send After)

**Subject:** Hubforte is back online

Hi team,

The update is complete and Hubforte is back online. You can log in and use the system as normal.

**What changed:**
- [Brief summary of changes, e.g., "Performance improvements and bug fixes"]
- [Any new features they should know about]

If you notice anything unusual, please let us know right away.

Thanks,
[YOUR NAME]

---

## 3. Unexpected Issue During Maintenance (Send If Deploy Fails and Rollback Takes Time)

**Subject:** Hubforte — brief delay in maintenance completion

Hi team,

We're still working on the scheduled update to Hubforte. We've encountered a brief technical issue and are resolving it now.

**What to expect:**
- Hubforte will remain unavailable for a little longer than expected
- We expect to be back online within [EXTENDED DURATION]
- No data has been affected — everything is safe

We'll send another update as soon as the system is back online.

Thanks for your patience,
[YOUR NAME]

---

## 4. All Clear After Incident (Send After Rollback)

**Subject:** Hubforte is back online

Hi team,

Hubforte is fully back online and working normally.

**What happened:**
- We experienced a brief technical issue during a scheduled update
- The issue lasted from [START TIME] to [END TIME] ([DURATION])
- We resolved it by restoring the previous working version

**Was any data affected?**
- No data was lost or affected
- All your records, campaigns, and settings are intact

If you notice anything that doesn't look right, please let us know immediately.

Thanks,
[YOUR NAME]

---

## 5. Unplanned Outage — Initial Notice

**Subject:** Hubforte is currently experiencing issues

Hi team,

We're aware that Hubforte is currently experiencing issues. Our team is investigating and working to resolve this as quickly as possible.

**What we know so far:**
- [Brief description, e.g., "Some users are unable to log in" or "Pages are loading slowly"]
- We identified the issue at [TIME]

**What you should do:**
- Please avoid retrying failed actions repeatedly — this can make things worse
- If you were sending a campaign, it has been automatically paused
- We'll update you within **[30 minutes / 1 hour]**

Thanks for your patience,
[YOUR NAME]

---

## 6. Unplanned Outage — Resolved

**Subject:** Hubforte issue resolved

Hi team,

The issue affecting Hubforte has been resolved. Everything should be working normally now.

**What happened:**
- [Brief, non-technical explanation, e.g., "A database connection issue caused login failures"]
- The issue lasted from [START TIME] to [END TIME] ([DURATION])

**What we did:**
- [Brief action taken, e.g., "We restored the database connection and verified all data is intact"]

**Was any data affected?**
- [Usually: "No data was lost or affected"]
- [If data was affected: "Some [specific records] may need to be re-entered. We'll reach out individually if this affects you."]

If you notice anything still not working correctly, please let us know immediately.

Thanks,
[YOUR NAME]

---

## 7. Campaign Paused Due to Issue

**Subject:** Your email campaign has been paused

Hi [NAME],

Your campaign **"[CAMPAIGN NAME]"** has been automatically paused due to a system issue. No duplicate emails have been sent.

**What happens next:**
- Once the issue is resolved, you can resume the campaign from where it left off
- [X] out of [Y] emails were sent before the pause
- The remaining [Z] contacts will be sent when you resume

We'll let you know when it's safe to resume. Please don't restart the campaign manually until then.

Thanks,
[YOUR NAME]

---

## 8. Password Reset Required

**Subject:** Hubforte — please reset your password

Hi team,

As part of a security update, we've reset all login sessions. You'll need to log in again next time you access Hubforte.

**If you remember your password:** Just log in as normal at [APP_URL].

**If you've forgotten your password:** Click "Forgot password" on the login page and follow the instructions.

Your data and settings are unchanged — this only affects your login session.

Thanks,
[YOUR NAME]

---

## Usage Notes

- Replace all `[BRACKETED]` placeholders before sending
- Send via the team's normal communication channel (email, Slack, Teams)
- For unplanned outages, send the initial notice within 15 minutes of detection
- Always send a resolution notice — even if the fix was quick
- Keep language non-technical — these go to charity staff, not developers
- Never mention internal tooling, deployment processes, or technical details
