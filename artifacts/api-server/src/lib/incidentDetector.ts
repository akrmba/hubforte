import { db, requestLogs, errorLogsTable, usersTable } from "@workspace/db";
import { sql, count, gte, and, eq, lt, desc } from "drizzle-orm";
import { notifyIncident, isRecentlyAlerted } from "./incidentNotifier";
import { logger } from "./logger";

const DETECTION_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
let detectorHandle: ReturnType<typeof setInterval> | null = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function getErrorRate(windowMs: number): Promise<{ total: number; errors: number; rate: number }> {
  const since = new Date(Date.now() - windowMs);
  const [stats] = await db
    .select({
      total: count(),
      errors: sql<number>`SUM(CASE WHEN ${requestLogs.isError} = true THEN 1 ELSE 0 END)::int`,
    })
    .from(requestLogs)
    .where(gte(requestLogs.timestamp, since));

  const total = Number(stats?.total ?? 0);
  const errors = Number(stats?.errors ?? 0);
  return { total, errors, rate: total > 0 ? (errors / total) * 100 : 0 };
}

async function getAvgResponseMs(windowMs: number): Promise<number> {
  const since = new Date(Date.now() - windowMs);
  const [stats] = await db
    .select({ avg: sql<number>`AVG(${requestLogs.durationMs})::int` })
    .from(requestLogs)
    .where(gte(requestLogs.timestamp, since));
  return Number(stats?.avg ?? 0);
}

async function getP95ResponseMs(windowMs: number): Promise<number> {
  const since = new Date(Date.now() - windowMs);
  const [stats] = await db
    .select({ p95: sql<number>`PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ${requestLogs.durationMs})::int` })
    .from(requestLogs)
    .where(gte(requestLogs.timestamp, since));
  return Number(stats?.p95 ?? 0);
}

async function checkDbConnection(): Promise<boolean> {
  try {
    await db.execute(sql`SELECT 1`);
    return true;
  } catch {
    return false;
  }
}

async function getAffectedTenantIds(windowMs: number): Promise<string[]> {
  const since = new Date(Date.now() - windowMs);
  const rows = await db
    .select({ tenantId: usersTable.tenantId })
    .from(requestLogs)
    .leftJoin(usersTable, eq(requestLogs.userId, usersTable.id))
    .where(and(gte(requestLogs.timestamp, since), eq(requestLogs.isError, true)))
    .groupBy(usersTable.tenantId);
  return rows.map((r) => r.tenantId).filter((id): id is string => !!id);
}

// ---------------------------------------------------------------------------
// P1 — CRITICAL checks
// ---------------------------------------------------------------------------
async function checkP1(): Promise<void> {
  // 1. Error rate > 10% in last 10 minutes
  const { total, errors, rate } = await getErrorRate(10 * 60 * 1000);
  if (total >= 10 && rate > 10) {
    const condition = "high_error_rate_p1";
    if (!(await isRecentlyAlerted(condition))) {
      const tenantIds = await getAffectedTenantIds(10 * 60 * 1000);
      await notifyIncident({
        severity: "P1",
        condition,
        message: `System error rate is ${rate.toFixed(1)}% over the last 10 minutes (${errors}/${total} requests failed).`,
        errorRate: rate,
        tenantIdsAffected: tenantIds,
      });
    }
    return; // Don't stack P1 alerts in same cycle
  }

  // 2. Any 500 error on /api/auth/* routes
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
  const [authError] = await db
    .select({ id: requestLogs.id })
    .from(requestLogs)
    .where(
      and(
        gte(requestLogs.timestamp, tenMinAgo),
        eq(requestLogs.statusCode, 500),
        sql`${requestLogs.path} LIKE '/api/auth/%'`
      )
    )
    .limit(1);

  if (authError) {
    const condition = "auth_500_error";
    if (!(await isRecentlyAlerted(condition))) {
      await notifyIncident({
        severity: "P1",
        condition,
        message: "A 500 error was detected on an authentication route (/api/auth/*). Users may be unable to log in.",
      });
    }
    return;
  }

  // 3. Database connection failure
  const dbOk = await checkDbConnection();
  if (!dbOk) {
    const condition = "db_connection_failure";
    if (!(await isRecentlyAlerted(condition))) {
      await notifyIncident({
        severity: "P1",
        condition,
        message: "Database connection check failed. The system cannot read or write data.",
      });
    }
    return;
  }

  // 4. Worker unresponsive > 30 minutes
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
  const [workerReq] = await db
    .select({ timestamp: requestLogs.timestamp })
    .from(requestLogs)
    .where(and(sql`${requestLogs.path} LIKE '%/worker/%'`, gte(requestLogs.timestamp, thirtyMinAgo)))
    .orderBy(desc(requestLogs.timestamp))
    .limit(1);

  if (!workerReq) {
    // Only alert if there was worker activity before (avoid false positives on fresh installs)
    const [anyWorker] = await db
      .select({ id: requestLogs.id })
      .from(requestLogs)
      .where(sql`${requestLogs.path} LIKE '%/worker/%'`)
      .limit(1);

    if (anyWorker) {
      const condition = "worker_unresponsive";
      if (!(await isRecentlyAlerted(condition))) {
        await notifyIncident({
          severity: "P1",
          condition,
          message: "The background worker has not responded in over 30 minutes. Scheduled jobs may not be running.",
        });
      }
    }
  }

  // 5. Any 503 responses in last 5 minutes
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
  const [req503] = await db
    .select({ id: requestLogs.id })
    .from(requestLogs)
    .where(and(gte(requestLogs.timestamp, fiveMinAgo), eq(requestLogs.statusCode, 503)))
    .limit(1);

  if (req503) {
    const condition = "service_unavailable_503";
    if (!(await isRecentlyAlerted(condition))) {
      await notifyIncident({
        severity: "P1",
        condition,
        message: "503 Service Unavailable responses detected in the last 5 minutes. The service may be overloaded.",
      });
    }
  }
}

// ---------------------------------------------------------------------------
// P2 — HIGH checks
// ---------------------------------------------------------------------------
async function checkP2(): Promise<void> {
  // 1. Error rate 5-10% for 15+ minutes
  const { total, errors, rate } = await getErrorRate(15 * 60 * 1000);
  if (total >= 20 && rate >= 5 && rate <= 10) {
    const condition = "elevated_error_rate_p2";
    if (!(await isRecentlyAlerted(condition))) {
      const tenantIds = await getAffectedTenantIds(15 * 60 * 1000);
      await notifyIncident({
        severity: "P2",
        condition,
        message: `Error rate is ${rate.toFixed(1)}% over the last 15 minutes (${errors}/${total} requests failed). Trending towards critical.`,
        errorRate: rate,
        tenantIdsAffected: tenantIds,
      });
    }
  }

  // 2. Avg response time > 3 seconds for 10+ minutes
  const avgMs = await getAvgResponseMs(10 * 60 * 1000);
  if (avgMs > 3000) {
    const condition = "slow_avg_response_p2";
    if (!(await isRecentlyAlerted(condition))) {
      await notifyIncident({
        severity: "P2",
        condition,
        message: `Average response time is ${avgMs}ms over the last 10 minutes, exceeding the 3000ms threshold.`,
      });
    }
  }

  // 3. Any module with > 30% error rate today (grouped by module key, not raw path)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const pathStats = await db
    .select({
      path: requestLogs.path,
      total: count(),
      errors: sql<number>`SUM(CASE WHEN ${requestLogs.isError} = true THEN 1 ELSE 0 END)::int`,
    })
    .from(requestLogs)
    .where(gte(requestLogs.timestamp, todayStart))
    .groupBy(requestLogs.path);

  // Aggregate per module key (first segment after /api/)
  const moduleAgg = new Map<string, { total: number; errors: number }>();
  for (const row of pathStats) {
    const key = (row.path || "").replace(/^\/api\//, "").split("/")[0] || "unknown";
    const existing = moduleAgg.get(key) ?? { total: 0, errors: 0 };
    existing.total += Number(row.total);
    existing.errors += Number(row.errors);
    moduleAgg.set(key, existing);
  }

  for (const [moduleKey, stats] of moduleAgg) {
    if (stats.total >= 10 && stats.errors / stats.total > 0.3) {
      const condition = `module_high_error_rate_${moduleKey}`;
      if (!(await isRecentlyAlerted(condition))) {
        await notifyIncident({
          severity: "P2",
          condition,
          message: `Module "${moduleKey}" has a ${((stats.errors / stats.total) * 100).toFixed(1)}% error rate today (${stats.errors}/${stats.total} requests failed).`,
          errorRate: (stats.errors / stats.total) * 100,
        });
      }
      break; // One P2 per cycle for module errors
    }
  }

  // 4. Auth token failures spiking (> 20 in 5 minutes)
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
  const [authFailStats] = await db
    .select({ cnt: count() })
    .from(requestLogs)
    .where(
      and(
        gte(requestLogs.timestamp, fiveMinAgo),
        eq(requestLogs.statusCode, 401)
      )
    );

  const authFailCount = Number(authFailStats?.cnt ?? 0);
  if (authFailCount > 20) {
    const condition = "auth_token_spike";
    if (!(await isRecentlyAlerted(condition))) {
      await notifyIncident({
        severity: "P2",
        condition,
        message: `${authFailCount} authentication failures (401) detected in the last 5 minutes. Possible token expiry issue or attack.`,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// P3 — MEDIUM checks
// ---------------------------------------------------------------------------
async function checkP3(): Promise<void> {
  // 1. Error rate 1-5% for 30+ minutes
  const { total, errors, rate } = await getErrorRate(30 * 60 * 1000);
  if (total >= 20 && rate >= 1 && rate < 5) {
    const condition = "sustained_error_rate_p3";
    if (!(await isRecentlyAlerted(condition, 2 * 60 * 60 * 1000))) { // 2hr dedup for P3
      await notifyIncident({
        severity: "P3",
        condition,
        message: `Error rate has been ${rate.toFixed(1)}% for the last 30 minutes (${errors}/${total} requests). Monitoring closely.`,
        errorRate: rate,
      });
    }
  }

  // 2. Response time 1-3 seconds for 20+ minutes
  const avgMs = await getAvgResponseMs(20 * 60 * 1000);
  if (avgMs >= 1000 && avgMs <= 3000) {
    const condition = "elevated_response_time_p3";
    if (!(await isRecentlyAlerted(condition, 2 * 60 * 60 * 1000))) {
      await notifyIncident({
        severity: "P3",
        condition,
        message: `Average response time is ${avgMs}ms over the last 20 minutes. Performance is degraded but not critical.`,
      });
    }
  }

  // 3. More than 5 new unique errors in last hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const [newErrorStats] = await db
    .select({ cnt: count() })
    .from(errorLogsTable)
    .where(
      and(
        gte(errorLogsTable.createdAt, oneHourAgo),
        eq(errorLogsTable.resolved, false)
      )
    );

  const newErrorCount = Number(newErrorStats?.cnt ?? 0);
  if (newErrorCount > 5) {
    const condition = "new_errors_spike_p3";
    if (!(await isRecentlyAlerted(condition, 2 * 60 * 60 * 1000))) {
      await notifyIncident({
        severity: "P3",
        condition,
        message: `${newErrorCount} new unresolved errors logged in the last hour. Review the error log for patterns.`,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// P4 — LOW checks (daily digest — dedup 24 hours)
// ---------------------------------------------------------------------------
async function checkP4(): Promise<void> {
  const DEDUP_24H = 24 * 60 * 60 * 1000;

  // 1. New unique error types
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const [newUniqueErrors] = await db
    .select({ cnt: count() })
    .from(errorLogsTable)
    .where(gte(errorLogsTable.createdAt, oneHourAgo));

  if (Number(newUniqueErrors?.cnt ?? 0) > 0) {
    const condition = "new_error_types_p4";
    if (!(await isRecentlyAlerted(condition, DEDUP_24H))) {
      await notifyIncident({
        severity: "P4",
        condition,
        message: `${newUniqueErrors?.cnt} new error(s) logged in the last hour. No immediate action required — review in daily digest.`,
      });
    }
  }

  // 2. Slow queries (requests > 500ms)
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
  const [slowStats] = await db
    .select({ cnt: count() })
    .from(requestLogs)
    .where(and(gte(requestLogs.timestamp, fiveMinAgo), sql`${requestLogs.durationMs} > 500`));

  const slowCount = Number(slowStats?.cnt ?? 0);
  if (slowCount > 10) {
    const condition = "slow_requests_p4";
    if (!(await isRecentlyAlerted(condition, DEDUP_24H))) {
      await notifyIncident({
        severity: "P4",
        condition,
        message: `${slowCount} requests exceeded 500ms in the last 5 minutes. No immediate action required.`,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Main detection cycle
// ---------------------------------------------------------------------------
async function runDetectionCycle(): Promise<void> {
  try {
    await checkP1();
    await checkP2();
    await checkP3();
    await checkP4();
  } catch (err) {
    logger.error({ err }, "Incident detection cycle failed");
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
export function startIncidentDetector(): void {
  if (detectorHandle) return;

  logger.info("Incident detector started (every 5 minutes)");

  // Initial run after 90s to let server warm up
  setTimeout(() => {
    runDetectionCycle().catch(() => {});
  }, 90_000);

  detectorHandle = setInterval(() => {
    runDetectionCycle().catch(() => {});
  }, DETECTION_INTERVAL_MS);
}

export function stopIncidentDetector(): void {
  if (detectorHandle) {
    clearInterval(detectorHandle);
    detectorHandle = null;
  }
}
