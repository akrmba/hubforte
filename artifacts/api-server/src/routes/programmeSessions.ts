import { Router, type IRouter } from "express";
import { db, programmeSessionsTable, sessionAttendanceTable, studentsTable } from "@workspace/db";
import { eq, and, desc, count } from "drizzle-orm";
import { authMiddleware, requireRole, denyDevRoles } from "../lib/auth";
import { generateId } from "../lib/id";
import { sanitiseInput } from "../lib/sanitise";

const router: IRouter = Router();

// GET /programme-sessions?programmeId=xxx&cohortId=xxx&status=xxx&page=1&limit=20
router.get("/", authMiddleware, denyDevRoles, async (req, res): Promise<void> => {
  const { programmeId, cohortId, status, page = "1", limit = "20" } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(100, parseInt(limit, 10));
  const offset = (pageNum - 1) * limitNum;
  const tenantId = req.user!.tenantId;

  const conditions = [];
  if (tenantId) conditions.push(eq(programmeSessionsTable.tenantId, tenantId));
  if (programmeId) conditions.push(eq(programmeSessionsTable.programmeId, programmeId));
  if (cohortId) conditions.push(eq(programmeSessionsTable.cohortId, cohortId));
  if (status) conditions.push(eq(programmeSessionsTable.status, status as any));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [sessions, totalResult] = await Promise.all([
    db.select().from(programmeSessionsTable).where(where).limit(limitNum).offset(offset).orderBy(desc(programmeSessionsTable.sessionDate)),
    db.select({ count: count() }).from(programmeSessionsTable).where(where),
  ]);

  const total = totalResult[0]?.count ?? 0;
  res.json({ data: sessions, total, page: pageNum, totalPages: Math.ceil(total / limitNum) });
});

// GET /programme-sessions/:id
router.get("/:id", authMiddleware, denyDevRoles, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const tenantId = req.user!.tenantId;

  const [session] = await db.select().from(programmeSessionsTable)
    .where(and(eq(programmeSessionsTable.id, rawId), tenantId ? eq(programmeSessionsTable.tenantId, tenantId) : undefined));

  if (!session) { res.status(404).json({ error: "Session not found" }); return; }

  // Fetch attendance for this session
  const attendance = await db
    .select({
      id: sessionAttendanceTable.id,
      studentId: sessionAttendanceTable.studentId,
      studentFirstName: studentsTable.firstName,
      studentLastName: studentsTable.lastName,
      attended: sessionAttendanceTable.attended,
      attendanceStatus: sessionAttendanceTable.attendanceStatus,
      notes: sessionAttendanceTable.notes,
    })
    .from(sessionAttendanceTable)
    .leftJoin(studentsTable, eq(sessionAttendanceTable.studentId, studentsTable.id))
    .where(and(eq(sessionAttendanceTable.sessionId, rawId), tenantId ? eq(sessionAttendanceTable.tenantId, tenantId) : undefined));

  res.json({ ...session, attendance });
});

// POST /programme-sessions
router.post("/", authMiddleware, denyDevRoles, requireRole("ADMIN", "MANAGER", "OPERATOR"), async (req, res): Promise<void> => {
  const user = req.user!;
  const raw = sanitiseInput(req.body as Record<string, unknown>) as any;

  if (!raw.programmeId) {
    res.status(400).json({ error: "programmeId is required" }); return;
  }

  const id = generateId("ses");
  const [session] = await db.insert(programmeSessionsTable).values({
    id,
    tenantId: user.tenantId,
    programmeId: raw.programmeId,
    cohortId: raw.cohortId || null,
    sessionNumber: raw.sessionNumber ? parseInt(raw.sessionNumber, 10) : null,
    sessionDate: raw.sessionDate || null,
    startTime: raw.startTime || null,
    endTime: raw.endTime || null,
    venue: raw.venue || null,
    deliveryFormat: raw.deliveryFormat || null,
    facilitatorId: raw.facilitatorId || null,
    volunteerIds: raw.volunteerIds || null,
    topic: raw.topic || null,
    description: raw.description || null,
    status: raw.status || "SCHEDULED",
    notes: raw.notes || null,
    createdBy: user.id,
  }).returning();

  res.status(201).json(session);
});

// PATCH /programme-sessions/:id
router.patch("/:id", authMiddleware, denyDevRoles, requireRole("ADMIN", "MANAGER", "OPERATOR"), async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const tenantId = req.user!.tenantId;
  const raw = sanitiseInput(req.body as Record<string, unknown>) as any;

  const updates: Record<string, any> = {};
  const fields = ["cohortId", "sessionNumber", "sessionDate", "startTime", "endTime", "venue", "deliveryFormat", "facilitatorId", "volunteerIds", "topic", "description", "status", "notes"];
  for (const f of fields) {
    if (raw[f] !== undefined) updates[f] = raw[f];
  }
  if (raw.sessionNumber !== undefined) updates.sessionNumber = parseInt(raw.sessionNumber, 10) || null;

  const [session] = await db.update(programmeSessionsTable).set(updates)
    .where(and(eq(programmeSessionsTable.id, rawId), tenantId ? eq(programmeSessionsTable.tenantId, tenantId) : undefined))
    .returning();

  if (!session) { res.status(404).json({ error: "Not found" }); return; }
  res.json(session);
});

// DELETE /programme-sessions/:id
router.delete("/:id", authMiddleware, denyDevRoles, requireRole("ADMIN"), async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const tenantId = req.user!.tenantId;

  await db.update(programmeSessionsTable).set({ status: "CANCELLED" })
    .where(and(eq(programmeSessionsTable.id, rawId), tenantId ? eq(programmeSessionsTable.tenantId, tenantId) : undefined));

  res.json({ success: true });
});

export default router;
