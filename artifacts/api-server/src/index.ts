import { config } from "dotenv";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import http from "http";
import cron from "node-cron";
import { WebSocketServer, WebSocket } from "ws";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, "../.env");

// In production containers all config is injected via environment variables.
// Only require the .env file in development.
if (process.env.NODE_ENV !== "production") {
  if (!fs.existsSync(envPath)) {
    console.error("ERROR: .env file not found at:", envPath);
    process.exit(1);
  }
  config({ path: envPath });
}

// ---------------------------------------------------------------------------
// WebSocket health broadcast — exported so routes can push new_error events
// ---------------------------------------------------------------------------
export const healthWss = new WebSocketServer({ noServer: true });

const authenticatedClients = new Set<WebSocket>();

healthWss.on("connection", (ws, req) => {
  // Token already verified before upgrade — attach and track
  authenticatedClients.add(ws);
  ws.on("close", () => authenticatedClients.delete(ws));
  ws.on("error", () => authenticatedClients.delete(ws));
});

export function broadcastHealth(payload: unknown): void {
  const data = JSON.stringify(payload);
  for (const client of authenticatedClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

async function main() {
  const { default: app } = await import("./app.js");
  const { logger } = await import("./lib/logger.js");
  const { startErrorSummariser } = await import("./lib/errorSummariser.js");
  const { scheduleDailyMaintenance } = await import("./lib/logMaintenance.js");
  const { startAlertJobs } = await import("./lib/alertJobs.js");
  const { startTriggerPolling } = await import("./lib/remediationEngine.js");
  const { startOpsAiAssistant } = await import("./lib/opsAiAssistant.js");
  const { startIncidentDetector } = await import("./lib/incidentDetector.js");
  const { startReportScheduler, deliverScheduledReports } = await import("./lib/reportScheduler.js");
  const { verifyToken } = await import("./lib/auth.js");
  const { db, usersTable } = await import("@workspace/db");
  const { eq } = await import("drizzle-orm");

  const rawPort = process.env["PORT"];

  if (!rawPort) {
    throw new Error("PORT environment variable is required but was not provided.");
  }

  const port = Number(rawPort);

  if (Number.isNaN(port) || port <= 0) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }

  const server = http.createServer(app);

  // WebSocket upgrade — only for /ws/health, SUPER_ADMIN only
  server.on("upgrade", async (req, socket, head) => {
    if (req.url !== "/ws/health") {
      socket.destroy();
      return;
    }

    // Extract token from cookie or Authorization header
    const cookieHeader = req.headers.cookie || "";
    const cookieMatch = cookieHeader.match(/crm_session=([^;]+)/);
    const cookieToken = cookieMatch ? cookieMatch[1] : null;
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const token = cookieToken || bearerToken;

    if (!token) {
      socket.destroy();
      return;
    }

    const payload = verifyToken(token);
    if (!payload) {
      socket.destroy();
      return;
    }

    try {
      const [user] = await db
        .select({ role: usersTable.role, active: usersTable.active })
        .from(usersTable)
        .where(eq(usersTable.id, payload.userId));

      if (!user?.active || user.role !== "SUPER_ADMIN") {
        socket.destroy();
        return;
      }
    } catch {
      socket.destroy();
      return;
    }

    healthWss.handleUpgrade(req, socket, head, (ws) => {
      healthWss.emit("connection", ws, req);
    });
  });

  server.listen(port, (err?: Error) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");

    // Start background jobs
    startErrorSummariser();
    scheduleDailyMaintenance();
    startAlertJobs();
    startTriggerPolling();
    startOpsAiAssistant();
    startIncidentDetector();
    startReportScheduler();

    // Daily report delivery — runs at 7:00 AM UTC every day
    cron.schedule("0 7 * * *", async () => {
      try {
        await deliverScheduledReports();
      } catch (err) {
        logger.error({ err }, "Scheduled report delivery failed");
      }
    });

    // Phase 10: Daily owner briefing at 8am
    import("./lib/dailyBriefing.js").then(({ startDailyBriefing }) => startDailyBriefing());

    // Broadcast health summary every 30 seconds
    setInterval(async () => {
      try {
        if (authenticatedClients.size === 0) return;
        const { db: dbInner, requestLogs, remediationRunsTable, sessionsTable } = await import("@workspace/db");
        const { sql: sqlFn, count: countFn, gte: gteFn, and: andFn } = await import("drizzle-orm");

        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);

        let dbConnectionsOk = true;
        try { await dbInner.execute(sqlFn`SELECT 1`); } catch { dbConnectionsOk = false; }

        const [reqStats] = await dbInner
          .select({
            total: countFn(),
            errors: sqlFn<number>`SUM(CASE WHEN ${requestLogs.isError} = true THEN 1 ELSE 0 END)::int`,
            p95: sqlFn<number>`PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ${requestLogs.durationMs})::int`,
          })
          .from(requestLogs)
          .where(gteFn(requestLogs.timestamp, oneHourAgo));

        const requestsLastHour = Number(reqStats?.total ?? 0);
        const errorsLastHour = Number(reqStats?.errors ?? 0);
        const errorRate = requestsLastHour > 0 ? (errorsLastHour / requestsLastHour) * 100 : 0;
        const p95ResponseMs = Number(reqStats?.p95 ?? 0);

        let systemStatus: "healthy" | "degraded" | "critical";
        if (!dbConnectionsOk || errorRate > 5 || p95ResponseMs > 3000) systemStatus = "critical";
        else if (errorRate >= 1 || p95ResponseMs >= 1000) systemStatus = "degraded";
        else systemStatus = "healthy";

        broadcastHealth({ type: "health_summary", data: { systemStatus, errorRate: Math.round(errorRate * 100) / 100, p95ResponseMs, requestsLastHour, errorsLastHour, dbConnectionsOk, timestamp: now.toISOString() } });
      } catch {
        // swallow — non-critical background broadcast
      }
    }, 30_000);
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
