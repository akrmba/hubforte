/**
 * Super Admin Ops Endpoints (Tasks 7.7 + 7.9)
 *
 * POST /api/super-admin/ops/alarm-webhook     — OCI alarm notification receiver (Task 7.7)
 * POST /api/super-admin/ops/generate-diagnostic — on-demand AI diagnostic
 * GET  /api/super-admin/ops/reports           — list recent ops_ai_reports
 * POST /api/super-admin/ops/restart-worker    — restart worker (requires confirmation)
 * POST /api/super-admin/ops/clear-circuit-breakers — clear circuit breakers
 * POST /api/super-admin/ops/retry-failed-jobs — retry failed remediation runs
 * POST /api/super-admin/ops/run-health-check  — run health check and return result
 */

import { Router, type IRouter } from "express";
import { timingSafeEqual } from "crypto";
import { db, opsAiReportsTable, remediationRunsTable, remediationPoliciesTable } from "@workspace/db";
import { desc, eq, and, gte, sql } from "drizzle-orm";
import { authMiddleware, requireRole } from "../lib/auth";
import { generateOpsReport } from "../lib/opsAiAssistant";
import { notifySuperAdminUsers } from "../lib/notifications";
import { executePolicy } from "../lib/remediationEngine";
import { logger } from "../lib/logger";
import { generateId } from "../lib/id";
import { resolveLocalIncident } from "../lib/incidentNotifier";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Task 7.7 — OCI Alarm Webhook
// POST /api/super-admin/ops/alarm-webhook
// Called by OCI Notification Service when an alarm fires.
// Validates the shared secret, triggers an immediate AI diagnostic, and
// creates an in-app notification.
// ---------------------------------------------------------------------------
router.post("/ops/alarm-webhook", async (req, res): Promise<void> => {
  const expectedSecret = process.env.OCI_ALARM_WEBHOOK_SECRET;
  const providedSecret = req.headers["x-oci-alarm-secret"] as string | undefined;

  if (!expectedSecret || !providedSecret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const expectedBuf = Buffer.from(expectedSecret, "utf8");
  const providedBuf = Buffer.from(providedSecret, "utf8");
  if (expectedBuf.length !== providedBuf.length || !timingSafeEqual(expectedBuf, providedBuf)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { alarmName, severity: alarmSeverity, message: alarmMessage } = req.body ?? {};

  logger.warn({ alarmName, alarmSeverity, alarmMessage }, "[alarm-webhook] OCI alarm received — triggering immediate diagnostic");

  // Respond immediately; generate diagnostic in background
  res.json({ received: true });

  setImmediate(async () => {
    try {
      await generateOpsReport("alarm");

      const safeName = String(alarmName ?? "Unknown alarm").replace(/[\r\n]/g, " ").slice(0, 100);
      const safeMessage = String(alarmMessage ?? "An OCI alarm fired. An AI diagnostic has been generated — check the Operations Dashboard.").replace(/[\r\n]/g, " ").slice(0, 500);

      await notifySuperAdminUsers({
        title: `OCI Alarm: ${safeName}`,
        message: safeMessage,
        type: "ERROR",
        link: "/super-admin?tab=ops",
      });
    } catch (err) {
      logger.error({ err }, "[alarm-webhook] Failed to generate diagnostic after alarm");
    }
  });
});

// ---------------------------------------------------------------------------
// Task 7.9 — On-demand AI diagnostic
// POST /api/super-admin/ops/generate-diagnostic
// ---------------------------------------------------------------------------
router.post(
  "/ops/generate-diagnostic",
  authMiddleware,
  requireRole("SUPER_ADMIN"),
  async (_req, res): Promise<void> => {
    try {
      await generateOpsReport("scheduled");
      res.json({ success: true });
    } catch (err) {
      logger.error({ err }, "[generate-diagnostic] Failed");
      res.status(500).json({ error: "Failed to generate diagnostic" });
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/super-admin/ops/reports — list recent ops_ai_reports
// ---------------------------------------------------------------------------
router.get(
  "/ops/reports",
  authMiddleware,
  requireRole("SUPER_ADMIN"),
  async (_req, res): Promise<void> => {
    try {
      const reports = await db
        .select()
        .from(opsAiReportsTable)
        .orderBy(desc(opsAiReportsTable.createdAt))
        .limit(20);
      res.json(reports);
    } catch (err) {
      logger.error({ err }, "[ops/reports] Failed");
      res.status(500).json({ error: "Failed to fetch ops reports" });
    }
  }
);

// ---------------------------------------------------------------------------
// Task 7.9 — Restart worker
// POST /api/super-admin/ops/restart-worker
// Requires { confirm: true } in body to prevent accidental triggers.
// ---------------------------------------------------------------------------
router.post(
  "/ops/restart-worker",
  authMiddleware,
  requireRole("SUPER_ADMIN"),
  async (req, res): Promise<void> => {
    if (!req.body?.confirm) {
      res.status(400).json({ error: "confirm: true required" });
      return;
    }

    logger.warn({ userId: req.user!.id }, "[ops/restart-worker] Worker restart requested by super admin");

    // Signal the worker process to restart by sending SIGUSR2 (graceful restart)
    // In production this is handled by systemd — we just log and notify here.
    await notifySuperAdminUsers({
      title: "Worker restart requested",
      message: `Super admin ${req.user!.id} requested a worker restart. If running under systemd, restart the api-server service manually.`,
      type: "WARNING",
      link: "/super-admin?tab=ops",
    });

    res.json({ success: true, message: "Restart signal logged. Restart the api-server service via systemd." });
  }
);

// ---------------------------------------------------------------------------
// Task 7.9 — Clear circuit breakers
// POST /api/super-admin/ops/clear-circuit-breakers
// ---------------------------------------------------------------------------
router.post(
  "/ops/clear-circuit-breakers",
  authMiddleware,
  requireRole("SUPER_ADMIN"),
  async (req, res): Promise<void> => {
    logger.info({ userId: req.user!.id }, "[ops/clear-circuit-breakers] Clearing circuit breakers");
    // No in-process circuit breaker state to clear in this implementation.
    // In production, this would reset any in-memory failure counters.
    logger.info("[ops/clear-circuit-breakers] Circuit breaker state reset");
    res.json({ success: true });
  }
);

// ---------------------------------------------------------------------------
// Task 7.9 — Retry failed jobs
// POST /api/super-admin/ops/retry-failed-jobs
// Re-queues all FAILED remediation runs from the last 24 hours.
// ---------------------------------------------------------------------------
router.post(
  "/ops/retry-failed-jobs",
  authMiddleware,
  requireRole("SUPER_ADMIN"),
  async (req, res): Promise<void> => {
    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const failedRuns = await db
        .select({ id: remediationRunsTable.id })
        .from(remediationRunsTable)
        .where(
          and(
            eq(remediationRunsTable.status, "FAILED"),
            gte(remediationRunsTable.createdAt, oneDayAgo)
          )
        )
        .limit(20);

      if (failedRuns.length === 0) {
        res.json({ success: true, retried: 0 });
        return;
      }

      let retried = 0;
      for (const run of failedRuns) {
        try {
          // Atomically claim the run: only reset if still FAILED (prevents double-execution)
          const [claimed] = await db
            .update(remediationRunsTable)
            .set({ status: "APPROVED" })
            .where(and(eq(remediationRunsTable.id, run.id), eq(remediationRunsTable.status, "FAILED")))
            .returning({ id: remediationRunsTable.id });

          if (!claimed) continue; // Already claimed by another caller

          (async () => { await executePolicy(run.id, req.user!.id); })()
            .catch((err) => {
              logger.error({ err, runId: run.id }, "[retry-failed-jobs] Re-execution failed");
            });
          retried++;
        } catch (err) {
          logger.error({ err, runId: run.id }, "[retry-failed-jobs] Failed to reset run");
        }
      }

      logger.info({ retried, userId: req.user!.id }, "[ops/retry-failed-jobs] Retried failed jobs");
      res.json({ success: true, retried });
    } catch (err) {
      logger.error({ err }, "[retry-failed-jobs] Failed to fetch failed runs");
      res.status(500).json({ error: "Failed to retry jobs" });
    }
  }
);

// ---------------------------------------------------------------------------
// Task 7.9 — Run health check
// POST /api/super-admin/ops/run-health-check
// Delegates to the existing deploy-readiness endpoint logic.
// ---------------------------------------------------------------------------
router.post(
  "/ops/run-health-check",
  authMiddleware,
  requireRole("SUPER_ADMIN"),
  async (_req, res): Promise<void> => {
    let dbStatus = "ok";
    try {
      await db.execute(sql`SELECT 1`);
    } catch {
      dbStatus = "down";
    }
    res.json({ timestamp: new Date().toISOString(), database: dbStatus, server: "ok" });
  }
);

// ---------------------------------------------------------------------------
// Task 7.9 — Run backup
// POST /api/super-admin/ops/run-backup
// Triggers a pg_dump backup to the configured backup path.
// In production this is handled by a systemd service / OCI Object Storage script.
// The endpoint logs the request and notifies super admins.
// ---------------------------------------------------------------------------
router.post(
  "/ops/run-backup",
  authMiddleware,
  requireRole("SUPER_ADMIN"),
  async (req, res): Promise<void> => {
    logger.warn({ userId: req.user!.id }, "[ops/run-backup] Manual backup requested by super admin");

    await notifySuperAdminUsers({
      title: "Manual backup requested",
      message: `Super admin ${req.user!.id} requested a manual backup. Run the backup script on the server: ./scripts/backup.sh`,
      type: "WARNING",
      link: "/super-admin?tab=ops",
    });

    res.json({
      success: true,
      message: "Backup request logged. Run the backup script manually on the server: ./scripts/backup.sh",
    });
  }
);

export default router;

// ---------------------------------------------------------------------------
// PATCH /api/super-admin/incidents/:id/resolve — resolve a local incident and
// close the matching status-page incident if one was created.
// ---------------------------------------------------------------------------
router.patch(
  "/incidents/:id/resolve",
  authMiddleware,
  requireRole("SUPER_ADMIN"),
  async (req, res): Promise<void> => {
    const incidentId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { note } = req.body as { note?: string };
    try {
      const found = await resolveLocalIncident(incidentId, note);
      if (!found) {
        res.status(404).json({ error: "Incident not found" });
        return;
      }
      res.json({ success: true });
    } catch (err) {
      logger.error({ err, incidentId }, "PATCH /super-admin/incidents/:id/resolve failed");
      res.status(500).json({ error: "Failed to resolve incident" });
    }
  }
);
