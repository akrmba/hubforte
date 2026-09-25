import { db, usersTable, tenantsTable, gmailCredentialsTable, incidentsTable } from "@workspace/db";
import { eq, and, gte, isNotNull } from "drizzle-orm";
import { sendGmailEmail } from "./gmail";
import { notifySuperAdminUsers } from "./notifications";
import { generateId } from "./id";
import { logger } from "./logger";
import { createIncident as statusPageCreateIncident, resolveIncident as statusPageResolveIncident } from "./statusPage";

export type IncidentSeverity = "P1" | "P2" | "P3" | "P4";

export interface IncidentPayload {
  severity: IncidentSeverity;
  condition: string;
  message: string;
  errorRate?: number;
  tenantIdsAffected?: string[];
}

// ---------------------------------------------------------------------------
// Deduplication — do not re-alert the same condition within 30 minutes
// ---------------------------------------------------------------------------
export async function isRecentlyAlerted(condition: string, windowMs = 30 * 60 * 1000): Promise<boolean> {
  const since = new Date(Date.now() - windowMs);
  const [existing] = await db
    .select({ id: incidentsTable.id })
    .from(incidentsTable)
    .where(
      and(
        eq(incidentsTable.condition, condition),
        gte(incidentsTable.detectedAt, since)
      )
    )
    .limit(1);
  return !!existing;
}

// ---------------------------------------------------------------------------
// Persist incident record
// ---------------------------------------------------------------------------
async function persistIncident(payload: IncidentPayload, notificationsSent: string[], statusPageIncidentId?: string | null): Promise<string> {
  const id = generateId("inc");
  await db.insert(incidentsTable).values({
    id,
    severity: payload.severity,
    condition: payload.condition,
    message: payload.message,
    tenantIdsAffected: payload.tenantIdsAffected ?? [],
    notificationsSent,
    statusPageIncidentId: statusPageIncidentId ?? null,
  });
  return id;
}

// ---------------------------------------------------------------------------
// In-app notification
// ---------------------------------------------------------------------------
async function sendInAppNotification(payload: IncidentPayload): Promise<void> {
  const emoji = payload.severity === "P1" ? "🔴" : payload.severity === "P2" ? "🟡" : "🟠";
  const affectedCount = payload.tenantIdsAffected?.length ?? 0;
  const affectedSuffix = affectedCount > 0 ? ` ${affectedCount} tenant(s) affected.` : "";
  const type = payload.severity === "P1" ? "ERROR" : payload.severity === "P2" ? "WARNING" : "WARNING";

  await notifySuperAdminUsers({
    title: `${emoji} ${payload.severity} INCIDENT: ${payload.condition}`,
    message: `${payload.message}${affectedSuffix} Action required.`,
    type,
    link: "/super-admin/health",
  });
}

// ---------------------------------------------------------------------------
// Owner email (P1 + P2 only)
// ---------------------------------------------------------------------------
async function sendOwnerEmail(payload: IncidentPayload, incidentId: string): Promise<void> {
  const appUrl = process.env.APP_URL || process.env.FRONTEND_URL || "http://localhost:5173";
  const superAdminEmail = process.env.SUPER_ADMIN_EMAIL;

  if (!superAdminEmail) {
    logger.warn({ condition: payload.condition }, "SUPER_ADMIN_EMAIL not set — skipping owner email");
    return;
  }

  const [gmailCred] = await db.select().from(gmailCredentialsTable).limit(1);
  if (!gmailCred?.refreshToken) {
    logger.warn({ condition: payload.condition }, "No Gmail credentials — skipping owner email");
    return;
  }

  const fromAddress = process.env.GMAIL_FROM_ADDRESS || "noreply@hubforte.com";
  const emoji = payload.severity === "P1" ? "🔴" : "🟡";
  const severityLabel = payload.severity === "P1" ? "P1 — CRITICAL" : "P2 — HIGH";
  const affectedCount = payload.tenantIdsAffected?.length ?? 0;

  const subject = `${emoji} ${payload.severity} — Hubforte: ${payload.condition}`;
  const body = [
    `Severity: ${severityLabel}`,
    `Detected: ${new Date().toISOString()}`,
    `Condition: ${payload.message}`,
    `Affected: ${affectedCount} tenant(s)`,
    payload.errorRate !== undefined ? `Error rate: ${payload.errorRate.toFixed(1)}%` : "",
    "",
    "What to do:",
    `1. Open health dashboard: ${appUrl}/super-admin/health`,
    `2. Run auto-remediation: ${appUrl}/super-admin/health`,
    `3. Check the error knowledge base: ${appUrl}/super-admin`,
    "",
    "This alert will re-send in 30 minutes if not acknowledged.",
    `Reference: INC-${incidentId}`,
  ]
    .filter((l) => l !== undefined)
    .join("\n");

  try {
    await sendGmailEmail({ to: superAdminEmail, subject, body, from: fromAddress, refreshToken: gmailCred.refreshToken });
    logger.info({ severity: payload.severity, condition: payload.condition }, "Owner incident email sent");
  } catch (err) {
    logger.error({ err, condition: payload.condition }, "Failed to send owner incident email");
  }
}

// ---------------------------------------------------------------------------
// Slack (optional — only if SLACK_WEBHOOK_URL is configured)
// ---------------------------------------------------------------------------
async function sendSlackNotification(payload: IncidentPayload, incidentId: string): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;

  const emoji = payload.severity === "P1" ? ":red_circle:" : payload.severity === "P2" ? ":large_yellow_circle:" : ":large_orange_circle:";
  const appUrl = process.env.APP_URL || process.env.FRONTEND_URL || "http://localhost:5173";

  const slackBody = {
    text: `${emoji} *${payload.severity} INCIDENT* — ${payload.condition}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${emoji} *${payload.severity} INCIDENT*\n*Condition:* ${payload.condition}\n*Message:* ${payload.message}\n*Reference:* INC-${incidentId}`,
        },
      },
      {
        type: "actions",
        elements: [
          { type: "button", text: { type: "plain_text", text: "Open Health Dashboard" }, url: `${appUrl}/super-admin/health` },
        ],
      },
    ],
  };

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(slackBody),
    });
    if (!res.ok) throw new Error(`Slack webhook returned ${res.status}`);
    logger.info({ severity: payload.severity }, "Slack incident notification sent");
  } catch (err) {
    logger.error({ err }, "Failed to send Slack incident notification");
  }
}

// ---------------------------------------------------------------------------
// Status page update — delegates to statusPage.ts utility
// ---------------------------------------------------------------------------
async function updateStatusPage(payload: IncidentPayload): Promise<string | null> {
  if (payload.severity !== "P1" && payload.severity !== "P2") return null;
  return statusPageCreateIncident(
    `${payload.severity}: ${payload.condition}`,
    payload.message,
    ["API Service"]
  );
}

// ---------------------------------------------------------------------------
// Client emails (P1 + P2 only, gated by SEND_CLIENT_INCIDENT_EMAILS=true)
// ---------------------------------------------------------------------------
async function sendClientEmails(payload: IncidentPayload, incidentId: string): Promise<void> {
  if (process.env.SEND_CLIENT_INCIDENT_EMAILS !== "true") return;
  if (!payload.tenantIdsAffected?.length) return;

  const [gmailCred] = await db.select().from(gmailCredentialsTable).limit(1);
  if (!gmailCred?.refreshToken) return;

  const fromAddress = process.env.GMAIL_FROM_ADDRESS || "noreply@hubforte.com";
  const statusPageUrl = process.env.STATUS_PAGE_URL || process.env.APP_URL || "http://localhost:5173";

  // Find ADMIN users for affected tenants
  const admins = await db
    .select({ email: usersTable.email, tenantId: usersTable.tenantId })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.role, "ADMIN"),
        eq(usersTable.active, true),
        isNotNull(usersTable.email)
      )
    );

  const affectedAdmins = admins.filter(
    (a) => a.tenantId && payload.tenantIdsAffected!.includes(a.tenantId) && a.email
  );

  const subject = "Hubforte — We are aware of an issue affecting your account";
  const body = [
    "We have detected an issue that may be affecting your use of Hubforte.",
    "Our team has been automatically notified and is investigating.",
    "",
    `You can monitor the status at: ${statusPageUrl}`,
    "",
    "We will update you as soon as the issue is resolved.",
    `Reference: INC-${incidentId}`,
    "",
    "We apologise for any inconvenience.",
  ].join("\n");

  for (const admin of affectedAdmins) {
    try {
      await sendGmailEmail({ to: admin.email!, subject, body, from: fromAddress, refreshToken: gmailCred.refreshToken });
    } catch (err) {
      logger.error({ err, email: admin.email }, "Failed to send client incident email");
    }
  }

  if (affectedAdmins.length > 0) {
    logger.info({ count: affectedAdmins.length, incidentId }, "Client incident emails sent");
  }
}

// ---------------------------------------------------------------------------
// Main entry point — call this when an incident is detected
// ---------------------------------------------------------------------------
export async function notifyIncident(payload: IncidentPayload): Promise<void> {
  try {
    const notificationsSent: string[] = ["in_app"];

    // Persist first so we have the real incidentId for all notifications
    if (payload.severity === "P1" || payload.severity === "P2") {
      notificationsSent.push("email");
    }
    const incidentId = await persistIncident(payload, notificationsSent);

    // Always: in-app notification
    await sendInAppNotification(payload);

    // P1 + P2: email + Slack + status page + client emails — all with real incidentId
    if (payload.severity === "P1" || payload.severity === "P2") {
      await sendOwnerEmail(payload, incidentId);
      await sendSlackNotification(payload, incidentId);
      const statusPageIncidentId = await updateStatusPage(payload);
      if (statusPageIncidentId) {
        // Persist the external incident id so it can be resolved later
        await db.update(incidentsTable)
          .set({ statusPageIncidentId })
          .where(eq(incidentsTable.id, incidentId));
        logger.info({ statusPageIncidentId, incidentId }, "Status page incident linked and persisted");
      }
      await sendClientEmails(payload, incidentId);
    }

    logger.info({ severity: payload.severity, condition: payload.condition, incidentId }, "Incident notified");
  } catch (err) {
    logger.error({ err, condition: payload.condition }, "incidentNotifier failed");
  }
}

// ---------------------------------------------------------------------------
// Resolve a local incident and close the matching status-page incident
// ---------------------------------------------------------------------------
export async function resolveLocalIncident(incidentId: string, resolutionNote?: string): Promise<boolean> {
  try {
    const [incident] = await db
      .select()
      .from(incidentsTable)
      .where(eq(incidentsTable.id, incidentId))
      .limit(1);

    if (!incident) {
      logger.warn({ incidentId }, "resolveLocalIncident: incident not found");
      return false;
    }

    await db.update(incidentsTable)
      .set({ resolvedAt: new Date() })
      .where(eq(incidentsTable.id, incidentId));

    if (incident.statusPageIncidentId) {
      await statusPageResolveIncident(
        incident.statusPageIncidentId,
        resolutionNote ?? "The issue has been identified and resolved."
      );
    }

    logger.info({ incidentId, statusPageIncidentId: incident.statusPageIncidentId }, "Incident resolved");
    return true;
  } catch (err) {
    logger.error({ err, incidentId }, "resolveLocalIncident failed");
    throw err;
  }
}
