import { Router, type IRouter } from "express";
import { db, errorLogsTable, requestLogs, featureFlagsTable, auditLogs, aiLogsTable } from "@workspace/db";
import { eq, gte, and, desc, sql, avg, count, countDistinct, isNull } from "drizzle-orm";
import { authMiddleware, requireRole } from "../lib/auth";
import { pool } from "@workspace/db";
import { getAvailableProviders } from "../lib/aiProvider";
import { getMaintenanceStatus } from "../lib/maintenanceMode";
import { getWorkerRuntimeSnapshot } from "../lib/workerRuntimeState";

const router: IRouter = Router();

// GET /api/super-admin/diagnostics
router.get(
  "/diagnostics",
  authMiddleware,
  requireRole("SUPER_ADMIN"),
  async (req, res): Promise<void> => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // --- systemOverview ---
    let dbConnected = false;
    let dbResponseMs = 0;
    try {
      const start = Date.now();
      await pool.query("SELECT 1");
      dbResponseMs = Date.now() - start;
      dbConnected = true;
    } catch {
      dbConnected = false;
    }

    const systemOverview = {
      uptime: process.uptime(),
      nodeVersion: process.version,
      environment: process.env.NODE_ENV || "development",
      dbConnected,
      dbResponseMs,
      gmailConfigured: !!(process.env.GMAIL_CLIENT_ID && process.env.GMAIL_REFRESH_TOKEN),
      openaiConfigured: !!process.env.OPENAI_API_KEY,
      workerRuntime: getWorkerRuntimeSnapshot(),
    };

    // --- last1Hour (from request_logs) ---
    const [hourStats] = await db
      .select({
        totalRequests: count(),
        successRequests: count(
          sql`CASE WHEN ${requestLogs.isError} = false THEN 1 END`
        ),
        errorRequests: count(
          sql`CASE WHEN ${requestLogs.isError} = true THEN 1 END`
        ),
        criticalErrors: count(
          sql`CASE WHEN ${requestLogs.isCritical} = true THEN 1 END`
        ),
        slowRequests: count(
          sql`CASE WHEN ${requestLogs.slowRequest} = true THEN 1 END`
        ),
        avgResponseMs: avg(requestLogs.durationMs),
        uniqueUsers: countDistinct(requestLogs.userId),
      })
      .from(requestLogs)
      .where(gte(requestLogs.timestamp, oneHourAgo));

    const last1Hour = {
      totalRequests: Number(hourStats?.totalRequests ?? 0),
      successRequests: Number(hourStats?.successRequests ?? 0),
      errorRequests: Number(hourStats?.errorRequests ?? 0),
      criticalErrors: Number(hourStats?.criticalErrors ?? 0),
      slowRequests: Number(hourStats?.slowRequests ?? 0),
      avgResponseMs: Math.round(Number(hourStats?.avgResponseMs ?? 0)),
      uniqueUsers: Number(hourStats?.uniqueUsers ?? 0),
    };

    // --- topErrors (last 24h, sorted by occurrenceCount desc, limit 10) ---
    const topErrors = await db
      .select({
        id: errorLogsTable.id,
        errorMessage: errorLogsTable.message,
        route: errorLogsTable.route,
        occurrenceCount: errorLogsTable.occurrenceCount,
        firstSeen: errorLogsTable.createdAt,
        lastSeen: errorLogsTable.lastOccurredAt,
        plainEnglish: errorLogsTable.plainEnglish,
        resolved: errorLogsTable.resolved,
        requestId: errorLogsTable.requestId,
      })
      .from(errorLogsTable)
      .where(gte(errorLogsTable.createdAt, twentyFourHoursAgo))
      .orderBy(desc(errorLogsTable.occurrenceCount))
      .limit(10);

    // --- recentCriticalErrors (last 2h, statusCode >= 500, limit 5) ---
    const recentCriticalErrors = await db
      .select({
        id: errorLogsTable.id,
        timestamp: errorLogsTable.createdAt,
        route: errorLogsTable.route,
        method: errorLogsTable.method,
        errorMessage: errorLogsTable.message,
        stack: errorLogsTable.stack,
        plainEnglish: errorLogsTable.plainEnglish,
        requestId: errorLogsTable.requestId,
        userId: errorLogsTable.userId,
      })
      .from(errorLogsTable)
      .where(
        and(
          gte(errorLogsTable.createdAt, twoHoursAgo),
          gte(errorLogsTable.statusCode, 500)
        )
      )
      .orderBy(desc(errorLogsTable.createdAt))
      .limit(5);

    // Cap stack traces at 800 chars
    const criticalErrorsMapped = recentCriticalErrors.map((e) => ({
      ...e,
      stack: e.stack ? e.stack.substring(0, 800) : null,
    }));

    // --- slowEndpoints (last 24h, avg durationMs > 1000, limit 5) ---
    const slowEndpoints = await db
      .select({
        route: requestLogs.path,
        avgMs: avg(requestLogs.durationMs),
        callCount: count(),
      })
      .from(requestLogs)
      .where(gte(requestLogs.timestamp, twentyFourHoursAgo))
      .groupBy(requestLogs.path)
      .having(sql`avg(${requestLogs.durationMs}) > 1000`)
      .orderBy(desc(avg(requestLogs.durationMs)))
      .limit(5);

    const slowEndpointsMapped = slowEndpoints.map((s) => ({
      route: s.route,
      avgMs: Math.round(Number(s.avgMs ?? 0)),
      callCount: Number(s.callCount),
    }));

    // --- authEvents ---
    const recentAuthFailures = await db
      .select({
        id: errorLogsTable.id,
        timestamp: errorLogsTable.createdAt,
        errorMessage: errorLogsTable.message,
        requestId: errorLogsTable.requestId,
      })
      .from(errorLogsTable)
      .where(
        and(
          gte(errorLogsTable.createdAt, twentyFourHoursAgo),
          sql`(${errorLogsTable.route} LIKE '%/auth%' OR ${errorLogsTable.message} ILIKE '%unauthorized%' OR ${errorLogsTable.message} ILIKE '%invalid token%')`
        )
      )
      .orderBy(desc(errorLogsTable.createdAt))
      .limit(5);

    // Count actual login attempts from request_logs
    const [loginStats] = await db
      .select({
        totalAttempts: count(),
        failedAttempts: count(sql`CASE WHEN ${requestLogs.statusCode} >= 400 THEN 1 END`),
      })
      .from(requestLogs)
      .where(
        and(
          gte(requestLogs.timestamp, twentyFourHoursAgo),
          sql`${requestLogs.path} LIKE '%/auth/login%'`,
          sql`${requestLogs.method} = 'POST'`
        )
      );

    // Count role denials (403s)
    const [roleDenialStats] = await db
      .select({ total: count() })
      .from(requestLogs)
      .where(
        and(
          gte(requestLogs.timestamp, twentyFourHoursAgo),
          eq(requestLogs.statusCode, 403)
        )
      );

    const authEvents = {
      loginAttempts: Number(loginStats?.totalAttempts ?? 0),
      loginFailures: Number(loginStats?.failedAttempts ?? 0),
      roleDenials: Number(roleDenialStats?.total ?? 0),
      recentFailures: recentAuthFailures,
    };

    // --- featureFlags ---
    let featureFlags: { module: string; enabled: boolean }[] = [];
    try {
      featureFlags = await db
        .select({ module: featureFlagsTable.module, enabled: featureFlagsTable.enabled })
        .from(featureFlagsTable)
        .orderBy(featureFlagsTable.module);
    } catch {
      // Graceful fallback if table missing
      featureFlags = [];
    }

    // --- recentActivity (last 20 from request_logs) ---
    const recentActivity = await db
      .select({
        timestamp: requestLogs.timestamp,
        method: requestLogs.method,
        path: requestLogs.path,
        statusCode: requestLogs.statusCode,
        durationMs: requestLogs.durationMs,
        userId: requestLogs.userId,
        requestId: requestLogs.requestId,
      })
      .from(requestLogs)
      .orderBy(desc(requestLogs.timestamp))
      .limit(20);

    // --- allErrorLogs (last 10 days from request_logs where isError, for Error Logs tab) ---
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
    let allErrorLogs: any[] = [];
    try {
      const errorRows = await pool.query(`
        SELECT
          rl.id,
          rl.request_id AS "requestId",
          rl.method,
          rl.path AS route,
          rl.status_code AS "statusCode",
          rl.duration_ms AS "durationMs",
          rl.user_id AS "userId",
          rl.is_error AS "isError",
          rl.is_critical AS "isCritical",
          rl.timestamp AS "createdAt",
          el.message,
          el.stack,
          el.plain_english AS "plainEnglish",
          el.level,
          el.resolved,
          el.resolved_at AS "resolvedAt",
          el.resolved_note AS "resolvedNote",
          el.occurrence_count AS "occurrenceCount"
        FROM request_logs rl
        LEFT JOIN error_logs el ON el.request_id = rl.request_id
        WHERE rl.is_error = true
          AND rl.timestamp >= $1
        ORDER BY rl.timestamp DESC
        LIMIT 200
      `, [tenDaysAgo]);
      allErrorLogs = errorRows.rows;
    } catch {
      allErrorLogs = [];
    }

    // --- dailyChart (last 10 days success/error counts) ---
    let dailyChart: { day: string; success: number; errors: number; total: number }[] = [];
    try {
      const chartRows = await pool.query(`
        SELECT
          TO_CHAR(timestamp, 'YYYY-MM-DD') AS day,
          COUNT(CASE WHEN is_error IS NOT TRUE THEN 1 END)::int AS success,
          COUNT(CASE WHEN is_error = true THEN 1 END)::int AS errors,
          COUNT(*)::int AS total
        FROM request_logs
        WHERE timestamp >= $1
        GROUP BY TO_CHAR(timestamp, 'YYYY-MM-DD')
        ORDER BY day
      `, [tenDaysAgo]);
      dailyChart = chartRows.rows.map((r: any) => ({
        day: String(r.day),
        success: Number(r.success ?? 0),
        errors: Number(r.errors ?? 0),
        total: Number(r.total ?? 0),
      }));
    } catch {
      dailyChart = [];
    }

    res.json({
      generatedAt: now.toISOString(),
      systemOverview,
      last1Hour,
      topErrors,
      recentCriticalErrors: criticalErrorsMapped,
      slowEndpoints: slowEndpointsMapped,
      authEvents,
      featureFlags,
      recentActivity,
      allErrorLogs,
      dailyChart,
    });
  }
);

// PATCH /api/super-admin/errors/:id/resolve
router.patch(
  "/errors/:id/resolve",
  authMiddleware,
  requireRole("ADMIN"),
  async (req, res): Promise<void> => {
    const errorId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { note } = req.body || {};

    const [updated] = await db
      .update(errorLogsTable)
      .set({
        resolved: true,
        resolvedAt: new Date(),
        resolvedNote: note || null,
        resolvedBy: req.user!.id,
      })
      .where(eq(errorLogsTable.id, errorId))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Error log not found" });
      return;
    }

    res.json(updated);
  }
);

// GET /api/super-admin/error-logs — paginated error logs from last 10 days
router.get(
  "/error-logs",
  authMiddleware,
  requireRole("SUPER_ADMIN"),
  async (req, res): Promise<void> => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const [countResult] = await db
      .select({ total: count() })
      .from(errorLogsTable)
      .where(gte(errorLogsTable.createdAt, tenDaysAgo));

    const total = Number(countResult?.total ?? 0);

    const logs = await db
      .select({
        id: errorLogsTable.id,
        level: errorLogsTable.level,
        message: errorLogsTable.message,
        route: errorLogsTable.route,
        method: errorLogsTable.method,
        statusCode: errorLogsTable.statusCode,
        plainEnglish: errorLogsTable.plainEnglish,
        resolved: errorLogsTable.resolved,
        occurrenceCount: errorLogsTable.occurrenceCount,
        lastOccurredAt: errorLogsTable.lastOccurredAt,
        createdAt: errorLogsTable.createdAt,
        userId: errorLogsTable.userId,
        requestId: errorLogsTable.requestId,
      })
      .from(errorLogsTable)
      .where(gte(errorLogsTable.createdAt, tenDaysAgo))
      .orderBy(desc(errorLogsTable.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({ logs, total, page, limit, totalPages: Math.ceil(total / limit) });
  }
);

// GET /api/super-admin/error-logs/:id — single error log detail
router.get(
  "/error-logs/:id",
  authMiddleware,
  requireRole("SUPER_ADMIN"),
  async (req, res): Promise<void> => {
    const errorId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    const [log] = await db
      .select()
      .from(errorLogsTable)
      .where(eq(errorLogsTable.id, errorId))
      .limit(1);

    if (!log) {
      res.status(404).json({ error: "Error log not found" });
      return;
    }

    res.json(log);
  }
);

// GET /api/super-admin/error-chart — daily success/error counts for last 10 days
router.get(
  "/error-chart",
  authMiddleware,
  requireRole("SUPER_ADMIN"),
  async (req, res): Promise<void> => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

    const rows = await db
      .select({
        day: sql<string>`TO_CHAR(${requestLogs.timestamp}, 'YYYY-MM-DD')`,
        success: sql<number>`COUNT(CASE WHEN ${requestLogs.isError} IS NOT TRUE THEN 1 END)`,
        errors: sql<number>`COUNT(CASE WHEN ${requestLogs.isError} = true THEN 1 END)`,
        total: sql<number>`COUNT(*)`,
      })
      .from(requestLogs)
      .where(gte(requestLogs.timestamp, tenDaysAgo))
      .groupBy(sql`TO_CHAR(${requestLogs.timestamp}, 'YYYY-MM-DD')`)
      .orderBy(sql`TO_CHAR(${requestLogs.timestamp}, 'YYYY-MM-DD')`);

    const chart = rows.map((r) => ({
      day: String(r.day),
      success: Number(r.success ?? 0),
      errors: Number(r.errors ?? 0),
      total: Number(r.total ?? 0),
    }));

    res.json(chart);
  }
);

// GET /api/super-admin/pre-deploy-check — verify system readiness before deploy
router.get(
  "/pre-deploy-check",
  authMiddleware,
  requireRole("SUPER_ADMIN"),
  async (req, res): Promise<void> => {
    const checks: { name: string; status: "pass" | "fail" | "warn"; detail: string }[] = [];

    // 1. DB reachable
    try {
      const start = Date.now();
      await pool.query("SELECT 1");
      const ms = Date.now() - start;
      checks.push({ name: "database", status: ms > 500 ? "warn" : "pass", detail: `${ms}ms response` });
    } catch {
      checks.push({ name: "database", status: "fail", detail: "Unreachable" });
    }

    // 2. No active campaigns sending
    try {
      const result = await pool.query("SELECT COUNT(*)::int AS cnt FROM campaigns WHERE status = 'SENDING'");
      const cnt = result.rows[0]?.cnt || 0;
      checks.push({ name: "no_active_campaigns", status: cnt > 0 ? "fail" : "pass", detail: cnt > 0 ? `${cnt} campaign(s) currently SENDING` : "No active sends" });
    } catch {
      checks.push({ name: "no_active_campaigns", status: "warn", detail: "Could not check campaigns table" });
    }

    // 3. Pending remediation runs awaiting approval
    try {
      const result = await pool.query("SELECT COUNT(*)::int AS cnt FROM remediation_runs WHERE status = 'PENDING_APPROVAL'");
      const cnt = result.rows[0]?.cnt || 0;
      checks.push({ name: "no_pending_remediation", status: cnt > 0 ? "warn" : "pass", detail: cnt > 0 ? `${cnt} remediation run(s) awaiting approval` : "No pending remediation runs" });
    } catch {
      checks.push({ name: "no_pending_remediation", status: "warn", detail: "Could not check remediation_runs table" });
    }

    // 4. Worker status — check if any campaign was processed in the last 5 minutes
    try {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
      const [w] = await db
        .select({ timestamp: requestLogs.timestamp })
        .from(requestLogs)
        .where(and(sql`${requestLogs.path} LIKE '%/worker/%'`, gte(requestLogs.timestamp, fiveMinAgo)))
        .orderBy(desc(requestLogs.timestamp))
        .limit(1);
      checks.push({ name: "worker_status", status: w ? "pass" : "warn", detail: w ? `Last seen ${w.timestamp.toISOString()}` : "No worker activity in last 5 minutes" });
    } catch {
      checks.push({ name: "worker_status", status: "warn", detail: "Could not check worker status" });
    }

    // 5. Error rate (last 30 min)
    try {
      const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
      const [stats] = await db
        .select({
          total: count(),
          errors: count(sql`CASE WHEN ${requestLogs.isError} = true THEN 1 END`),
        })
        .from(requestLogs)
        .where(gte(requestLogs.timestamp, thirtyMinAgo));
      const t = Number(stats?.total ?? 0);
      const e = Number(stats?.errors ?? 0);
      const rate = t > 0 ? Math.round((e / t) * 10000) / 100 : 0;
      checks.push({ name: "error_rate_30m", status: rate > 10 ? "fail" : rate > 5 ? "warn" : "pass", detail: `${rate}% error rate (${e}/${t} requests)` });
    } catch {
      checks.push({ name: "error_rate_30m", status: "warn", detail: "Could not calculate error rate" });
    }

    // 6. Active user sessions
    try {
      const result = await pool.query("SELECT COUNT(*)::int AS cnt FROM sessions WHERE expires_at > NOW()");
      const cnt = result.rows[0]?.cnt || 0;
      checks.push({ name: "active_sessions", status: "pass", detail: `${cnt} active session(s)` });
    } catch {
      checks.push({ name: "active_sessions", status: "warn", detail: "Could not check active sessions" });
    }

    // 7. Last successful backup
    try {
      const result = await pool.query("SELECT created_at FROM backups WHERE status = 'completed' ORDER BY created_at DESC LIMIT 1");
      const lastBackup = result.rows[0]?.created_at;
      if (lastBackup) {
        const hoursSince = Math.round((Date.now() - new Date(lastBackup).getTime()) / (1000 * 60 * 60));
        checks.push({ name: "last_backup", status: hoursSince > 24 ? "warn" : "pass", detail: `Last backup ${hoursSince}h ago (${lastBackup})` });
      } else {
        checks.push({ name: "last_backup", status: "warn", detail: "No completed backup found — take one before deploying" });
      }
    } catch {
      checks.push({ name: "last_backup", status: "warn", detail: "Could not check backup status (backups table may not exist)" });
    }

    // 8. Unresolved critical errors
    try {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
      const [u] = await db
        .select({ total: count() })
        .from(errorLogsTable)
        .where(and(eq(errorLogsTable.resolved, false), gte(errorLogsTable.createdAt, fiveMinAgo)));
      const cnt = Number(u?.total ?? 0);
      checks.push({ name: "recent_unresolved_errors", status: cnt > 5 ? "warn" : "pass", detail: `${cnt} in last 5 minutes` });
    } catch {
      checks.push({ name: "recent_unresolved_errors", status: "warn", detail: "Could not check" });
    }

    // 9. Maintenance mode status
    const maint = getMaintenanceStatus();
    checks.push({ name: "maintenance_mode", status: "pass", detail: maint.enabled ? "ENABLED (good for deploy)" : "DISABLED — consider enabling before deploy" });

    // 10. Required env vars
    const requiredVars = ["DATABASE_URL", "JWT_SECRET", "WORKER_SECRET"];
    const missingVars = requiredVars.filter(v => !process.env[v]);
    checks.push({ name: "env_vars", status: missingVars.length > 0 ? "fail" : "pass", detail: missingVars.length > 0 ? `Missing: ${missingVars.join(", ")}` : "All required vars set" });

    const overallStatus = checks.some(c => c.status === "fail") ? "NO-GO" : checks.some(c => c.status === "warn") ? "GO" : "GO";

    res.json({ status: overallStatus, checks, timestamp: new Date().toISOString() });
  }
);

// GET /api/super-admin/ops-snapshot — operational snapshot for incident response
router.get(
  "/ops-snapshot",
  authMiddleware,
  requireRole("SUPER_ADMIN"),
  async (req, res): Promise<void> => {
    const now = new Date();
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Server vitals
    const mem = process.memoryUsage();
    const serverVitals = {
      uptime: process.uptime(),
      nodeVersion: process.version,
      environment: process.env.NODE_ENV || "development",
      heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
      rssMB: Math.round(mem.rss / 1024 / 1024),
    };

    // DB reachability
    let dbPingMs = -1;
    try {
      const start = Date.now();
      await pool.query("SELECT 1");
      dbPingMs = Date.now() - start;
    } catch { /* unreachable */ }

    // Worker last seen
    let workerLastSeen: string | null = null;
    try {
      const [w] = await db
        .select({ timestamp: requestLogs.timestamp })
        .from(requestLogs)
        .where(sql`${requestLogs.path} LIKE '%/worker/%'`)
        .orderBy(desc(requestLogs.timestamp))
        .limit(1);
      if (w) workerLastSeen = w.timestamp.toISOString();
    } catch { /* ignore */ }

    // AI providers
    const aiProviders = getAvailableProviders();

    // Error rate (last 5 min)
    let errorRate5m = { total: 0, errors: 0, rate: 0 };
    try {
      const [stats] = await db
        .select({
          total: count(),
          errors: count(sql`CASE WHEN ${requestLogs.isError} = true THEN 1 END`),
        })
        .from(requestLogs)
        .where(gte(requestLogs.timestamp, fiveMinAgo));
      const t = Number(stats?.total ?? 0);
      const e = Number(stats?.errors ?? 0);
      errorRate5m = { total: t, errors: e, rate: t > 0 ? Math.round((e / t) * 10000) / 100 : 0 };
    } catch { /* ignore */ }

    // Slow requests (last 1h)
    let slowCount1h = 0;
    try {
      const [s] = await db
        .select({ total: count() })
        .from(requestLogs)
        .where(and(gte(requestLogs.timestamp, oneHourAgo), gte(requestLogs.durationMs, 2000)));
      slowCount1h = Number(s?.total ?? 0);
    } catch { /* ignore */ }

    // Unresolved errors
    let unresolvedErrors = 0;
    try {
      const [u] = await db
        .select({ total: count() })
        .from(errorLogsTable)
        .where(eq(errorLogsTable.resolved, false));
      unresolvedErrors = Number(u?.total ?? 0);
    } catch { /* ignore */ }

    // Feature flags summary
    let flagsSummary: { total: number; enabled: number; disabled: number } = { total: 0, enabled: 0, disabled: 0 };
    try {
      const flags = await db.select({ enabled: featureFlagsTable.enabled }).from(featureFlagsTable);
      flagsSummary = {
        total: flags.length,
        enabled: flags.filter(f => f.enabled).length,
        disabled: flags.filter(f => !f.enabled).length,
      };
    } catch { /* ignore */ }

    // Recent audit log entries (last 10)
    let recentAuditEntries: any[] = [];
    try {
      recentAuditEntries = await db
        .select({
          id: auditLogs.id,
          tenantId: auditLogs.tenantId,
          userId: auditLogs.userId,
          action: auditLogs.action,
          entityType: auditLogs.entityType,
          entityId: auditLogs.entityId,
          route: auditLogs.route,
          createdAt: auditLogs.createdAt,
        })
        .from(auditLogs)
        .orderBy(desc(auditLogs.createdAt))
        .limit(10);
    } catch { /* table may not exist yet */ }

    // Login attempts (last 24h)
    let loginAttempts24h = { total: 0, failed: 0 };
    try {
      const [la] = await db
        .select({
          total: count(),
          failed: count(sql`CASE WHEN ${requestLogs.statusCode} >= 400 THEN 1 END`),
        })
        .from(requestLogs)
        .where(and(
          gte(requestLogs.timestamp, twentyFourHoursAgo),
          sql`${requestLogs.path} LIKE '%/auth/login%'`,
          sql`${requestLogs.method} = 'POST'`
        ));
      loginAttempts24h = { total: Number(la?.total ?? 0), failed: Number(la?.failed ?? 0) };
    } catch { /* ignore */ }

    // Error rates (1h, 6h, 24h)
    const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);
    let errorRates = { last1h: 0, last6h: 0, last24h: 0 };
    try {
      const [r1h] = await db.select({ total: count() }).from(requestLogs).where(and(gte(requestLogs.timestamp, oneHourAgo), eq(requestLogs.isError, true)));
      const [r6h] = await db.select({ total: count() }).from(requestLogs).where(and(gte(requestLogs.timestamp, sixHoursAgo), eq(requestLogs.isError, true)));
      const [r24h] = await db.select({ total: count() }).from(requestLogs).where(and(gte(requestLogs.timestamp, twentyFourHoursAgo), eq(requestLogs.isError, true)));
      errorRates = { last1h: Number(r1h?.total ?? 0), last6h: Number(r6h?.total ?? 0), last24h: Number(r24h?.total ?? 0) };
    } catch { /* ignore */ }

    // Active users (last 1h)
    let activeUsersLast1h = 0;
    try {
      const [u] = await db.select({ total: countDistinct(requestLogs.userId) }).from(requestLogs).where(gte(requestLogs.timestamp, oneHourAgo));
      activeUsersLast1h = Number(u?.total ?? 0);
    } catch { /* ignore */ }

    // Last 5 errors
    let lastFiveErrors: Array<{ route: string | null; message: string; timestamp: string; userId: string | null }> = [];
    try {
      const errors = await db.select({
        route: errorLogsTable.route,
        message: errorLogsTable.message,
        timestamp: errorLogsTable.createdAt,
        userId: errorLogsTable.userId,
      }).from(errorLogsTable).orderBy(desc(errorLogsTable.createdAt)).limit(5);
      lastFiveErrors = errors.map(e => ({ route: e.route, message: e.message, timestamp: (e.timestamp as Date).toISOString(), userId: e.userId }));
    } catch { /* ignore */ }

    // AI stats (last 24h)
    let aiStats = { callsLast24h: 0, avgLatencyLast24h: 0 };
    try {
      const [a] = await db.select({
        total: count(),
        avgLatency: avg(aiLogsTable.latencyMs),
      }).from(aiLogsTable).where(gte(aiLogsTable.createdAt, twentyFourHoursAgo));
      aiStats = { callsLast24h: Number(a?.total ?? 0), avgLatencyLast24h: Math.round(Number(a?.avgLatency ?? 0)) };
    } catch { /* ignore */ }

    let tenantHealth: Array<{
      tenantId: string;
      tenantName: string;
      status: string;
      userCount: number;
      recentErrorCount: number;
      lastActivityAt: string | null;
      remediation: {
        pendingApproval: number;
        failed: number;
        executed: number;
        lastRunAt: string | null;
      };
    }> = [];
    let remediationSummary: {
      byTenant: Array<{
        tenantId: string;
        tenantName: string;
        status: string;
        pendingApproval: number;
        failed: number;
        executed: number;
        lastRunAt: string | null;
      }>;
      totals: {
        pendingApproval: number;
        failed: number;
        executed: number;
      };
    } = {
      byTenant: [],
      totals: { pendingApproval: 0, failed: 0, executed: 0 },
    };

    try {
      const tenantHealthResult = await pool.query<{
        tenantId: string;
        tenantName: string;
        tenantStatus: string;
        userCount: number | string;
        recentErrorCount: number | string;
        lastRequestAt: string | Date | null;
        lastAuditAt: string | Date | null;
        pendingRemediationCount: number | string;
        failedRemediationCount: number | string;
        executedRemediationCount: number | string;
        lastRemediationAt: string | Date | null;
      }>(
        `
          WITH active_tenants AS (
            SELECT id, name, status
            FROM tenants
            WHERE active = true
          ),
          user_counts AS (
            SELECT tenant_id, COUNT(*)::int AS user_count
            FROM users
            WHERE tenant_id IS NOT NULL
            GROUP BY tenant_id
          ),
          recent_errors AS (
            SELECT u.tenant_id, COUNT(*)::int AS recent_error_count
            FROM error_logs el
            INNER JOIN users u ON u.id = el.user_id
            WHERE el.created_at >= $1
              AND u.tenant_id IS NOT NULL
            GROUP BY u.tenant_id
          ),
          last_requests AS (
            SELECT u.tenant_id, MAX(rl.timestamp) AS last_request_at
            FROM request_logs rl
            INNER JOIN users u ON u.id = rl.user_id
            WHERE u.tenant_id IS NOT NULL
            GROUP BY u.tenant_id
          ),
          last_audits AS (
            SELECT tenant_id, MAX(created_at) AS last_audit_at
            FROM audit_logs
            WHERE tenant_id IS NOT NULL
            GROUP BY tenant_id
          ),
          remediation_counts AS (
            SELECT
              tenant_id,
              COUNT(*) FILTER (WHERE status = 'PENDING_APPROVAL')::int AS pending_approval_count,
              COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failed_count,
              COUNT(*) FILTER (WHERE status = 'EXECUTED')::int AS executed_count,
              MAX(created_at) AS last_remediation_at
            FROM remediation_runs
            WHERE tenant_id IS NOT NULL
            GROUP BY tenant_id
          )
          SELECT
            t.id AS "tenantId",
            t.name AS "tenantName",
            t.status AS "tenantStatus",
            COALESCE(uc.user_count, 0) AS "userCount",
            COALESCE(re.recent_error_count, 0) AS "recentErrorCount",
            lr.last_request_at AS "lastRequestAt",
            la.last_audit_at AS "lastAuditAt",
            COALESCE(rc.pending_approval_count, 0) AS "pendingRemediationCount",
            COALESCE(rc.failed_count, 0) AS "failedRemediationCount",
            COALESCE(rc.executed_count, 0) AS "executedRemediationCount",
            rc.last_remediation_at AS "lastRemediationAt"
          FROM active_tenants t
          LEFT JOIN user_counts uc ON uc.tenant_id = t.id
          LEFT JOIN recent_errors re ON re.tenant_id = t.id
          LEFT JOIN last_requests lr ON lr.tenant_id = t.id
          LEFT JOIN last_audits la ON la.tenant_id = t.id
          LEFT JOIN remediation_counts rc ON rc.tenant_id = t.id
          ORDER BY t.name ASC
        `,
        [twentyFourHoursAgo]
      );

      tenantHealth = tenantHealthResult.rows.map((row) => {
        const activityTimes = [row.lastRequestAt, row.lastAuditAt, row.lastRemediationAt]
          .filter((value): value is string | Date => value !== null)
          .map((value) => new Date(value).getTime())
          .filter((value) => Number.isFinite(value));

        const lastRunAt = row.lastRemediationAt ? new Date(row.lastRemediationAt).toISOString() : null;

        return {
          tenantId: row.tenantId,
          tenantName: row.tenantName,
          status: row.tenantStatus,
          userCount: Number(row.userCount ?? 0),
          recentErrorCount: Number(row.recentErrorCount ?? 0),
          lastActivityAt: activityTimes.length > 0 ? new Date(Math.max(...activityTimes)).toISOString() : null,
          remediation: {
            pendingApproval: Number(row.pendingRemediationCount ?? 0),
            failed: Number(row.failedRemediationCount ?? 0),
            executed: Number(row.executedRemediationCount ?? 0),
            lastRunAt,
          },
        };
      });

      remediationSummary = {
        byTenant: tenantHealth.map((tenant) => ({
          tenantId: tenant.tenantId,
          tenantName: tenant.tenantName,
          status: tenant.status,
          pendingApproval: tenant.remediation.pendingApproval,
          failed: tenant.remediation.failed,
          executed: tenant.remediation.executed,
          lastRunAt: tenant.remediation.lastRunAt,
        })),
        totals: tenantHealth.reduce(
          (totals, tenant) => ({
            pendingApproval: totals.pendingApproval + tenant.remediation.pendingApproval,
            failed: totals.failed + tenant.remediation.failed,
            executed: totals.executed + tenant.remediation.executed,
          }),
          { pendingApproval: 0, failed: 0, executed: 0 }
        ),
      };
    } catch { /* ignore */ }

    res.json({
      generatedAt: now.toISOString(),
      serverVitals,
      reachability: {
        database: { pingMs: dbPingMs, status: dbPingMs >= 0 ? (dbPingMs > 500 ? "slow" : "ok") : "down" },
        worker: { lastSeen: workerLastSeen, status: workerLastSeen ? "seen" : "unknown" },
        aiProviders,
      },
      errorRate5m,
      slowRequests1h: slowCount1h,
      unresolvedErrors,
      featureFlags: flagsSummary,
      loginAttempts24h,
      recentAuditEntries,
      errorRates,
      activeUsersLast1h,
      lastFiveErrors,
      aiStats,
      workerRuntime: getWorkerRuntimeSnapshot(),
      tenantHealth,
      remediationSummary,
    });
  }
);

export default router;
