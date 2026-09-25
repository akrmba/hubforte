import { Router, type IRouter } from "express";
import { db, sessionAttendanceTable, studentsTable } from "@workspace/db";
import { eq, and, count } from "drizzle-orm";
import { authMiddleware, requireRole, denyDevRoles } from "../lib/auth";
import { generateId } from "../lib/id";
import { sanitiseInput } from "../lib/sanitise";

const router: IRouter = Router();

// GET /session-attendance?sessionId=xxx&studentId=xxx
router.get("/", authMiddleware, denyDevRoles, async (req, res): Promise<void> => {
  const { sessionId, studentId } = req.query as Record<string, string>;
  const tenantId = req.user!.tenantId;

  const conditions = [];
  if (tenantId) conditions.push(eq(sessionAttendanceTable.tenantId, tenantId));
  if (sessionId) conditions.push(eq(sessionAttendanceTable.sessionId, sessionId));
  if (studentId) conditions.push(eq(sessionAttendanceTable.studentId, studentId));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const records = await db
    .select({
      id: sessionAttendanceTable.id,
      sessionId: sessionAttendanceTable.sessionId,
      studentId: sessionAttendanceTable.studentId,
      studentFirstName: studentsTable.firstName,
      studentLastName: studentsTable.lastName,
      attended: sessionAttendanceTable.attended,
      attendanceStatus: sessionAttendanceTable.attendanceStatus,
      notes: sessionAttendanceTable.notes,
      createdBy: sessionAttendanceTable.createdBy,
      createdAt: sessionAttendanceTable.createdAt,
    })
    .from(sessionAttendanceTable)
    .leftJoin(studentsTable, eq(sessionAttendanceTable.studentId, studentsTable.id))
    .where(where);

  res.json({ data: records });
});

// POST /session-attendance (single record)
router.post("/", authMiddleware, denyDevRoles, requireRole("ADMIN", "MANAGER", "OPERATOR"), async (req, res): Promise<void> => {
  const user = req.user!;
  const raw = sanitiseInput(req.body as Record<string, unknown>) as any;

  if (!raw.sessionId || !raw.studentId) {
    res.status(400).json({ error: "sessionId and studentId are required" }); return;
  }

  const id = generateId("att");
  const [record] = await db.insert(sessionAttendanceTable).values({
    id,
    tenantId: user.tenantId,
    sessionId: raw.sessionId,
    studentId: raw.studentId,
    attended: raw.attended === true || raw.attended === "true",
    attendanceStatus: raw.attendanceStatus || (raw.attended ? "PRESENT" : "ABSENT"),
    notes: raw.notes || null,
    createdBy: user.id,
  }).returning();

  res.status(201).json(record);
});

// POST /session-attendance/batch (bulk attendance for a session)
router.post("/batch", authMiddleware, denyDevRoles, requireRole("ADMIN", "MANAGER", "OPERATOR"), async (req, res): Promise<void> => {
  const user = req.user!;
  const raw = req.body as any;

  if (!raw.sessionId || !Array.isArray(raw.records)) {
    res.status(400).json({ error: "sessionId and records[] are required" }); return;
  }

  const values = raw.records.map((r: any) => ({
    id: generateId("att"),
    tenantId: user.tenantId,
    sessionId: raw.sessionId,
    studentId: r.studentId,
    attended: r.attended === true || r.attended === "true",
    attendanceStatus: r.attendanceStatus || (r.attended ? "PRESENT" : "ABSENT"),
    notes: r.notes || null,
    createdBy: user.id,
  }));

  const results = await db.insert(sessionAttendanceTable).values(values).returning();
  res.status(201).json({ data: results, count: results.length });
});

// PATCH /session-attendance/:id
router.patch("/:id", authMiddleware, denyDevRoles, requireRole("ADMIN", "MANAGER", "OPERATOR"), async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const tenantId = req.user!.tenantId;
  const raw = sanitiseInput(req.body as Record<string, unknown>) as any;

  const updates: Record<string, any> = {};
  if (raw.attended !== undefined) updates.attended = raw.attended === true || raw.attended === "true";
  if (raw.attendanceStatus !== undefined) updates.attendanceStatus = raw.attendanceStatus;
  if (raw.notes !== undefined) updates.notes = raw.notes;

  const [record] = await db.update(sessionAttendanceTable).set(updates)
    .where(and(eq(sessionAttendanceTable.id, rawId), tenantId ? eq(sessionAttendanceTable.tenantId, tenantId) : undefined))
    .returning();

  if (!record) { res.status(404).json({ error: "Not found" }); return; }
  res.json(record);
});

// DELETE /session-attendance/:id
router.delete("/:id", authMiddleware, denyDevRoles, requireRole("ADMIN"), async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const tenantId = req.user!.tenantId;

  await db.delete(sessionAttendanceTable)
    .where(and(eq(sessionAttendanceTable.id, rawId), tenantId ? eq(sessionAttendanceTable.tenantId, tenantId) : undefined));

  res.json({ success: true });
});

export default router;
