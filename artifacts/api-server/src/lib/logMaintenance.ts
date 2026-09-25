import { db, requestLogs, errorLogsTable, lmsPublicSessionsTable } from "@workspace/db";
import { lt, and, eq, sql } from "drizzle-orm";
import { logger } from "./logger";

export async function runLogMaintenanceJob(): Promise<void> {
  try {
    const now = new Date();

    // 1. Delete request_logs older than 30 days
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const [{ count: requestCount }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(requestLogs)
      .where(lt(requestLogs.timestamp, thirtyDaysAgo));
    await db.delete(requestLogs).where(lt(requestLogs.timestamp, thirtyDaysAgo));

    logger.info(
      { event: "request_logs_pruned", count: Number(requestCount) },
      `Deleted ${requestCount} request_logs older than 30 days`
    );

    // 2. Delete resolved error_logs older than 90 days
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const [{ count: resolvedCount }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(errorLogsTable)
      .where(and(eq(errorLogsTable.resolved, true), lt(errorLogsTable.createdAt, ninetyDaysAgo)));
    await db
      .delete(errorLogsTable)
      .where(and(eq(errorLogsTable.resolved, true), lt(errorLogsTable.createdAt, ninetyDaysAgo)));

    logger.info(
      { event: "resolved_errors_pruned", count: Number(resolvedCount) },
      `Deleted ${resolvedCount} resolved error_logs older than 90 days`
    );

    // 3. Query unresolved error_logs older than 180 days
    const oneEightyDaysAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
    const staleUnresolved = await db
      .select({
        id: errorLogsTable.id,
        route: errorLogsTable.route,
        errorMessage: errorLogsTable.message,
        timestamp: errorLogsTable.createdAt,
      })
      .from(errorLogsTable)
      .where(
        and(
          eq(errorLogsTable.resolved, false),
          lt(errorLogsTable.createdAt, oneEightyDaysAgo)
        )
      );

    if (staleUnresolved.length > 0) {
      logger.warn(
        {
          event: "stale_unresolved_errors_pending_deletion",
          count: staleUnresolved.length,
          errors: staleUnresolved.map((e) => ({
            id: e.id,
            route: e.route,
            errorMessage: e.errorMessage,
            timestamp: e.timestamp,
          })),
        },
        `${staleUnresolved.length} unresolved errors older than 180 days will be deleted`
      );

      await db
        .delete(errorLogsTable)
        .where(
          and(
            eq(errorLogsTable.resolved, false),
            lt(errorLogsTable.createdAt, oneEightyDaysAgo)
          )
        );

      logger.info(
        { event: "stale_unresolved_errors_deleted", count: staleUnresolved.length },
        `Deleted ${staleUnresolved.length} stale unresolved error_logs`
      );
    }

    logger.info({ event: "log_maintenance_complete" }, "Log maintenance job complete");
  } catch (err) {
    logger.error(
      { err, event: "log_maintenance_failed" },
      "Log maintenance job failed"
    );
  }

  // 4. Task 7.15 — Delete expired lms_public_sessions (TTL: 2 hours)
  // Runs outside the main try/catch so log-maintenance failures don't skip session cleanup.
  try {
    const now = new Date();
    // Use a COUNT query first to get the row count without loading all IDs into memory
    const [{ count: expiredCount }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(lmsPublicSessionsTable)
      .where(lt(lmsPublicSessionsTable.expiresAt, now));

    await db
      .delete(lmsPublicSessionsTable)
      .where(lt(lmsPublicSessionsTable.expiresAt, now));

    logger.info(
      { event: "lms_sessions_pruned", count: Number(expiredCount) },
      `Deleted ${expiredCount} expired lms_public_sessions`
    );
  } catch (err) {
    logger.error({ err, event: "lms_sessions_prune_failed" }, "LMS session cleanup failed");
  }
}

function msUntil3amUTC(): number {
  const now = new Date();
  const next3am = new Date(now);
  next3am.setUTCHours(3, 0, 0, 0);

  if (next3am.getTime() <= now.getTime()) {
    next3am.setUTCDate(next3am.getUTCDate() + 1);
  }

  return next3am.getTime() - now.getTime();
}

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

export function scheduleDailyMaintenance(): void {
  const delayMs = msUntil3amUTC();
  const delayMinutes = Math.round(delayMs / 60_000);

  logger.info(
    { event: "log_maintenance_scheduled", nextRunIn: delayMinutes },
    `Log maintenance scheduled — next run in ${delayMinutes} minutes (3am)`
  );

  setTimeout(() => {
    runLogMaintenanceJob().catch(() => {});

    setInterval(() => {
      runLogMaintenanceJob().catch(() => {});
    }, TWENTY_FOUR_HOURS);
  }, delayMs);
}
