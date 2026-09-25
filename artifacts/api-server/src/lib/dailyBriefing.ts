// Daily Owner Briefing — runs at 8am, uses System AI (Anthropic/Claude)
// Sends a summary email to PLATFORM_OWNER / SUPER_ADMIN users.

import { db, usersTable, tenantsTable, errorLogsTable, incidentsTable, remediationRunsTable } from "@workspace/db";
import { eq, gte, and, desc, count, sql } from "drizzle-orm";
import { getAIProvider, chatCompletionWithContext } from "./aiProvider";
import { logger } from "./logger";

let _briefingTimer: ReturnType<typeof setTimeout> | null = null;

function msUntilNext8am(): number {
  const now = new Date();
  const next = new Date(now);
  next.setHours(8, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

export function startDailyBriefing(): void {
  const scheduleNext = () => {
    const delay = msUntilNext8am();
    logger.info({ nextBriefingMs: delay }, "Daily briefing scheduled");
    _briefingTimer = setTimeout(async () => {
      await runDailyBriefing();
      scheduleNext();
    }, delay);
  };
  scheduleNext();
}

async function runDailyBriefing(): Promise<void> {
  try {
    const superAdminEmail = process.env.SUPER_ADMIN_EMAIL;
    if (!superAdminEmail) {
      logger.warn("SUPER_ADMIN_EMAIL not set — skipping daily briefing");
      return;
    }

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Gather data
    const [tenantCount] = await db
      .select({ total: count() })
      .from(tenantsTable)
      .where(gte(tenantsTable.createdAt, yesterday));

    const [userCount] = await db
      .select({ total: count() })
      .from(usersTable)
      .where(gte(usersTable.createdAt, yesterday));

    const [errorCount] = await db
      .select({ total: count() })
      .from(errorLogsTable)
      .where(gte(errorLogsTable.createdAt, yesterday));

    const recentIncidents = await db
      .select({ id: incidentsTable.id, condition: incidentsTable.condition, severity: incidentsTable.severity, message: incidentsTable.message })
      .from(incidentsTable)
      .where(gte(incidentsTable.detectedAt, yesterday))
      .orderBy(desc(incidentsTable.detectedAt))
      .limit(5);

    const recentRemediations = await db
      .select({ id: remediationRunsTable.id, policyId: remediationRunsTable.policyId, status: remediationRunsTable.status })
      .from(remediationRunsTable)
      .where(gte(remediationRunsTable.createdAt, yesterday))
      .limit(5);

    const dataContext = `
Yesterday's system data:
- New tenants signed up: ${tenantCount?.total ?? 0}
- New users registered: ${userCount?.total ?? 0}
- Errors logged: ${errorCount?.total ?? 0}
- Incidents: ${recentIncidents.length === 0 ? "none" : recentIncidents.map(i => `${i.severity} — ${i.condition}: ${i.message}`).join("; ")}
- Remediation policies fired: ${recentRemediations.length === 0 ? "none" : recentRemediations.length}
`;

    const ctx = await getAIProvider("system");
    const prompt = `You are the AI assistant for Hubforte, a SaaS CRM platform.
Write a concise daily briefing email for the platform owner.

${dataContext}

Format:
Subject line: "Hubforte Daily Brief — ${new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}"

Body sections:
1. System Health (1-2 sentences)
2. New Activity (tenants/users)
3. Errors & Incidents (highlight anything needing attention)
4. Remediation (what fired)
5. Action Items for Today (2-3 bullet points)

Keep it under 200 words. Professional but direct tone.`;

    const result = await chatCompletionWithContext(ctx, prompt);
    const emailBody = result.content.trim();

    // Send via nodemailer / existing email infrastructure
    const { sendSystemEmail } = await import("./systemEmail");
    await sendSystemEmail({
      to: superAdminEmail,
      subject: `Hubforte Daily Brief — ${new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}`,
      text: emailBody,
    });

    logger.info({ to: superAdminEmail }, "Daily briefing email sent");
  } catch (err) {
    logger.error({ err }, "Daily briefing failed");
  }
}
