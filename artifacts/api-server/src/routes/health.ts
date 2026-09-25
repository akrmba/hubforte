import { Router, type IRouter } from "express";
import { db, errorLogsTable, gmailCredentialsTable, requestLogs } from "@workspace/db";
import { sql, count, gte, and, eq } from "drizzle-orm";
import { authMiddleware, requireRole } from "../lib/auth";
import { getAvailableProviders } from "../lib/aiProvider";

const router: IRouter = Router();
const serverStartTime = Date.now();

router.get("/healthz", async (_req, res) => {
  let dbStatus = "disconnected";
  try {
    await db.execute(sql`SELECT 1`);
    dbStatus = "connected";
  } catch {
    dbStatus = "error";
  }
  res.json({ status: "ok", db: dbStatus, timestamp: new Date().toISOString() });
});

interface HealthCheck {
  name: string;
  status: "ok" | "degraded" | "down";
  latencyMs: number;
  detail: string;
}

router.get("/health/detailed", authMiddleware, requireRole("ADMIN"), async (_req, res) => {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const uptimeSeconds = Math.floor((Date.now() - serverStartTime) / 1000);
  const checks: HealthCheck[] = [];

  // Database check
  try {
    const dbStart = Date.now();
    await db.execute(sql`SELECT 1`);
    const latencyMs = Date.now() - dbStart;
    checks.push({
      name: "database",
      status: latencyMs > 500 ? "degraded" : "ok",
      latencyMs,
      detail: latencyMs > 500 ? `Slow response: ${latencyMs}ms` : `Connected (${latencyMs}ms)`,
    });
  } catch {
    checks.push({ name: "database", status: "down", latencyMs: -1, detail: "Connection failed" });
  }

  // Gmail check
  const gmailStart = Date.now();
  const gmailClientId = process.env.GMAIL_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  if (!gmailClientId) {
    checks.push({ name: "gmail", status: "ok", latencyMs: 0, detail: "Not configured" });
  } else {
    try {
      const [cred] = await db.select({ id: gmailCredentialsTable.userId }).from(gmailCredentialsTable).limit(1);
      const latencyMs = Date.now() - gmailStart;
      checks.push({
        name: "gmail",
        status: cred ? "ok" : "degraded",
        latencyMs,
        detail: cred ? "Credentials found" : "No Gmail credentials found",
      });
    } catch {
      checks.push({ name: "gmail", status: "down", latencyMs: Date.now() - gmailStart, detail: "Query failed" });
    }
  }

  // AI provider check
  const aiStart = Date.now();
  const aiProviders = getAvailableProviders();
  const aiLatencyMs = Date.now() - aiStart;
  checks.push({
    name: "ai_provider",
    status: aiProviders.length > 0 ? "ok" : "down",
    latencyMs: aiLatencyMs,
    detail: aiProviders.length > 0 ? `Providers: ${aiProviders.join(", ")}` : "No AI providers configured",
  });

  // Worker check
  const workerStart = Date.now();
  let workerStatus: "ok" | "degraded" | "down" = "ok";
  let workerDetail = "No recent activity";
  try {
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const [workerReq] = await db
      .select({ timestamp: requestLogs.timestamp })
      .from(requestLogs)
      .where(and(
        sql`${requestLogs.path} LIKE '%/worker/%'`,
        gte(requestLogs.timestamp, fiveMinAgo)
      ))
      .orderBy(sql`${requestLogs.timestamp} DESC`)
      .limit(1);
    if (workerReq) {
      workerDetail = `Last seen ${workerReq.timestamp.toISOString()}`;
    } else {
      workerStatus = "degraded";
      workerDetail = "No worker activity in last 5 minutes";
    }
  } catch {
    workerStatus = "down";
    workerDetail = "Worker status check failed";
  }
  checks.push({ name: "worker", status: workerStatus, latencyMs: Date.now() - workerStart, detail: workerDetail });

  // Memory / CPU check
  const memStart = Date.now();
  const mem = process.memoryUsage();
  const heapUsedMB = Math.round(mem.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(mem.heapTotal / 1024 / 1024);
  const rssMB = Math.round(mem.rss / 1024 / 1024);
  const cpuUsage = process.cpuUsage();
  const memLatencyMs = Date.now() - memStart;
  const memStatus: "ok" | "degraded" | "down" = heapUsedMB > 500 ? "degraded" : "ok";
  checks.push({
    name: "memory_cpu",
    status: memStatus,
    latencyMs: memLatencyMs,
    detail: `Heap: ${heapUsedMB}/${heapTotalMB}MB, RSS: ${rssMB}MB, CPU: ${(cpuUsage.user / 1e6).toFixed(1)}s`,
  });

  // Overall status derived from checks
  const hasDown = checks.some((c) => c.status === "down");
  const hasDegraded = checks.some((c) => c.status === "degraded");
  const overallStatus: "ok" | "degraded" | "down" = hasDown ? "down" : hasDegraded ? "degraded" : "ok";

  res.json({
    status: overallStatus,
    timestamp: now.toISOString(),
    uptime: uptimeSeconds,
    checks,
  });
});

export default router;
