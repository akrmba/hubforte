import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { randomUUID } from "crypto";
import router from "./routes";
import { cdcMiddleware } from "./lib/cdcMiddleware";
import { logger } from "./lib/logger";
import { checkRateLimit } from "./lib/rateLimiter";
import { csrfCheck } from "./lib/auth";
import { db, errorLogsTable, requestLogs } from "@workspace/db";
import { generateId } from "./lib/id";
import { requestContext } from "./lib/requestContext";
import { writeErrorLog } from "./lib/errorLogger";
import { sql, count, gte, and } from "drizzle-orm";

const jwtSecret = process.env.JWT_SECRET || process.env.SESSION_SECRET;
if (!jwtSecret) {
  logger.fatal("FATAL: JWT_SECRET or SESSION_SECRET environment variable must be set. Refusing to start.");
  process.exit(1);
}

if (!process.env.WORKER_SECRET) {
  logger.fatal("FATAL: WORKER_SECRET environment variable must be set. Refusing to start.");
  process.exit(1);
}

const app: Express = express();
// Trust the first proxy hop so req.ip reflects the real client IP from X-Forwarded-For.
// Without this, Express ignores X-Forwarded-For and raw header parsing is bypassable.
app.set("trust proxy", 1);

// Middleware 1: Attach requestId and startTime
app.use((req: Request, res: Response, next: NextFunction) => {
  req.requestId = randomUUID();
  req.startTime = Date.now();
  res.setHeader('X-Request-Id', req.requestId);
  next();
});

// Middleware 2: Request/response logging + AsyncLocalStorage context
app.use((req: Request, res: Response, next: NextFunction) => {
  const userId = (req as any).user?.id ?? null;
  const sanitisedQuery = { ...req.query };
  delete sanitisedQuery.password;
  delete sanitisedQuery.token;
  delete sanitisedQuery.secret;

  logger.info({
    event: 'request_received',
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    query: sanitisedQuery,
    userAgent: req.headers['user-agent'] ?? null,
    ip: req.ip,
    userId,
    timestamp: new Date().toISOString(),
  });

  requestContext.run({ requestId: req.requestId, userId: userId ?? undefined }, () => {
    res.on('finish', async () => {
      const durationMs = Date.now() - req.startTime;
      const slowRequest = durationMs > 2000;
      const isError = res.statusCode >= 400;
      const isCritical = res.statusCode >= 500;
      // Read userId and tenantId post-auth — auth middleware has run by finish time
      const authedUserId = (req as any).user?.id ?? userId;
      const authedTenantId = (req as any).user?.tenantId ?? null;

      logger.info({
        event: 'request_completed',
        requestId: req.requestId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs,
        userId: authedUserId,
        tenantId: authedTenantId,
        timestamp: new Date().toISOString(),
        ...(slowRequest && { slowRequest: true }),
        ...(isError && { isError: true }),
        ...(isCritical && { isCritical: true }),
      });

      // Write to request_logs — fire and forget
      // tenantId is read post-finish so auth middleware has already run
      try {
        await db.insert(requestLogs).values({
          id: generateId('rl'),
          requestId: req.requestId,
          tenantId: (req as any).user?.tenantId ?? null,
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          durationMs,
          userId: (req as any).user?.id ?? userId,
          slowRequest,
          isError,
          isCritical,
          timestamp: new Date(),
        });
      } catch (e) {
        logger.warn({ event: 'request_log_write_failed', error: String(e) });
      }
    });
    next();
  });
});

app.use(
  pinoHttp({
    logger,
    genReqId: (req) => (req as any).requestId,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",")
    : ["http://localhost:5173"],
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", csrfCheck, async (req: Request, res: Response, next: NextFunction) => {
  const path = req.path;
  if (path === "/healthz" || path.startsWith("/health/") || path.startsWith("/auth/")) {
    return next();
  }
  try {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    await checkRateLimit("api", ip);
    next();
  } catch (e: any) {
    if (e?.status === 429) {
      res.status(429).json(e.body);
    } else {
      next(e);
    }
  }
});

// Maintenance mode — must be after CSRF/rate-limit but before router
import { maintenanceModeMiddleware } from "./lib/maintenanceMode";
app.use("/api", async (req: Request, res: Response, next: NextFunction) => {
  try {
    await maintenanceModeMiddleware(req, res, next);
  } catch (e) {
    next(e);
  }
});

// Phase 7: CDC middleware — captures change events for tracked entity mutations
app.use("/api", cdcMiddleware);

// Phase 7C: Module circuit breaker — if a module has 10+ 500-errors in last 5 min, return MODULE_DEGRADED
app.use("/api", async (req: Request, res: Response, next: NextFunction) => {
  const pathParts = req.path.replace(/^\//, "").split("/");
  const moduleKey = pathParts[0];
  if (!moduleKey || moduleKey === "healthz" || moduleKey === "auth" || moduleKey === "super-admin") {
    return next();
  }
  try {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const [stats] = await db
      .select({ cnt: count() })
      .from(requestLogs)
      .where(
        and(
          gte(requestLogs.timestamp, fiveMinAgo),
          sql`${requestLogs.path} LIKE ${`/api/${moduleKey}/%`}`,
          sql`${requestLogs.statusCode} = 500`
        )
      );
    if (Number(stats?.cnt ?? 0) >= 10) {
      res.status(503).json({
        error: true,
        code: "MODULE_DEGRADED",
        message: "This feature is temporarily unavailable. Our team has been notified and is investigating.",
        requestId: req.requestId,
      });
      return;
    }
  } catch {
    // circuit breaker check failure must never block the request
  }
  next();
});

app.use("/api", router);

// ---------------------------------------------------------------------------
// Phase 7C: Structured global error handler
// ---------------------------------------------------------------------------
const ERROR_MAP: Record<number, { code: string; message: string }> = {
  400: { code: "VALIDATION_ERROR",  message: "Please check your input and try again." },
  401: { code: "UNAUTHORISED",      message: "Please sign in to continue." },
  403: { code: "FORBIDDEN",         message: "You don't have permission to perform this action." },
  404: { code: "NOT_FOUND",         message: "The item you requested could not be found." },
  409: { code: "CONFLICT",          message: "A conflict occurred. Please refresh and try again." },
  422: { code: "UNPROCESSABLE",     message: "The data provided cannot be processed. Please check your input." },
  429: { code: "RATE_LIMITED",      message: "Too many requests. Please wait a moment before trying again." },
  503: { code: "UNAVAILABLE",       message: "This service is temporarily unavailable. Please try again in a moment." },
};

app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  const status: number = err.status || err.statusCode || 500;
  const requestId = req.requestId || randomUUID();

  // Generate a customer-facing reference ID for 500 errors only.
  // requestId = internal correlation (never shown to customers)
  // errorRefId = customer/support reference shown in UI and emails
  const now = new Date();
  const datePart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
  const errorRefId = status >= 500 ? `ERR-${datePart}-${requestId.slice(0, 4).toUpperCase()}` : undefined;

  // Always log the full error server-side
  logger.error({ err, requestId, errorRefId, status }, "Unhandled error");

  // Persist to error_logs (fire-and-forget)
  const route = `${req.method} ${req.originalUrl?.split("?")[0] || req.path}`;
  writeErrorLog({
    level: status >= 500 ? "ERROR" : "WARN",
    source: "api",
    route,
    method: req.method,
    statusCode: status,
    requestId,
    errorRefId,
    tenantId: (req as any).user?.tenantId ?? undefined,
    userId: (req as any).user?.id ?? undefined,
    errorMessage: String(err.message || "Unknown error").slice(0, 2000),
    stack: String(err.stack || "").slice(0, 10000) || undefined,
  });

  // Structured client-safe response — never expose stack traces or requestId
  if (status === 500) {
    res.status(500).json({
      error: true,
      code: "SYSTEM_ERROR",
      message: `Something went wrong on our end. Our team has been notified. Reference: ${errorRefId}`,
      errorRefId,
      // requestId intentionally omitted from client response — internal use only
    });
    return;
  }

  const mapped = ERROR_MAP[status];
  if (mapped) {
    res.status(status).json({ error: true, ...mapped });
    return;
  }

  // Fallback for unmapped status codes
  res.status(status).json({
    error: true,
    code: "ERROR",
    message: "An unexpected error occurred. Please try again.",
  });
});

export default app;
