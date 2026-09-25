import { Router } from "express";
import { db, sessionAttendanceTable, programmeSessionsTable, studentsTable, programmeCohortsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { authMiddleware, requireRole } from "../../lib/auth";
import { generateId } from "../../lib/id";
import { upsertAttendanceSchema } from "@workspace/api-zod";

const router = Router();

// GET /api/lms/cohorts/:cohortId/attendance — attendance grid
router.get("/cohorts/:cohortId/attendance", authMiddleware, requireRole("OPERATOR", "MANAGER", "ADMIN", "SUPER_ADMIN"), async (req, res): Promise<void> => {
  try {
    const user = req.user!;
    const tenantId = user.tenantId!;
    const cohortId = req.params.cohortId as string;

    const [cohort] = await db
      .select({ id: programmeCohortsTable.id, programmeManagerId: programmeCohortsTable.programmeManagerId })
      .from(programmeCohortsTable)
      // @ts-ignore -- Drizzle and() overload
      .where(and(eq(programmeCohortsTable.id, cohortId), eq(programmeCohortsTable.tenantId, tenantId)));
    if (!cohort) { res.status(404).json({ error: "Cohort not found" }); return; }
    if (user.role === "MANAGER" && cohort.programmeManagerId !== user.id) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    const sessions = await db
      .select({
        id: programmeSessionsTable.id,
        sessionNumber: programmeSessionsTable.sessionNumber,
        sessionType: programmeSessionsTable.sessionType,
        sessionDate: programmeSessionsTable.sessionDate,
        status: programmeSessionsTable.status,
      })
      .from(programmeSessionsTable)
      // @ts-ignore -- Drizzle and() overload
      .where(and(eq(programmeSessionsTable.cohortId, cohortId), eq(programmeSessionsTable.tenantId, tenantId)))
      .orderBy(programmeSessionsTable.sessionNumber);

    // Students — coach scoping
    const studentFilters: any[] = [
      // @ts-ignore -- Drizzle eq() overload
      eq(studentsTable.cohortId, cohortId) as any,
      // @ts-ignore -- Drizzle eq() overload
      eq(studentsTable.tenantId, tenantId) as any,
    ];
    if (user.role === "OPERATOR") studentFilters.push(eq(studentsTable.coachId, user.id));

    const students = await db
      .select({
        id: studentsTable.id,
        firstName: studentsTable.firstName,
        lastName: studentsTable.lastName,
        completionStatus: studentsTable.completionStatus,
      })
      .from(studentsTable)
      // @ts-ignore -- Drizzle and() overload
      .where(and(...studentFilters))
      .orderBy(studentsTable.lastName, studentsTable.firstName);

    const attendance = await db
      .select()
      .from(sessionAttendanceTable)
      // @ts-ignore -- Drizzle and() overload
      .where(and(eq(sessionAttendanceTable.tenantId, tenantId)));

    // Build grid: student → session → attendance record
    const grid = students.map((student) => ({
      student,
      sessions: sessions.map((session) => {
        const record = attendance.find(
          (a) => a.studentId === student.id && a.sessionId === session.id
        );
        return {
          sessionId: session.id,
          sessionNumber: session.sessionNumber,
          sessionType: session.sessionType,
          attended: record?.attended ?? null,
          attendanceStatus: record?.attendanceStatus ?? null,
          notes: record?.notes ?? null,
        };
      }),
    }));

    res.json({ cohortId, sessions, grid });
  } catch (err) {
    console.error("[lms/cohorts/:cohortId/attendance GET]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/lms/attendance — batch upsert
router.put("/", authMiddleware, requireRole("OPERATOR", "MANAGER", "ADMIN", "SUPER_ADMIN"), async (req, res): Promise<void> => {
  try {
    const user = req.user!;
    const tenantId = user.tenantId!;

    const parsed = upsertAttendanceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
      return;
    }
    const records = parsed.data.records ?? [];

    const now = new Date();
    const results: string[] = [];

    for (const rec of records) {
      // Verify student belongs to tenant (and coach scoping)
      const [student] = await db
        .select({ id: studentsTable.id, coachId: studentsTable.coachId, cohortId: studentsTable.cohortId })
        .from(studentsTable)
        // @ts-ignore -- Drizzle and() overload
        .where(and(eq(studentsTable.id, rec.studentId), eq(studentsTable.tenantId, tenantId)));
      if (!student) continue;
      if (user.role === "OPERATOR" && student.coachId !== user.id) continue;
      // PM scoping: MANAGER can only write attendance for students in their cohorts
      if (user.role === "MANAGER" && student.cohortId) {
        const [cohort] = await db
          .select({ programmeManagerId: programmeCohortsTable.programmeManagerId })
          .from(programmeCohortsTable)
          .where(eq(programmeCohortsTable.id, student.cohortId));
        if (cohort && cohort.programmeManagerId !== user.id) continue;
      }

      // Upsert: check existing
      const [existing] = await db
        .select({ id: sessionAttendanceTable.id })
        .from(sessionAttendanceTable)
        // @ts-ignore -- Drizzle and() overload
        .where(and(
          // @ts-ignore -- Drizzle eq() overload
          eq(sessionAttendanceTable.studentId, rec.studentId) as any,
          // @ts-ignore -- Drizzle eq() overload
          eq(sessionAttendanceTable.sessionId, rec.sessionId) as any,
          // @ts-ignore -- Drizzle eq() overload
          eq(sessionAttendanceTable.tenantId, tenantId) as any,
        ) as any);

      if (existing) {
        await db
          .update(sessionAttendanceTable)
          .set({
            attended: rec.attended,
            attendanceStatus: rec.attendanceStatus ?? (rec.attended ? "PRESENT" : "ABSENT"),
            notes: rec.notes ?? null,
            updatedAt: now,
          } as any)
          // @ts-ignore -- chain broken by as any cast
          .where(eq(sessionAttendanceTable.id, existing.id));
        results.push(existing.id);
      } else {
        const id = generateId("sat");
        await db.insert(sessionAttendanceTable).values({
          id,
          tenantId,
          sessionId: rec.sessionId,
          studentId: rec.studentId,
          attended: rec.attended,
          attendanceStatus: rec.attendanceStatus ?? (rec.attended ? "PRESENT" : "ABSENT"),
          notes: rec.notes ?? null,
          createdBy: user.id,
          createdAt: now,
          updatedAt: now,
        } as any);
        results.push(id);
      }
    }

    res.json({ updated: results.length, ids: results });
  } catch (err) {
    console.error("[lms/attendance PUT]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
