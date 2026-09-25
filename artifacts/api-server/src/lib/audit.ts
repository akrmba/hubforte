import { db, auditLogs } from "@workspace/db";
import { generateId } from "./id";
import { logger } from "./logger";
import { getRequestId } from "./requestContext";
import type { Request, Response, NextFunction } from "express";

export interface AuditEntry {
  userId: string;
  userRole: string;
  tenantId?: string | null;
  action: string;
  entityType: string;
  entityId?: string;
  route?: string;
  method?: string;
  changes?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

function resolveAuditTenantId(user: Request["user"] | undefined): string | null {
  if (!user || user.role === "SUPER_ADMIN") {
    return null;
  }

  return user.tenantId ?? null;
}

export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      id: generateId("audit"),
      // For SUPER_ADMIN: preserve an explicitly provided tenantId (tenant-scoped action),
      // but null out when no tenant context was given (platform-wide action).
      tenantId: entry.userRole === "SUPER_ADMIN"
        ? (entry.tenantId ?? null)
        : entry.tenantId ?? null,
      userId: entry.userId,
      userRole: entry.userRole,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId || null,
      route: entry.route || null,
      method: entry.method || null,
      changes: entry.changes || null,
      ipAddress: entry.ipAddress || null,
      userAgent: entry.userAgent || null,
      requestId: getRequestId() || null,
    });
  } catch (err) {
    logger.error({ err }, "Failed to write audit log");
  }
}

/** Express middleware factory — auto-detects action from HTTP method */
export function auditMiddleware(entityType: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) { next(); return; }
    const method = req.method.toUpperCase();
    if (method !== "POST" && method !== "PATCH" && method !== "DELETE") { next(); return; }

    const actionMap: Record<string, string> = { POST: "CREATE", PATCH: "UPDATE", DELETE: "DELETE" };
    const action = actionMap[method] || method;
    const entityId = Array.isArray(req.params?.id) ? req.params.id[0] : req.params?.id || undefined;
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";

    // Fire-and-forget — audit write must never block the response
    writeAuditLog({
      userId: req.user.id,
      userRole: req.user.role,
      tenantId: resolveAuditTenantId(req.user),
      action,
      entityType,
      entityId,
      route: req.originalUrl,
      method,
      changes: method === "DELETE" ? undefined : req.body,
      ipAddress: ip,
    });

    next();
  };
}

/** Express middleware factory — explicit action name with optional change snapshot */
export function auditAction(opts: {
  entityType: string;
  action: string;
  entityId?: (req: Request) => string | undefined;
  changes?: (req: Request) => Record<string, unknown> | undefined;
}) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) { next(); return; }
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";

    writeAuditLog({
      userId: req.user.id,
      userRole: req.user.role,
      tenantId: resolveAuditTenantId(req.user),
      action: opts.action,
      entityType: opts.entityType,
      entityId: opts.entityId?.(req),
      route: req.originalUrl,
      method: req.method,
      changes: opts.changes?.(req) || req.body || undefined,
      ipAddress: ip,
    });

    next();
  };
}
