import { Router, type IRouter } from "express";
import { db, errorLogsTable, requestLogs, remediationRunsTable, sessionsTable } from "@workspace/db";
import { sql, count, gte, desc, eq, and } from "drizzle-orm";
import { authMiddleware } from "../lib/auth";
import { chatCompletion } from "../lib/aiProvider";
import { getDefaultProvider, getDefaultModel } from "../lib/aiModels";
import { firePolicyFromTrigger, POLICY_NAMES } from "../lib/remediationEngine";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const superAdminOnly = (req: any, res: any, next: any) => {
  if (req.user?.role !== "SUPER_ADMIN") {
    res.status(403).json({ error: "Super Admin only" });
    return;
  }
  next();
};

const serverStartTime = Date.now();

// ---------------------------------------------------------------------------
// GET /api/super-admin/health/summary
// ---------------------------------------------------------------------------
router.get("/health/summary", authMiddleware, superAdminOnly, async (_req, res): Promise<void> => {
  try {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const fifteenMinAgo = new Date(now.getTime() - 15 * 60 * 1000);
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    // DB connectivity check
    let dbConnectionsOk = true;
    try {
      await db.execute(sql`SELECT 1`);
    } catch {
      dbConnectionsOk = false;
    }

    // Request stats last hour
    const [reqStats] = await db
      .select({
        total: count(),
        errors: sql<number>`SUM(CASE WHEN ${requestLogs.isError} = true THEN 1 ELSE 0 END)::int`,
        p95: sql<number>`PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ${requestLogs.durationMs})::int`,
      })
      .from(requestLogs)
      .where(gte(requestLogs.timestamp, oneHourAgo));

    const requestsLastHour = Number(reqStats?.total ?? 0);
    const errorsLastHour = Number(reqStats?.errors ?? 0);
    const errorRate = requestsLastHour > 0 ? (errorsLastHour / requestsLastHour) * 100 : 0;
    const p95ResponseMs = Number(reqStats?.p95 ?? 0);

    // Error rate over last 15 min for status reason
    const [recentReqStats] = await db
      .select({
        total: count(),
        errors: sql<number>`SUM(CASE WHEN ${requestLogs.isError} = true THEN 1 ELSE 0 END)::int`,
      })
      .from(requestLogs)
      .where(gte(requestLogs.timestamp, fifteenMinAgo));

    const recentTotal = Number(recentReqStats?.total ?? 0);
    const recentErrors = Number(recentReqStats?.errors ?? 0);
    const recentErrorRate = recentTotal > 0 ? (recentErrors / recentTotal) * 100 : 0;

    // Active sessions
    const [sessionCount] = await db
      .select({ cnt: count() })
      .from(sessionsTable)
      .where(gte(sessionsTable.expiresAt, now));
    const activeSessions = Number(sessionCount?.cnt ?? 0);

    // Remediation stats today
    const [remStats] = await db
      .select({
        runs: count(),
        fixed: sql<number>`SUM(CASE WHEN ${remediationRunsTable.status} = 'EXECUTED' THEN 1 ELSE 0 END)::int`,
      })
      .from(remediationRunsTable)
      .where(gte(remediationRunsTable.createdAt, todayStart));

    const remediationRunsToday = Number(remStats?.runs ?? 0);
    const autoFixedToday = Number(remStats?.fixed ?? 0);

    // Active tenants today (distinct userId requests)
    const [tenantStats] = await db
      .select({ cnt: sql<number>`COUNT(DISTINCT ${requestLogs.userId})::int` })
      .from(requestLogs)
      .where(and(gte(requestLogs.timestamp, todayStart), sql`${requestLogs.userId} IS NOT NULL`));
    const activeTenantsToday = Number(tenantStats?.cnt ?? 0);

    // Status logic per master plan
    let systemStatus: "healthy" | "degraded" | "critical";
    let statusReason: string;

    if (!dbConnectionsOk || errorRate > 5 || p95ResponseMs > 3000) {
      systemStatus = "critical";
      if (!dbConnectionsOk) statusReason = "Database connection failed";
      else if (errorRate > 5) statusReason = `Error rate ${errorRate.toFixed(1)}% over last hour`;
      else statusReason = `P95 response time ${p95ResponseMs}ms exceeds 3000ms threshold`;
    } else if (errorRate >= 1 || p95ResponseMs >= 1000) {
      systemStatus = "degraded";
      if (errorRate >= 1) statusReason = `Error rate ${recentErrorRate.toFixed(1)}% over last 15 min`;
      else statusReason = `P95 response time ${p95ResponseMs}ms elevated`;
    } else {
      systemStatus = "healthy";
      statusReason = "All systems operating normally";
    }

    const uptime = Math.floor((Date.now() - serverStartTime) / 1000);

    res.json({
      systemStatus,
      statusReason,
      uptime,
      requestsLastHour,
      errorsLastHour,
      errorRate: Math.round(errorRate * 100) / 100,
      p95ResponseMs,
      activeSessions,
      remediationRunsToday,
      autoFixedToday,
      activeTenantsToday,
      dbConnectionsOk,
    });
  } catch (err) {
    logger.error({ err }, "health/summary failed");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/super-admin/health/errors
// ---------------------------------------------------------------------------
router.get("/health/errors", authMiddleware, superAdminOnly, async (req, res): Promise<void> => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const offset = (page - 1) * limit;
    const statusFilter = req.query.status as string | undefined;
    const moduleFilter = req.query.module as string | undefined;

    const conditions: any[] = [];
    if (statusFilter === "new") conditions.push(eq(errorLogsTable.resolved, false));
    if (statusFilter === "resolved") conditions.push(eq(errorLogsTable.resolved, true));
    if (moduleFilter) conditions.push(sql`${errorLogsTable.route} LIKE ${`%/${moduleFilter}/%`} OR ${errorLogsTable.route} LIKE ${`%/${moduleFilter}`}`);

    const rows = await db
      .select({
        id: errorLogsTable.id,
        message: errorLogsTable.message,
        level: errorLogsTable.level,
        route: errorLogsTable.route,
        stack: errorLogsTable.stack,
        plainEnglish: errorLogsTable.plainEnglish,
        resolved: errorLogsTable.resolved,
        resolvedAt: errorLogsTable.resolvedAt,
        resolvedNote: errorLogsTable.resolvedNote,
        occurrenceCount: errorLogsTable.occurrenceCount,
        lastOccurredAt: errorLogsTable.lastOccurredAt,
        createdAt: errorLogsTable.createdAt,
        statusCode: errorLogsTable.statusCode,
        metadata: errorLogsTable.metadata,
      })
      .from(errorLogsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(errorLogsTable.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({ errors: rows, page, limit });
  } catch (err) {
    logger.error({ err }, "health/errors failed");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/super-admin/health/requests?minutes=60
// ---------------------------------------------------------------------------
router.get("/health/requests", authMiddleware, superAdminOnly, async (req, res): Promise<void> => {
  try {
    const minutes = Math.min(Number(req.query.minutes) || 60, 1440);
    const since = new Date(Date.now() - minutes * 60 * 1000);

    const rows = await db
      .select({
        minute: sql<string>`date_trunc('minute', ${requestLogs.timestamp})::text`,
        total: count(),
        errors: sql<number>`SUM(CASE WHEN ${requestLogs.isError} = true THEN 1 ELSE 0 END)::int`,
        avgDurationMs: sql<number>`AVG(${requestLogs.durationMs})::int`,
      })
      .from(requestLogs)
      .where(gte(requestLogs.timestamp, since))
      .groupBy(sql`date_trunc('minute', ${requestLogs.timestamp})`)
      .orderBy(sql`date_trunc('minute', ${requestLogs.timestamp})`);

    res.json({ buckets: rows, minutes });
  } catch (err) {
    logger.error({ err }, "health/requests failed");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/super-admin/health/module-status
// ---------------------------------------------------------------------------
router.get("/health/module-status", authMiddleware, superAdminOnly, async (_req, res): Promise<void> => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const rows = await db
      .select({
        path: requestLogs.path,
        total: count(),
        errors: sql<number>`SUM(CASE WHEN ${requestLogs.isError} = true THEN 1 ELSE 0 END)::int`,
        lastErrorAt: sql<string | null>`MAX(CASE WHEN ${requestLogs.isError} = true THEN ${requestLogs.timestamp} END)::text`,
      })
      .from(requestLogs)
      .where(gte(requestLogs.timestamp, todayStart))
      .groupBy(requestLogs.path);

    // Aggregate by module (first path segment after /api/)
    const moduleMap = new Map<string, { requestsToday: number; errorsToday: number; lastErrorAt: string | null }>();
    for (const row of rows) {
      const parts = (row.path || "").replace(/^\/api\//, "").split("/");
      const moduleKey = parts[0] || "unknown";
      const existing = moduleMap.get(moduleKey) ?? { requestsToday: 0, errorsToday: 0, lastErrorAt: null };
      existing.requestsToday += Number(row.total);
      existing.errorsToday += Number(row.errors);
      if (row.lastErrorAt && (!existing.lastErrorAt || row.lastErrorAt > existing.lastErrorAt)) {
        existing.lastErrorAt = row.lastErrorAt;
      }
      moduleMap.set(moduleKey, existing);
    }

    const modules = Array.from(moduleMap.entries()).map(([moduleKey, stats]) => {
      const errorRate = stats.requestsToday > 0 ? (stats.errorsToday / stats.requestsToday) * 100 : 0;
      return { moduleKey, ...stats, errorRate: Math.round(errorRate * 100) / 100 };
    });

    res.json({ modules });
  } catch (err) {
    logger.error({ err }, "health/module-status failed");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/super-admin/health/errors/:errorId/explain
// ---------------------------------------------------------------------------
router.post("/health/errors/:errorId/explain", authMiddleware, superAdminOnly, async (req, res): Promise<void> => {
  const errorId = req.params.errorId as string;
  try {
    const [errorLog] = await db
      .select()
      .from(errorLogsTable)
      .where(eq(errorLogsTable.id, errorId))
      .limit(1);

    if (!errorLog) {
      res.status(404).json({ error: "Error log not found" });
      return;
    }

    // If already explained, return cached
    if (errorLog.plainEnglish) {
      res.json({ explanation: errorLog.plainEnglish, cached: true });
      return;
    }

    const prompt = `You are a technical support specialist helping a non-programmer understand system errors. Be clear, concise, and use simple language. Never use jargon without explaining it.\n\nExplain this error in plain English and give step-by-step fix instructions:\n\nError: ${errorLog.message}\nRoute: ${errorLog.route ?? "unknown"}\nStack trace:\n${errorLog.stack ?? "No stack trace available"}`;

    const result = await chatCompletion({
      prompt,
      provider: getDefaultProvider(),
      model: getDefaultModel(),
    });

    await db
      .update(errorLogsTable)
      .set({ plainEnglish: result.content })
      .where(eq(errorLogsTable.id, errorId));

    res.json({ explanation: result.content, cached: false });
  } catch (err) {
    logger.error({ err, errorId }, "health/errors/explain failed");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/super-admin/health/errors/:errorId/status
// ---------------------------------------------------------------------------
router.post("/health/errors/:errorId/status", authMiddleware, superAdminOnly, async (req, res): Promise<void> => {
  const errorId = req.params.errorId as string;
  const { status, note } = req.body as { status: string; note?: string };

  const validStatuses = ["investigating", "fixed", "ignored"];
  if (!validStatuses.includes(status)) {
    res.status(400).json({ error: `status must be one of: ${validStatuses.join(", ")}` });
    return;
  }

  try {
    const resolved = status === "fixed" || status === "ignored";
    const [updated] = await db
      .update(errorLogsTable)
      .set({
        resolved,
        resolvedAt: resolved ? new Date() : null,
        resolvedNote: note ?? status,
        resolvedBy: req.user!.id,
      })
      .where(eq(errorLogsTable.id, errorId))
      .returning({ id: errorLogsTable.id });

    if (!updated) {
      res.status(404).json({ error: "Error log not found" });
      return;
    }

    res.json({ success: true, status });
  } catch (err) {
    logger.error({ err, errorId }, "health/errors/status failed");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/super-admin/health/remediation/run
// ---------------------------------------------------------------------------
router.post("/health/remediation/run", authMiddleware, superAdminOnly, async (req, res): Promise<void> => {
  try {
    const policyNames = Object.values(POLICY_NAMES);
    const results: Array<{ name: string; status: string }> = [];

    for (const name of policyNames) {
      try {
        const run = await firePolicyFromTrigger(name, { targetId: "manual", source: "health_dashboard" }, req.user!.id);
        results.push({ name, status: run ? "triggered" : "skipped" });
      } catch (policyErr: any) {
        results.push({ name, status: "error" });
      }
    }

    const triggered = results.filter((r) => r.status === "triggered").length;
    res.json({ ran: triggered, results });
  } catch (err) {
    logger.error({ err }, "health/remediation/run failed");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
