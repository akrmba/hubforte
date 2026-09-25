import { Router, type IRouter } from "express";
import { db, usersTable, sessionsTable, errorLogsTable } from "@workspace/db";
import { and, eq, desc, count, inArray, sql } from "drizzle-orm";
import { authMiddleware } from "../lib/auth";
import { auditMiddleware } from "../lib/audit";
import { generateId } from "../lib/id";
import bcryptjs from "bcryptjs";
import { logger } from "../lib/logger";
import { canEnableModule, canDisableModule, getTenantModulesWithDependencies } from "../lib/featureFlags";
import { sendGmailEmail } from "../lib/gmail";
import { tenantsTable } from "@workspace/db";

const router: IRouter = Router();

const ADMIN_ROLES = new Set(["ADMIN", "SUPER_ADMIN", "PLATFORM_OWNER", "WORKSPACE_OWNER", "WORKSPACE_ADMIN"]);

const adminOnly = (req: any, res: any, next: any) => {
  if (!ADMIN_ROLES.has(req.user?.role)) {
    res.status(403).json({ error: "Admin only" });
    return;
  }
  next();
};

router.get("/admin/users", authMiddleware, adminOnly, async (req, res): Promise<void> => {
  const tenantId = req.user!.tenantId;
  const users = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      role: usersTable.role,
      active: usersTable.active,
      image: usersTable.image,
      jobTitle: usersTable.jobTitle,
      createdAt: usersTable.createdAt,
      updatedAt: usersTable.updatedAt,
    })
    .from(usersTable)
    .where(tenantId ? eq(usersTable.tenantId, tenantId) : undefined)
    .orderBy(usersTable.createdAt);

  const userIds = users.map((u) => u.id);
  const sessionCounts =
    userIds.length > 0
      ? await db
          .select({ userId: sessionsTable.userId, cnt: count() })
          .from(sessionsTable)
          .where(inArray(sessionsTable.userId, userIds))
          .groupBy(sessionsTable.userId)
      : [];

  const sessionCountMap = new Map(sessionCounts.map((s) => [s.userId, s.cnt]));

  res.json(
    users.map((u) => ({
      ...u,
      sessionCount: sessionCountMap.get(u.id) ?? 0,
      lastLoginAt: null,
    }))
  );
});

router.patch("/admin/users/:id", authMiddleware, adminOnly, auditMiddleware("user"), async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const user = req.user!;
  const tenantId = req.user!.tenantId;

  if (rawId === user.id && req.body.active === false) {
    res.status(400).json({ error: "Cannot deactivate yourself" });
    return;
  }

  const updates: Record<string, any> = {};
  if (req.body.role !== undefined) {
    // Only SUPER_ADMIN can assign the SUPER_ADMIN role
    if (req.body.role === "SUPER_ADMIN" && user.role !== "SUPER_ADMIN") {
      res.status(403).json({ error: "Only a Super Admin can assign the Super Admin role" });
      return;
    }
    // Platform-engineering roles must never be assigned to tenant users via the update path
    const PLATFORM_ONLY_ROLES = ["DEVELOPER", "PLATFORM_BUILDER"];
    if (PLATFORM_ONLY_ROLES.includes(req.body.role) && user.role !== "SUPER_ADMIN") {
      res.status(403).json({ error: "Platform engineering roles cannot be assigned to tenant users" });
      return;
    }
    updates.role = req.body.role;
  }
  if (req.body.active !== undefined) updates.active = req.body.active;

  const [updated] = await db
    .update(usersTable)
    .set(updates)
    .where(and(eq(usersTable.id, rawId), tenantId ? eq(usersTable.tenantId, tenantId) : undefined))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(updated);
});

router.get("/admin/error-logs", authMiddleware, adminOnly, async (req, res): Promise<void> => {
  const tenantId = req.user!.tenantId;
  const logs = await db
    .select()
    .from(errorLogsTable)
    .where(
      tenantId
        ? sql`${errorLogsTable.userId} IN (
            SELECT ${usersTable.id}
            FROM ${usersTable}
            WHERE ${usersTable.tenantId} = ${tenantId}
          )`
        : undefined
    )
    .orderBy(desc(errorLogsTable.createdAt))
    .limit(100);

  res.json(logs);
});

router.patch("/admin/error-logs/:id/resolve", authMiddleware, adminOnly, auditMiddleware("error_log"), async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { note } = req.body;
  const tenantId = req.user!.tenantId;

  const [updated] = await db
    .update(errorLogsTable)
    .set({
      resolved: true,
      resolvedAt: new Date(),
      resolvedNote: note || null,
    })
    .where(
      and(
        eq(errorLogsTable.id, rawId),
        tenantId
          ? sql`${errorLogsTable.userId} IN (
              SELECT ${usersTable.id}
              FROM ${usersTable}
              WHERE ${usersTable.tenantId} = ${tenantId}
            )`
          : undefined
      )
    )
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Error log not found" });
    return;
  }

  res.json(updated);
});

router.post("/admin/users/invite", authMiddleware, adminOnly, auditMiddleware("user_invite"), async (req, res): Promise<void> => {
  const { email, role } = req.body;
  const tenantId = req.user!.tenantId;
  if (!email) {
    res.status(400).json({ error: "Email required" });
    return;
  }

  // DEVELOPER and PLATFORM_BUILDER are platform-engineering roles — they must never be
  // assigned to tenant team members. They block all tenant CRM data access in auth.ts
  // and would silently fail every CRM action if assigned to a regular user.
  const PLATFORM_ONLY_ROLES = ["DEVELOPER", "PLATFORM_BUILDER"];
  const validRoles = ["ADMIN", "MANAGER", "OPERATOR", "VIEWER"];
  if (!validRoles.includes(role)) {
    res.status(400).json({ error: "Role must be one of: ADMIN, MANAGER, OPERATOR, VIEWER" });
    return;
  }
  if (PLATFORM_ONLY_ROLES.includes(role) && req.user?.role !== "SUPER_ADMIN") {
    res.status(403).json({ error: "Platform engineering roles cannot be assigned to tenant users" });
    return;
  }

  const [existing] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.email, email), tenantId ? eq(usersTable.tenantId, tenantId) : undefined));
  if (existing) {
    res.status(409).json({ error: "A user with that email already exists" });
    return;
  }

  const inviteToken = generateId("inv") + generateId("inv");
  const inviteTokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const userId = generateId("usr");

  try {
    await db.insert(usersTable).values({
      id: userId,
      email,
      role: role,
      active: true,
      inviteToken,
      inviteTokenExpiresAt,
      tenantId: req.user!.tenantId,
    });
  } catch (error: any) {
    if (error?.code === "23505") {
      res.status(409).json({ error: "A user with that email already exists" });
      return;
    }
    throw error;
  }

  const appUrl = process.env.APP_URL || "http://localhost:5173";
  const inviteLink = `${appUrl}/accept-invite?token=${inviteToken}`;

  const [tenant] = await db.select({ name: tenantsTable.name }).from(tenantsTable).where(eq(tenantsTable.id, tenantId!)).limit(1);
  const tenantName = tenant?.name ?? "Hubforte";

  const gmailConfigured = !!process.env.GMAIL_REFRESH_TOKEN;
  if (gmailConfigured) {
    try {
      await sendGmailEmail({
        to: email,
        subject: `You've been invited to ${tenantName} on Hubforte`,
        body: `Hi,\n\nYou've been invited to join ${tenantName} on Hubforte as ${role}.\n\nAccept your invitation here:\n${inviteLink}\n\nThis link expires in 7 days.\n\nIf you weren't expecting this invitation, you can ignore this email.`,
      } as any);
    } catch (err) {
      logger.error({ err, email }, "Failed to send invite email");
    }
  } else {
    logger.info({ inviteLink, email, role: role }, "[DEV INVITE] Gmail not configured — invite link:");
  }

  res.json({ success: true, inviteToken, email, inviteLink });
});

// DELETE /admin/users/:id
router.delete("/admin/users/:id", authMiddleware, adminOnly, auditMiddleware("user"), async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const user = req.user!;
  const tenantId = req.user!.tenantId;

  if (rawId === user.id) {
    res.status(400).json({ error: "Cannot delete yourself" });
    return;
  }

  // Delete sessions first, then user
  await db.delete(sessionsTable).where(eq(sessionsTable.userId, rawId));
  const [deleted] = await db
    .delete(usersTable)
    .where(and(eq(usersTable.id, rawId), tenantId ? eq(usersTable.tenantId, tenantId) : undefined))
    .returning({ id: usersTable.id });

  if (!deleted) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({ success: true });
});

// POST /admin/users/:id/force-logout — delete all sessions for a user
router.post("/admin/users/:id/force-logout", authMiddleware, adminOnly, auditMiddleware("user"), async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const tenantId = req.user!.tenantId;

  // Verify user belongs to this tenant
  const [target] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.id, rawId), tenantId ? eq(usersTable.tenantId, tenantId) : undefined));

  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const result = await db.delete(sessionsTable).where(eq(sessionsTable.userId, rawId)).returning({ id: sessionsTable.id });
  res.json({ success: true, sessionsRevoked: result.length });
});

// GET /admin/users/:id/login-history — last 10 sessions
router.get("/admin/users/:id/login-history", authMiddleware, adminOnly, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const tenantId = req.user!.tenantId;

  const [target] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.id, rawId), tenantId ? eq(usersTable.tenantId, tenantId) : undefined));

  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const sessions = await db
    .select({
      id: sessionsTable.id,
      createdAt: sessionsTable.createdAt,
      expiresAt: sessionsTable.expiresAt,
    })
    .from(sessionsTable)
    .where(eq(sessionsTable.userId, rawId))
    .orderBy(desc(sessionsTable.createdAt))
    .limit(10);

  res.json(sessions);
});

// POST /admin/users/:id/reset-2fa — clears TOTP secret so user must re-enroll
router.post("/admin/users/:id/reset-2fa", authMiddleware, adminOnly, auditMiddleware("user"), async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const tenantId = req.user!.tenantId;

  const [updated] = await db
    .update(usersTable)
    .set({ totpSecret: null, totpEnabled: false, totpPendingSecret: null })
    .where(and(eq(usersTable.id, rawId), tenantId ? eq(usersTable.tenantId, tenantId) : undefined))
    .returning({ id: usersTable.id });

  if (!updated) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({ success: true });
});

// POST /admin/users/:id/reset-password — generates a new invite token for password reset
router.post("/admin/users/:id/reset-password", authMiddleware, adminOnly, auditMiddleware("user"), async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const tenantId = req.user!.tenantId;

  const resetToken = generateId("rst") + generateId("rst");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const [updated] = await db
    .update(usersTable)
    .set({ inviteToken: resetToken, inviteTokenExpiresAt: expiresAt })
    .where(and(eq(usersTable.id, rawId), tenantId ? eq(usersTable.tenantId, tenantId) : undefined))
    .returning({ id: usersTable.id, email: usersTable.email });

  if (!updated) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const appUrl = process.env.APP_URL || "http://localhost:5173";
  res.json({
    success: true,
    resetLink: `${appUrl}/accept-invite?token=${resetToken}`,
    resetToken,
    email: updated.email,
  });
});

// GET /admin/users/pending-invites — users with invite token not yet accepted
router.get("/admin/users/pending-invites", authMiddleware, adminOnly, async (req, res): Promise<void> => {
  const tenantId = req.user!.tenantId;

  const pending = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      role: usersTable.role,
      inviteTokenExpiresAt: usersTable.inviteTokenExpiresAt,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .where(
      and(
        tenantId ? eq(usersTable.tenantId, tenantId) : undefined,
        sql`${usersTable.inviteToken} IS NOT NULL`,
        sql`${usersTable.passwordHash} IS NULL`
      )
    )
    .orderBy(desc(usersTable.createdAt));

  res.json(pending);
});

// DELETE /admin/users/pending-invites/:id — cancel a pending invite
router.delete("/admin/users/pending-invites/:id", authMiddleware, adminOnly, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const tenantId = req.user!.tenantId;

  const [target] = await db
    .select({ id: usersTable.id, passwordHash: usersTable.passwordHash })
    .from(usersTable)
    .where(and(eq(usersTable.id, rawId), tenantId ? eq(usersTable.tenantId, tenantId) : undefined));

  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (target.passwordHash) {
    res.status(400).json({ error: "User has already accepted the invite" });
    return;
  }

  await db.delete(usersTable).where(eq(usersTable.id, rawId));
  res.json({ success: true });
});

// POST /admin/users/invite/resend/:id — regenerate invite token
router.post("/admin/users/invite/resend/:id", authMiddleware, adminOnly, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const tenantId = req.user!.tenantId;

  const newToken = generateId("inv") + generateId("inv");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const [updated] = await db
    .update(usersTable)
    .set({ inviteToken: newToken, inviteTokenExpiresAt: expiresAt })
    .where(
      and(
        eq(usersTable.id, rawId),
        tenantId ? eq(usersTable.tenantId, tenantId) : undefined,
        sql`${usersTable.passwordHash} IS NULL`
      )
    )
    .returning({ id: usersTable.id, email: usersTable.email });

  if (!updated) {
    res.status(404).json({ error: "Pending invite not found" });
    return;
  }

  const appUrl = process.env.APP_URL || "http://localhost:5173";
  res.json({
    success: true,
    inviteToken: newToken,
    inviteLink: `${appUrl}/accept-invite?token=${newToken}`,
    email: updated.email,
  });
});

// Module dependency checking endpoints
router.get("/admin/modules/:module/can-enable", authMiddleware, adminOnly, async (req, res): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId;
    const { module } = req.params;

    const { canEnable, missingDependencies, conflicts } = await canEnableModule(Array.isArray(module) ? module[0] : module, tenantId || "");

    res.json({ module, canEnable, missingDependencies, conflicts });
  } catch (error) {
    logger.error({ error }, "Error checking if module can be enabled");
    res.status(500).json({ error: "Failed to check module enablement" });
  }
});

router.get("/admin/modules/:module/can-disable", authMiddleware, adminOnly, async (req, res): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId;
    const { module } = req.params;

    const { canDisable, dependents } = await canDisableModule(Array.isArray(module) ? module[0] : module, tenantId || "");

    res.json({ module, canDisable, dependents });
  } catch (error) {
    logger.error({ error }, "Error checking if module can be disabled");
    res.status(500).json({ error: "Failed to check module disablement" });
  }
});

router.get("/admin/modules/with-dependencies", authMiddleware, adminOnly, async (req, res): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId;
    const modules = await getTenantModulesWithDependencies(tenantId || "");

    res.json(modules);
  } catch (error) {
    logger.error({ error }, "Error getting modules with dependencies");
    res.status(500).json({ error: "Failed to get modules with dependencies" });
  }
});

export default router;
