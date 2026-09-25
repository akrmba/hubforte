import { Router, type IRouter } from "express";
import { db, safeguardingAccessLogTable, safeguardingNotesTable, usersTable } from "@workspace/db";
import { eq, and, desc, count, between, gte, lte, sql } from "drizzle-orm";
import { authMiddleware, requireSafeguardingPermission , denyDevRoles } from "../lib/auth";
import { checkModuleEnabled } from "../lib/featureFlags";

const router: IRouter = Router();

// GET /safeguarding-access-logs?startDate=xxx&endDate=xxx&userId=xxx&noteId=xxx&accessType=xxx&page=1&limit=50
router.get("/", authMiddleware, denyDevRoles, checkModuleEnabled("safeguarding"), requireSafeguardingPermission("audit"), async (req, res): Promise<void> => {
  const { 
    startDate, endDate, userId, noteId, accessType,
    page = "1", limit = "50" 
  } = req.query as Record<string, string>;
  
  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(100, parseInt(limit, 10)); // Limit for audit logs
  const offset = (pageNum - 1) * limitNum;
  const user = req.user!;
  const tenantId = user.tenantId ?? null;

  if (!tenantId && user.role !== "SUPER_ADMIN") {
    res.status(403).json({ error: "No tenant assigned to this user" });
    return;
  }

  const conditions = [];
  if (tenantId) conditions.push(eq(safeguardingAccessLogTable.tenantId, tenantId));
  
  if (userId) conditions.push(eq(safeguardingAccessLogTable.userId, userId));
  if (noteId) conditions.push(eq(safeguardingAccessLogTable.safeguardingNoteId, noteId));
  if (accessType) conditions.push(eq(safeguardingAccessLogTable.accessType, accessType as any));
  
  // Date range filtering
  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999); // End of day
    conditions.push(between(safeguardingAccessLogTable.accessTimestamp, start, end));
  } else if (startDate) {
    const start = new Date(startDate);
    conditions.push(gte(safeguardingAccessLogTable.accessTimestamp, start));
  } else if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    conditions.push(lte(safeguardingAccessLogTable.accessTimestamp, end));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [logs, totalResult] = await Promise.all([
    db.select({
      id: safeguardingAccessLogTable.id,
      accessTimestamp: safeguardingAccessLogTable.accessTimestamp,
      accessType: safeguardingAccessLogTable.accessType,
      userId: safeguardingAccessLogTable.userId,
      userName: usersTable.name,
      userEmail: usersTable.email,
      noteId: safeguardingAccessLogTable.safeguardingNoteId,
      noteTitle: safeguardingNotesTable.title,
      ipAddress: safeguardingAccessLogTable.ipAddress,
      accessedFields: safeguardingAccessLogTable.accessedFields,
      reasonForAccess: safeguardingAccessLogTable.reasonForAccess,
    })
    .from(safeguardingAccessLogTable)
    .leftJoin(usersTable, eq(safeguardingAccessLogTable.userId, usersTable.id))
    .leftJoin(safeguardingNotesTable, eq(safeguardingAccessLogTable.safeguardingNoteId, safeguardingNotesTable.id))
    .where(where)
    .limit(limitNum)
    .offset(offset)
    .orderBy(desc(safeguardingAccessLogTable.accessTimestamp)),
    
    db.select({ count: count() }).from(safeguardingAccessLogTable).where(where),
  ]);

  const total = totalResult[0]?.count ?? 0;
  res.json({ data: logs, total, page: pageNum, totalPages: Math.ceil(total / limitNum) });
});

// GET /safeguarding-access-logs/note/:noteId
router.get("/note/:noteId", authMiddleware, denyDevRoles, checkModuleEnabled("safeguarding"), requireSafeguardingPermission("audit"), async (req, res): Promise<void> => {
  const noteId = Array.isArray(req.params.noteId) ? req.params.noteId[0] : req.params.noteId;
  const user = req.user!;
  const tenantId = user.tenantId ?? null;
  const { startDate, endDate, page = "1", limit = "50" } = req.query as Record<string, string>;

  if (!tenantId && user.role !== "SUPER_ADMIN") {
    res.status(403).json({ error: "No tenant assigned to this user" });
    return;
  }

  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(100, parseInt(limit, 10));
  const offset = (pageNum - 1) * limitNum;

  // First verify the note exists and belongs to tenant
  const noteCondition = tenantId
    ? and(eq(safeguardingNotesTable.id, noteId), eq(safeguardingNotesTable.tenantId, tenantId))
    : eq(safeguardingNotesTable.id, noteId);
  const [note] = await db.select().from(safeguardingNotesTable).where(noteCondition);

  if (!note) { res.status(404).json({ error: "Safeguarding note not found" }); return; }

  const effectiveTenantId: string = tenantId ?? note.tenantId!;

  const conditions = [
    eq(safeguardingAccessLogTable.tenantId, effectiveTenantId),
    eq(safeguardingAccessLogTable.safeguardingNoteId, noteId),
  ];
  
  // Date range filtering
  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    conditions.push(between(safeguardingAccessLogTable.accessTimestamp, start, end));
  }

  const where = and(...conditions);

  const [logs, totalResult] = await Promise.all([
    db.select({
      id: safeguardingAccessLogTable.id,
      accessTimestamp: safeguardingAccessLogTable.accessTimestamp,
      accessType: safeguardingAccessLogTable.accessType,
      userId: safeguardingAccessLogTable.userId,
      userName: usersTable.name,
      userEmail: usersTable.email,
      ipAddress: safeguardingAccessLogTable.ipAddress,
      accessedFields: safeguardingAccessLogTable.accessedFields,
      reasonForAccess: safeguardingAccessLogTable.reasonForAccess,
    })
    .from(safeguardingAccessLogTable)
    .leftJoin(usersTable, eq(safeguardingAccessLogTable.userId, usersTable.id))
    .where(where)
    .limit(limitNum)
    .offset(offset)
    .orderBy(desc(safeguardingAccessLogTable.accessTimestamp)),
    
    db.select({ count: count() }).from(safeguardingAccessLogTable).where(where),
  ]);

  const total = totalResult[0]?.count ?? 0;
  res.json({ 
    note: { id: note.id, title: note.title, studentId: note.studentId },
    accessLogs: { data: logs, total, page: pageNum, totalPages: Math.ceil(total / limitNum) }
  });
});

// GET /safeguarding-access-logs/user/:userId
router.get("/user/:userId", authMiddleware, denyDevRoles, checkModuleEnabled("safeguarding"), requireSafeguardingPermission("audit"), async (req, res): Promise<void> => {
  const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const user = req.user!;
  const tenantId = user.tenantId ?? null;
  const { startDate, endDate, page = "1", limit = "50" } = req.query as Record<string, string>;

  if (!tenantId && user.role !== "SUPER_ADMIN") {
    res.status(403).json({ error: "No tenant assigned to this user" });
    return;
  }

  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(100, parseInt(limit, 10));
  const offset = (pageNum - 1) * limitNum;

  // Verify user exists and belongs to tenant (or is SUPER_ADMIN)
  const [targetUser] = await db.select().from(usersTable)
    .where(tenantId ? and(eq(usersTable.id, userId), eq(usersTable.tenantId, tenantId)) : eq(usersTable.id, userId));

  if (!targetUser) { res.status(404).json({ error: "User not found" }); return; }

  const effectiveTenantId: string = tenantId ?? targetUser.tenantId!;

  const conditions = [
    eq(safeguardingAccessLogTable.tenantId, effectiveTenantId),
    eq(safeguardingAccessLogTable.userId, userId),
  ];
  
  // Date range filtering
  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    conditions.push(between(safeguardingAccessLogTable.accessTimestamp, start, end));
  }

  const where = and(...conditions);

  const [logs, totalResult] = await Promise.all([
    db.select({
      id: safeguardingAccessLogTable.id,
      accessTimestamp: safeguardingAccessLogTable.accessTimestamp,
      accessType: safeguardingAccessLogTable.accessType,
      noteId: safeguardingAccessLogTable.safeguardingNoteId,
      noteTitle: safeguardingNotesTable.title,
      ipAddress: safeguardingAccessLogTable.ipAddress,
      accessedFields: safeguardingAccessLogTable.accessedFields,
      reasonForAccess: safeguardingAccessLogTable.reasonForAccess,
    })
    .from(safeguardingAccessLogTable)
    .leftJoin(safeguardingNotesTable, eq(safeguardingAccessLogTable.safeguardingNoteId, safeguardingNotesTable.id))
    .where(where)
    .limit(limitNum)
    .offset(offset)
    .orderBy(desc(safeguardingAccessLogTable.accessTimestamp)),
    
    db.select({ count: count() }).from(safeguardingAccessLogTable).where(where),
  ]);

  const total = totalResult[0]?.count ?? 0;
  res.json({ 
    user: { id: targetUser.id, name: targetUser.name, email: targetUser.email, role: targetUser.role },
    accessLogs: { data: logs, total, page: pageNum, totalPages: Math.ceil(total / limitNum) }
  });
});

// GET /safeguarding-access-logs/stats/summary
router.get("/stats/summary", authMiddleware, denyDevRoles, checkModuleEnabled("safeguarding"), requireSafeguardingPermission("audit"), async (req, res): Promise<void> => {
  const user = req.user!;
  const tenantId = user.tenantId ?? null;
  const { startDate, endDate } = req.query as Record<string, string>;

  if (!tenantId && user.role !== "SUPER_ADMIN") {
    res.status(403).json({ error: "No tenant assigned to this user" });
    return;
  }

  const conditions = tenantId ? [eq(safeguardingAccessLogTable.tenantId, tenantId)] : [];
  
  // Date range filtering
  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    conditions.push(between(safeguardingAccessLogTable.accessTimestamp, start, end));
  }

  const where = and(...conditions);

  // Get access type distribution
  const accessTypeStats = await db.select({
    accessType: safeguardingAccessLogTable.accessType,
    count: count(),
  })
  .from(safeguardingAccessLogTable)
  .where(where)
  .groupBy(safeguardingAccessLogTable.accessType);

  // Get top users by access count
  const topUsers = await db.select({
    userId: safeguardingAccessLogTable.userId,
    userName: usersTable.name,
    count: count(),
  })
  .from(safeguardingAccessLogTable)
  .leftJoin(usersTable, eq(safeguardingAccessLogTable.userId, usersTable.id))
  .where(where)
  .groupBy(safeguardingAccessLogTable.userId, usersTable.name)
  .orderBy(desc(count()))
  .limit(10);

  // Get top notes by access count
  const topNotes = await db.select({
    noteId: safeguardingAccessLogTable.safeguardingNoteId,
    noteTitle: safeguardingNotesTable.title,
    count: count(),
  })
  .from(safeguardingAccessLogTable)
  .leftJoin(safeguardingNotesTable, eq(safeguardingAccessLogTable.safeguardingNoteId, safeguardingNotesTable.id))
  .where(where)
  .groupBy(safeguardingAccessLogTable.safeguardingNoteId, safeguardingNotesTable.title)
  .orderBy(desc(count()))
  .limit(10);

  // Get daily access trend (last 30 days if no date range)
  let trendDays = 30;
  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    trendDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  const trendStart = new Date();
  trendStart.setDate(trendStart.getDate() - trendDays);
  
  const dailyTrend = await db.select({
    date: sql<string>`DATE(${safeguardingAccessLogTable.accessTimestamp})`,
    count: count(),
  })
  .from(safeguardingAccessLogTable)
  .where(and(
    eq(safeguardingAccessLogTable.tenantId, tenantId!),
    gte(safeguardingAccessLogTable.accessTimestamp, trendStart)
  ))
  .groupBy(sql`DATE(${safeguardingAccessLogTable.accessTimestamp})`)
  .orderBy(sql`DATE(${safeguardingAccessLogTable.accessTimestamp})`);

  res.json({
    summary: {
      totalAccesses: accessTypeStats.reduce((sum, stat) => sum + stat.count, 0),
      accessTypeDistribution: accessTypeStats,
      topUsers,
      topNotes,
      dailyTrend,
      dateRange: { startDate, endDate },
    }
  });
});

export default router;