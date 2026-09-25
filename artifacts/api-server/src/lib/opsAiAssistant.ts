/**
 * AI Operations Assistant (Task 7.6)
 *
 * Runs every 15 minutes. Queries error_logs, request_logs, and remediation_runs,
 * sends a structured prompt to the AI provider, stores the result in ops_ai_reports,
 * and creates an in-app notification if severity is warning or critical.
 */

import { db, opsAiReportsTable, errorLogsTable, requestLogs, remediationRunsTable } from "@workspace/db";
import { desc, gte, count, sql } from "drizzle-orm";
import { chatCompletion } from "./aiProvider";
import { getDefaultProvider, getDefaultModel } from "./aiModels";
import { notifySuperAdminUsers } from "./notifications";
import { generateId } from "./id";
import { logger } from "./logger";

// OPS_TENANT_ID must be set to a valid tenant ID in production.
// ops_ai_reports.tenant_id is a FK to tenants — "system" will fail if that row doesn't exist.
const OPS_TENANT_ID = process.env.OPS_TENANT_ID;

if (!OPS_TENANT_ID) {
  // Warn at module load time so the issue is visible in startup logs.
  // We don't throw here to avoid crashing the server if the module is loaded
  // before env vars are validated — generateOpsReport will skip gracefully.
  console.warn("[opsAiAssistant] WARNING: OPS_TENANT_ID env var is not set. Ops reports will be skipped until it is configured.");
}

async function gatherInputSnapshot() {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  // Error summary: top 10 error clusters in last hour
  const errors = await db
    .select({
      message: errorLogsTable.message,
      count: count(),
    })
    .from(errorLogsTable)
    .where(gte(errorLogsTable.createdAt, oneHourAgo))
    .groupBy(errorLogsTable.message)
    .orderBy(desc(count()))
    .limit(10);

  // Slow requests (>2s) in last hour
  const slowRequests = await db
    .select({
      method: requestLogs.method,
      path: requestLogs.path,
      durationMs: requestLogs.durationMs,
    })
    .from(requestLogs)
    .where(
      sql`${requestLogs.timestamp} >= ${oneHourAgo} AND ${requestLogs.durationMs} > 2000`
    )
    .orderBy(desc(requestLogs.durationMs))
    .limit(10);

  // Remediation actions in last hour
  const remediations = await db
    .select({
      status: remediationRunsTable.status,
      count: count(),
    })
    .from(remediationRunsTable)
    .where(gte(remediationRunsTable.createdAt, oneHourAgo))
    .groupBy(remediationRunsTable.status);

  // Total request count + error rate in last hour
  const [stats] = await db
    .select({
      total: count(),
      errors: count(sql`CASE WHEN ${requestLogs.isError} = true THEN 1 END`),
    })
    .from(requestLogs)
    .where(gte(requestLogs.timestamp, oneHourAgo));

  return { errors, slowRequests, remediations, stats };
}

function buildPrompt(snapshot: Awaited<ReturnType<typeof gatherInputSnapshot>>): string {
  const { errors, slowRequests, remediations, stats } = snapshot;

  const errorSummary = errors.length > 0
    ? errors.map((e) => {
        // Strip newlines to prevent prompt injection via application error messages
        const msg = String(e.message ?? "").replace(/[\r\n]/g, " ").slice(0, 200);
        return `- "${msg}" (${e.count}x)`;
      }).join("\n")
    : "None";

  const slowSummary = slowRequests.length > 0
    ? slowRequests.map((r) => {
        // Truncate and strip newlines to prevent prompt injection via user-controlled paths
        const method = String(r.method ?? "").replace(/[\r\n]/g, "").slice(0, 10);
        const path = String(r.path ?? "").replace(/[\r\n]/g, "").slice(0, 100);
        return `- ${method} ${path} (${r.durationMs}ms)`;
      }).join("\n")
    : "None";

  const remediationSummary = remediations.length > 0
    ? remediations.map((r) => `- ${r.status}: ${Number(r.count)}`).join("\n")
    : "None";

  const total = Number(stats?.total ?? 0);
  const errorCount = Number(stats?.errors ?? 0);
  const errorRate = total > 0 ? ((errorCount / total) * 100).toFixed(1) : "0.0";

  return `You are the operations assistant for a web application used by a UK charity.
Analyse the following system data and produce a brief status report.
Write in plain English for a non-technical operator — no stack traces, no jargon.
If there are issues, explain what happened and what to do next.
If everything is healthy, say so in one sentence.
End your response with exactly one line: SEVERITY: ok | SEVERITY: warning | SEVERITY: critical

Error summary (last hour):
${errorSummary}

Slow requests (>2s, last hour):
${slowSummary}

Remediation actions (last hour):
${remediationSummary}

Request stats (last hour): ${total} total, ${errorCount} errors (${errorRate}% error rate)`;
}

function parseSeverity(text: string): "ok" | "warning" | "critical" {
  // Only match on the last non-empty line to prevent prompt injection via input data
  const lastLine = text.trimEnd().split("\n").at(-1) ?? "";
  const match = lastLine.match(/^SEVERITY:\s*(ok|warning|critical)$/i);
  if (!match) return "ok";
  const val = match[1].toLowerCase();
  if (val === "warning" || val === "critical") return val;
  return "ok";
}

export async function generateOpsReport(trigger: "scheduled" | "alarm" = "scheduled"): Promise<void> {
  if (!OPS_TENANT_ID) {
    if (trigger === "scheduled") {
      logger.warn("[opsAiAssistant] Skipping ops report — OPS_TENANT_ID is not configured");
      return;
    }
    throw new Error("OPS_TENANT_ID is not configured — cannot generate diagnostic report");
  }

  const startTime = Date.now();
  const snapshot = await gatherInputSnapshot();
  const prompt = buildPrompt(snapshot);

  const provider = getDefaultProvider();
  const model = getDefaultModel();

  const response = await chatCompletion({ prompt, provider, model });
  const reportText = response.content;
  const severity = parseSeverity(reportText);

  await db.insert(opsAiReportsTable).values({
    id: generateId("oar"),
    tenantId: OPS_TENANT_ID,
    reportText,
    severity,
    trigger,
    inputSnapshot: snapshot as Record<string, unknown>,
    aiProvider: response.provider,
  });

  if (severity === "warning" || severity === "critical") {
    await notifySuperAdminUsers({
      title: severity === "critical" ? "CRITICAL: System issue detected" : "Warning: System issue detected",
      message: reportText.replace(/SEVERITY:.*$/m, "").trim().slice(0, 300),
      type: severity === "critical" ? "ERROR" : "WARNING",
      link: "/super-admin?tab=ops",
    });
  }

  logger.info({ severity, trigger, durationMs: Date.now() - startTime }, "[opsAiAssistant] Report generated");
}

// ---------------------------------------------------------------------------
// Scheduler — runs every 15 minutes
// ---------------------------------------------------------------------------

let opsIntervalId: ReturnType<typeof setInterval> | null = null;

export function startOpsAiAssistant(): void {
  if (opsIntervalId) return;

  logger.info("OpsAiAssistant: Starting (every 15 minutes)");

  // Initial run after 2-minute warm-up delay
  setTimeout(() => {
    generateOpsReport("scheduled").catch(() => {});
  }, 2 * 60 * 1000);

  opsIntervalId = setInterval(() => {
    generateOpsReport("scheduled").catch(() => {});
  }, 15 * 60 * 1000);
}

export function stopOpsAiAssistant(): void {
  if (opsIntervalId) {
    clearInterval(opsIntervalId);
    opsIntervalId = null;
    logger.info("OpsAiAssistant: Stopped");
  }
}
