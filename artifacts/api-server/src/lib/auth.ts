import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { createHash } from "crypto";
import { db, tenantsTable, usersTable, registeredAppsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { getRequestId } from "./requestContext";
import { canDo, Role } from "./permissions";
import { writeAuditLog } from "./audit";

export interface AuthUser {
  id: string;
  email: string | null;
  name: string | null;
  role: Role;
  active: boolean;
  tenantId: string | null;
}

export interface AuthApp {
  appId: string;
  tenantId: string;
  scopes: string[];
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      appAuth?: AuthApp;
    }
  }
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET || process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "JWT_SECRET or SESSION_SECRET environment variable must be set. The application cannot start without a signing secret."
    );
  }
  return secret;
}

export function generateToken(userId: string): string {
  return jwt.sign({ userId }, getJwtSecret(), { expiresIn: "30d" });
}

export function verifyToken(token: string): { userId: string } | null {
  try {
    const payload = jwt.verify(token, getJwtSecret()) as { userId: string };
    return payload;
  } catch {
    return null;
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const cookieToken = (req as any).cookies?.crm_session;
  const authHeader = req.headers.authorization;

  let token: string | null = null;

  if (cookieToken) {
    token = cookieToken;
  } else if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  }

  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }

  const [user] = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      role: usersTable.role,
      active: usersTable.active,
      tenantId: usersTable.tenantId,
      isEmergencyAccount: usersTable.isEmergencyAccount,
      emergencyActivatedAt: usersTable.emergencyActivatedAt,
    })
    .from(usersTable)
    .where(eq(usersTable.id, payload.userId));

  if (!user || !user.active) {
    res.status(401).json({ error: "User not found or inactive" });
    return;
  }

  // Auto-expire emergency account after 2 hours
  if (user.isEmergencyAccount && user.emergencyActivatedAt) {
    const elapsed = Date.now() - new Date(user.emergencyActivatedAt).getTime();
    if (elapsed > 2 * 60 * 60 * 1000) {
      await db.update(usersTable)
        .set({ active: false, emergencyActivatedAt: null } as any)
        .where(eq(usersTable.id, user.id));
      writeAuditLog({
        userId: user.id,
        userRole: user.role,
        tenantId: null,
        action: 'EMERGENCY_ACCESS_DEACTIVATED',
        entityType: 'user',
        entityId: user.id,
        route: req.originalUrl,
        method: req.method,
        ipAddress: req.ip,
        changes: { reason: 'auto_expired_2h', emergencyActivatedAt: user.emergencyActivatedAt },
      });
      logger.warn({ userId: user.id }, "Emergency account auto-deactivated after 2-hour window");
      res.status(401).json({ error: "Emergency access window has expired. Account has been deactivated." });
      return;
    }
  }

  if (user.role !== "SUPER_ADMIN" && user.tenantId) {
    const [tenant] = await db
      .select({
        id: tenantsTable.id,
        status: tenantsTable.status,
      })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, user.tenantId));

    if (tenant?.status === "suspended") {
      res.status(403).json({ error: "Your organization's account has been suspended. Please contact support." });
      return;
    }
  }

  req.user = user;
  next();
}

/**
 * Extract tenant ID from the authenticated request.
 * Throws 400 if the user has no tenant (unless SUPER_ADMIN).
 */
export function getTenantId(req: Request): string {
  const tenantId = req.user?.tenantId;
  if (!tenantId) {
    if (req.user?.role && isSuperRole(req.user.role)) {
      throw new Error("SUPER_ADMIN/PLATFORM_OWNER has no default tenant. Use req.user.tenantId directly.");
    }
    throw new Error("User has no tenant assignment");
  }
  return tenantId;
}

/**
 * Middleware that requires a tenant ID on the request.
 * Returns 403 if user has no tenant (SUPER_ADMIN bypasses).
 */
export function requireTenant(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.role && isSuperRole(req.user.role)) {
    next();
    return;
  }
  if (!req.user?.tenantId) {
    res.status(403).json({ error: "No tenant assigned to this user" });
    return;
  }
  next();
}

export function csrfCheck(req: Request, res: Response, next: NextFunction): void {
  // Only check state-mutating methods
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    next();
    return;
  }

  // Use originalUrl for reliable path matching regardless of mount prefix stripping
  const url = req.originalUrl.split("?")[0];
  if (
    url.startsWith("/api/worker/") ||
    url === "/api/healthz" ||
    url.startsWith("/api/lms/public/") ||
    url.startsWith("/api/v1/")
  ) {
    next();
    return;
  }

  const xRequestedWith = req.headers["x-requested-with"];
  if (xRequestedWith !== "XMLHttpRequest") {
    res.status(403).json({ error: "Forbidden: missing CSRF header" });
    return;
  }

  next();
}

export function isSuperRole(role: Role): boolean {
  return role === "SUPER_ADMIN" || role === "PLATFORM_OWNER";
}

/**
 * Optional auth middleware — sets req.user if a valid token is present,
 * but does NOT return 401 if missing. Used for endpoints that must work
 * for unauthenticated users (e.g. frontend crash logging) but should
 * enrich logs with tenant/user context when the user is logged in.
 */
export async function optionalAuthMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const cookieToken = (req as any).cookies?.crm_session;
  const authHeader = req.headers.authorization;
  let token: string | null = null;
  if (cookieToken) token = cookieToken;
  else if (authHeader?.startsWith("Bearer ")) token = authHeader.slice(7);

  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      const [user] = await db
        .select({
          id: usersTable.id,
          email: usersTable.email,
          name: usersTable.name,
          role: usersTable.role,
          active: usersTable.active,
          tenantId: usersTable.tenantId,
          isEmergencyAccount: usersTable.isEmergencyAccount,
          emergencyActivatedAt: usersTable.emergencyActivatedAt,
        })
        .from(usersTable)
        .where(eq(usersTable.id, payload.userId));
      if (user?.active) {
        req.user = user;
      }
    }
  }
  next();
}

export function requireRole(...roles: AuthUser["role"][]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    // SUPER_ADMIN / PLATFORM_OWNER bypasses all role checks unconditionally
    if (isSuperRole(req.user.role)) {
      next();
      return;
    }
    if (!roles.includes(req.user.role)) {
      logger.warn({
        event: 'auth_role_denied',
        userId: req.user.id,
        requiredRole: roles,
        userRole: req.user.role,
        path: req.path,
        requestId: getRequestId(),
      });
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}

export function requireSafeguardingPermission(action: "view" | "create" | "update" | "delete" | "audit") {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // SUPER_ADMIN / PLATFORM_OWNER bypasses all permission checks
    if (isSuperRole(req.user.role)) {
      next();
      return;
    }

    // Map action to permission string
    const permissionMap = {
      "view": "view_safeguarding",
      "create": "create_safeguarding",
      "update": "update_safeguarding",
      "delete": "delete_safeguarding",
      "audit": "audit_safeguarding"
    };

    const requiredPermission = permissionMap[action];
    const hasPermission = canDo(req.user.role, requiredPermission as any);

    if (!hasPermission) {
      logger.warn({
        event: 'safeguarding_permission_denied',
        userId: req.user.id,
        userRole: req.user.role,
        requiredPermission,
        path: req.path,
        requestId: getRequestId(),
      });
      res.status(403).json({ error: "Forbidden: Insufficient safeguarding permissions" });
      return;
    }

    next();
  };
}

/**
 * Blocks DEVELOPER and PLATFORM_BUILDER from accessing tenant CRM data.
 * These roles are system-level only — they must not read or write client records.
 * Apply this to every CRM data route (contacts, notes, organizations, tasks, activities, etc.)
 */
export function denyDevRoles(req: Request, res: Response, next: NextFunction): void {
  const role = req.user?.role;
  if (role === "DEVELOPER" || role === "PLATFORM_BUILDER") {
    res.status(403).json({ error: "Forbidden: developer roles cannot access tenant CRM data" });
    return;
  }
  next();
}

/**
 * Middleware for machine-to-machine app authentication via X-Hubforte-App-Key header.
 * Sets req.app with appId, tenantId, and scopes. Does NOT set req.user.
 */
export async function authenticateApp(req: Request, res: Response, next: NextFunction): Promise<void> {
  const apiKey = req.headers["x-hubforte-app-key"] as string | undefined;
  if (!apiKey) {
    res.status(401).json({ error: "Missing X-Hubforte-App-Key header" });
    return;
  }

  // Hash the incoming key and compare against stored hash — plaintext never stored
  const keyHash = createHash("sha256").update(apiKey).digest("hex");

  const [app] = await db
    .select({
      id: registeredAppsTable.id,
      tenantId: registeredAppsTable.tenantId,
      scopes: registeredAppsTable.scopes,
      status: registeredAppsTable.status,
    })
    .from(registeredAppsTable)
    .where(eq(registeredAppsTable.apiKey, keyHash));

  if (!app || app.status !== "active") {
    res.status(401).json({ error: "Invalid or inactive app key" });
    return;
  }

  // Fix 3: check tenant suspension — same gate as human auth
  const [tenant] = await db
    .select({ suspended: tenantsTable.suspended })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, app.tenantId));

  if (tenant?.suspended) {
    res.status(403).json({ error: "Tenant is suspended" });
    return;
  }

  // Update last used timestamp (fire-and-forget)
  db.update(registeredAppsTable)
    .set({ lastUsedAt: new Date() })
    .where(eq(registeredAppsTable.id, app.id))
    .catch(() => {});

  req.appAuth = {
    appId: app.id,
    tenantId: app.tenantId,
    scopes: (app.scopes as string[]) ?? [],
  };
  next();
}

/**
 * Scope guard for app-authenticated requests.
 * Call after authenticateApp() to enforce a required scope.
 */
export function requireScope(scope: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.appAuth) {
      res.status(401).json({ error: "App authentication required" });
      return;
    }
    if (!req.appAuth.scopes.includes(scope)) {
      res.status(403).json({ error: `Scope required: ${scope}` });
      return;
    }
    next();
  };
}
