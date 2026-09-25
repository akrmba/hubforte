import { db, requestLogs, tenantsTable, usersTable } from "@workspace/db";
import { sql, gte, and, count, desc, eq, isNull } from "drizzle-orm";
import { logger } from "./logger";
import { notifySuperAdminUsers, notifyTenantAdminUsers } from "./notifications";

const SLOW_REQUEST_WINDOW = 10 * 60 * 1000; // 10 minutes
const SLOW_REQUEST_INTERVAL = 5 * 60 * 1000; // Check every 5 minutes
const SLOW_REQUEST_THRESHOLD = 10; // 10+ slow requests in window
const ERROR_RATE_INTERVAL = 5 * 60 * 1000; // 5 minutes
const SLOW_THRESHOLD_MS = 2000;
const ERROR_RATE_THRESHOLD = 0.10; // 10% error rate triggers alert
const ERROR_COUNT_THRESHOLD = 20; // 20+ errors in 5 min triggers alert
const MIN_REQUESTS_FOR_RATE = 20; // Need at least 20 requests to calculate meaningful rate

let slowIntervalHandle: ReturnType<typeof setInterval> | null = null;
let errorRateIntervalHandle: ReturnType<typeof setInterval> | null = null;

function formatTenantLabel(tenantId: string | null, tenantName: string | null): string {
  if (tenantName && tenantName.trim().length > 0) {
    return tenantName;
  }

  if (tenantId) {
    return tenantId;
  }

  return "system-wide activity";
}

async function getTopErrorRouteSummary(since: Date, tenantId: string | null): Promise<string> {
  const topRoutes = await db
    .select({
      path: requestLogs.path,
      total: count(),
    })
    .from(requestLogs)
    .leftJoin(usersTable, eq(requestLogs.userId, usersTable.id))
    .where(
      and(
        gte(requestLogs.timestamp, since),
        eq(requestLogs.isError, true),
        tenantId ? eq(usersTable.tenantId, tenantId) : isNull(usersTable.tenantId)
      )
    )
    .groupBy(requestLogs.path)
    .orderBy(sql`count(*) DESC`)
    .limit(3);

  return topRoutes.map((route) => `${route.path} (${Number(route.total ?? 0)})`).join(", ");
}

/** Task P: Check for slow requests in the last 10 minutes and alert admins if >= 10 */
async function checkSlowRequests(): Promise<void> {
  try {
    const tenMinAgo = new Date(Date.now() - SLOW_REQUEST_WINDOW);

    const slowRequests = await db
      .select({
        path: requestLogs.path,
        method: requestLogs.method,
        durationMs: requestLogs.durationMs,
        timestamp: requestLogs.timestamp,
        userId: requestLogs.userId,
        tenantId: usersTable.tenantId,
        tenantName: tenantsTable.name,
      })
      .from(requestLogs)
      .leftJoin(usersTable, eq(requestLogs.userId, usersTable.id))
      .leftJoin(tenantsTable, eq(usersTable.tenantId, tenantsTable.id))
      .where(
        and(
          gte(requestLogs.timestamp, tenMinAgo),
          gte(requestLogs.durationMs, SLOW_THRESHOLD_MS)
        )
      )
      .orderBy(desc(requestLogs.durationMs))
      .limit(200);

    if (slowRequests.length === 0) return;

    const scopedRequests = new Map<string, typeof slowRequests>();
    for (const request of slowRequests) {
      const key = request.tenantId ?? "__system__";
      const existing = scopedRequests.get(key);
      if (existing) {
        existing.push(request);
      } else {
        scopedRequests.set(key, [request]);
      }
    }

    const tenantAlertSummary: string[] = [];

    for (const requestsForScope of scopedRequests.values()) {
      if (requestsForScope.length < SLOW_REQUEST_THRESHOLD) {
        continue;
      }

      const worst = requestsForScope[0];
      const tenantLabel = formatTenantLabel(worst.tenantId ?? null, worst.tenantName ?? null);

      if (worst.tenantId) {
        const message = `${requestsForScope.length} slow request(s) for ${tenantLabel} in the last 10 minutes. Slowest: ${worst.method} ${worst.path} took ${worst.durationMs ?? 0}ms.`;
        logger.warn(
          {
            event: "tenant_slow_request_alert",
            tenantId: worst.tenantId,
            tenantName: worst.tenantName,
            count: requestsForScope.length,
            worstMs: worst.durationMs,
            worstPath: worst.path,
          },
          message
        );

        await notifyTenantAdminUsers(worst.tenantId, {
          title: "Slow Request Alert",
          message,
          type: "WARNING",
          link: "/dashboard",
        });

        tenantAlertSummary.push(`${tenantLabel} (${requestsForScope.length})`);
        continue;
      }

      const message = `${requestsForScope.length} unattributed slow request(s) in the last 10 minutes. Slowest: ${worst.method} ${worst.path} took ${worst.durationMs ?? 0}ms.`;
      logger.warn(
        {
          event: "system_slow_request_alert",
          count: requestsForScope.length,
          worstMs: worst.durationMs,
          worstPath: worst.path,
        },
        message
      );

      await notifySuperAdminUsers({
        title: "Slow Request Alert",
        message,
        type: "WARNING",
        link: "/super-admin",
      });
    }

    if (tenantAlertSummary.length > 1) {
      const message = `Slow requests were detected across ${tenantAlertSummary.length} tenants in the last 10 minutes: ${tenantAlertSummary.join(", ")}.`;
      logger.warn({ event: "multi_tenant_slow_request_alert", tenants: tenantAlertSummary }, message);

      await notifySuperAdminUsers({
        title: "Multi-tenant Slow Request Alert",
        message,
        type: "WARNING",
        link: "/super-admin",
      });
    }
  } catch (err) {
    logger.error({ err }, "Slow request alert job failed");
  }
}

/** Task Q: Check error rate in the last 5 minutes and alert if above threshold (percentage or count-based) */
async function checkErrorRate(): Promise<void> {
  try {
    const fiveMinAgo = new Date(Date.now() - ERROR_RATE_INTERVAL);

    const scopedStats = await db
      .select({
        tenantId: usersTable.tenantId,
        tenantName: tenantsTable.name,
        total: count(),
        errors: count(sql`CASE WHEN ${requestLogs.isError} = true THEN 1 END`),
      })
      .from(requestLogs)
      .leftJoin(usersTable, eq(requestLogs.userId, usersTable.id))
      .leftJoin(tenantsTable, eq(usersTable.tenantId, tenantsTable.id))
      .where(gte(requestLogs.timestamp, fiveMinAgo))
      .groupBy(usersTable.tenantId, tenantsTable.name);

    const tenantAlertSummary: string[] = [];

    for (const scopedStat of scopedStats) {
      const total = Number(scopedStat.total ?? 0);
      const errors = Number(scopedStat.errors ?? 0);
      if (errors === 0) {
        continue;
      }

      const errorRate = total > 0 ? errors / total : 0;
      const countTriggered = errors >= ERROR_COUNT_THRESHOLD;
      const rateTriggered = total >= MIN_REQUESTS_FOR_RATE && errorRate >= ERROR_RATE_THRESHOLD;

      if (!countTriggered && !rateTriggered) {
        continue;
      }

      const tenantLabel = formatTenantLabel(scopedStat.tenantId ?? null, scopedStat.tenantName ?? null);
      const routeSummary = countTriggered ? await getTopErrorRouteSummary(fiveMinAgo, scopedStat.tenantId ?? null) : "";
      const message = countTriggered
        ? `${errors} errors for ${tenantLabel} in the last 5 minutes. Top routes: ${routeSummary || "N/A"}.`
        : `Error rate for ${tenantLabel} is ${(errorRate * 100).toFixed(1)}% (${errors}/${total} requests) in the last 5 minutes. Threshold: ${(ERROR_RATE_THRESHOLD * 100).toFixed(0)}%.`;
      const title = countTriggered ? "High Error Count Alert" : "Error Rate Alert";

      if (scopedStat.tenantId) {
        logger.warn(
          {
            event: countTriggered ? "tenant_error_count_alert" : "tenant_error_rate_alert",
            tenantId: scopedStat.tenantId,
            tenantName: scopedStat.tenantName,
            errors,
            total,
            errorRate,
            routeSummary,
          },
          message
        );

        await notifyTenantAdminUsers(scopedStat.tenantId, {
          title,
          message,
          type: "WARNING",
          link: "/dashboard",
        });

        tenantAlertSummary.push(`${tenantLabel} (${errors}/${total})`);
        continue;
      }

      logger.warn(
        {
          event: countTriggered ? "system_error_count_alert" : "system_error_rate_alert",
          errors,
          total,
          errorRate,
          routeSummary,
        },
        message
      );

      await notifySuperAdminUsers({
        title,
        message,
        type: "WARNING",
        link: "/super-admin",
      });
    }

    if (tenantAlertSummary.length > 1) {
      const message = `Error alerts were triggered across ${tenantAlertSummary.length} tenants in the last 5 minutes: ${tenantAlertSummary.join(", ")}.`;
      logger.warn({ event: "multi_tenant_error_alert", tenants: tenantAlertSummary }, message);

      await notifySuperAdminUsers({
        title: "Multi-tenant Error Alert",
        message,
        type: "WARNING",
        link: "/super-admin",
      });
    }
  } catch (err) {
    logger.error({ err }, "Error rate alert job failed");
  }
}

export function startAlertJobs(): void {
  logger.info("Alert jobs started (slow requests + error rate, every 5 minutes)");

  // Initial run after 60s delay to let the server warm up
  setTimeout(() => {
    checkSlowRequests().catch(() => {});
    checkErrorRate().catch(() => {});
  }, 60_000);

  slowIntervalHandle = setInterval(() => {
    checkSlowRequests().catch(() => {});
  }, SLOW_REQUEST_INTERVAL);

  errorRateIntervalHandle = setInterval(() => {
    checkErrorRate().catch(() => {});
  }, ERROR_RATE_INTERVAL);
}

export function stopAlertJobs(): void {
  if (slowIntervalHandle) { clearInterval(slowIntervalHandle); slowIntervalHandle = null; }
  if (errorRateIntervalHandle) { clearInterval(errorRateIntervalHandle); errorRateIntervalHandle = null; }
}
