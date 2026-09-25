import { Router, type IRouter, type Request, type Response } from "express";
import { RateLimiterMemory } from "rate-limiter-flexible";
import { writeErrorLog } from "../lib/errorLogger";
import { authMiddleware } from "../lib/auth";

const router: IRouter = Router();

const clientErrorLimiter = new RateLimiterMemory({
  points: 10,
  duration: 60,
  blockDuration: 60,
});

// POST /log-client-error
// Auth is optional — unauthenticated crashes (e.g. login page) must still be logged.
// When the user is authenticated, tenant/user context is derived from the JWT, not the body.
// errorRefId is the customer-facing reference; requestId stays internal.
router.post("/log-client-error", async (req: Request, res: Response): Promise<void> => {
  const ip =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "unknown";

  try {
    await clientErrorLimiter.consume(ip);
  } catch {
    res.status(429).json({ error: "Too many requests. Please try again later." });
    return;
  }

  try {
    const { message, stack, route, userAgent, errorRefId, recentActions } = req.body;
    if (!message) {
      res.status(400).json({ error: "message required" });
      return;
    }

    // Prefer authenticated context over body-supplied values to prevent spoofing
    const authenticatedUser = (req as any).user;
    const tenantId = authenticatedUser?.tenantId ?? undefined;
    const userId = authenticatedUser?.id ?? undefined;

    await writeErrorLog({
      level: "ERROR",
      source: "frontend",
      route: route ?? "unknown",
      errorMessage: String(message).slice(0, 1000),
      stack: String(stack ?? "").slice(0, 3000),
      errorRefId: errorRefId ?? undefined,
      tenantId,
      userId,
      metadata: recentActions ? { recentActions: (recentActions as unknown[]).slice(0, 5) } : undefined,
    });

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to log error" });
  }
});

export default router;
