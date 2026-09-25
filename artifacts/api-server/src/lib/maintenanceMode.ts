import type { Request, Response, NextFunction } from "express";
import { logger } from "./logger";
import { db, featureFlagsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { verifyToken } from "./auth";
import { usersTable } from "@workspace/db";
import { generateId } from "./id";

const MAINTENANCE_MODULE = "MAINTENANCE";

// In-memory cache of DB state
let maintenanceMode = false;
let maintenanceMessage = "Hubforte is undergoing scheduled maintenance. Please try again shortly.";
let maintenanceEnabledAt: Date | null = null;
let maintenanceEnabledBy: string | null = null;
let maintenanceEstimatedResolution: string | null = null;

// Paths that bypass maintenance mode (health checks, auth, super-admin)
const BYPASS_PREFIXES = [
  "/api/healthz",
  "/api/health/",
  "/api/auth/login",
  "/api/auth/me",
  "/api/super-admin/maintenance",
];

// In-memory cache of DB maintenance flag (avoids DB hit on every request)
let dbMaintenanceCache: { enabled: boolean; expiresAt: number } | null = null;
const CACHE_TTL_MS = 5000; // 5 second cache

async function isMaintenanceEnabledInDB(): Promise<boolean> {
  const now = Date.now();
  if (dbMaintenanceCache && dbMaintenanceCache.expiresAt > now) {
    return dbMaintenanceCache.enabled;
  }

  try {
    const [row] = await db
      .select({ enabled: featureFlagsTable.enabled })
      .from(featureFlagsTable)
      .where(eq(featureFlagsTable.module, MAINTENANCE_MODULE));

    const enabled = row?.enabled ?? false;
    dbMaintenanceCache = { enabled, expiresAt: now + CACHE_TTL_MS };
    return enabled;
  } catch {
    // If DB is unreachable, fall back to in-memory state
    return maintenanceMode;
  }
}

export function isMaintenanceMode(): boolean {
  return maintenanceMode;
}

export function getMaintenanceStatus() {
  return {
    enabled: maintenanceMode,
    message: maintenanceMessage,
    enabledAt: maintenanceEnabledAt?.toISOString() || null,
    enabledBy: maintenanceEnabledBy,
    estimatedResolution: maintenanceEstimatedResolution,
  };
}

export async function enableMaintenanceMode(userId: string, message?: string, estimatedResolution?: string): Promise<void> {
  maintenanceMode = true;
  maintenanceEnabledAt = new Date();
  maintenanceEnabledBy = userId;
  if (message) maintenanceMessage = message;
  maintenanceEstimatedResolution = estimatedResolution || null;

  // Persist to DB
  try {
    const [existing] = await db
      .select()
      .from(featureFlagsTable)
      .where(eq(featureFlagsTable.module, MAINTENANCE_MODULE));

    if (existing) {
      await db
        .update(featureFlagsTable)
        .set({ enabled: true, updatedBy: userId, updatedAt: new Date() })
        .where(eq(featureFlagsTable.module, MAINTENANCE_MODULE));
    } else {
      await db
        .insert(featureFlagsTable)
        .values({ id: generateId("ff"), module: MAINTENANCE_MODULE, enabled: true, updatedBy: userId, updatedAt: new Date() });
    }
    dbMaintenanceCache = { enabled: true, expiresAt: Date.now() + CACHE_TTL_MS };
  } catch (e) {
    logger.warn({ error: String(e) }, "Failed to persist maintenance mode to DB");
  }

  logger.warn({ userId, message: maintenanceMessage, estimatedResolution }, "Maintenance mode ENABLED");
}

export async function disableMaintenanceMode(userId: string): Promise<void> {
  maintenanceMode = false;
  maintenanceEnabledAt = null;
  maintenanceEnabledBy = null;
  maintenanceEstimatedResolution = null;
  maintenanceMessage = "Hubforte is undergoing scheduled maintenance. Please try again shortly.";

  // Persist to DB
  try {
    await db
      .update(featureFlagsTable)
      .set({ enabled: false, updatedBy: userId, updatedAt: new Date() })
      .where(eq(featureFlagsTable.module, MAINTENANCE_MODULE));
    dbMaintenanceCache = { enabled: false, expiresAt: Date.now() + CACHE_TTL_MS };
  } catch (e) {
    logger.warn({ error: String(e) }, "Failed to persist maintenance mode disable to DB");
  }

  logger.info({ userId }, "Maintenance mode DISABLED");
}

/** Check if a request is from a SUPER_ADMIN via cookie token */
async function isSuperAdminRequest(req: Request): Promise<boolean> {
  // Check if user already authenticated upstream
  if ((req as any).user?.role === "SUPER_ADMIN") return true;

  // Try to extract token from cookie
  const token = req.cookies?.crm_session;
  if (!token) return false;

  try {
    const payload = verifyToken(token);
    if (!payload?.userId) return false;

    const [user] = await db
      .select({ role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.id, payload.userId))
      .limit(1);

    return user?.role === "SUPER_ADMIN";
  } catch {
    return false;
  }
}

/** Express middleware — returns 503 for non-bypass routes when maintenance is on */
export async function maintenanceModeMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Check both in-memory and DB state
  const dbEnabled = await isMaintenanceEnabledInDB();
  if (!maintenanceMode && !dbEnabled) { next(); return; }

  // Allow bypass paths
  const path = req.originalUrl || req.path;
  if (BYPASS_PREFIXES.some(prefix => path.startsWith(prefix))) { next(); return; }

  // Allow SUPER_ADMIN users through
  if (await isSuperAdminRequest(req)) { next(); return; }

  res.status(503).json({
    status: "maintenance",
    message: maintenanceMessage,
    maintenanceMode: true,
    estimatedResolution: maintenanceEstimatedResolution,
    retryAfter: 300,
  });
}
