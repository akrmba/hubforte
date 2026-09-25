import { Router } from "express";
import { db, studentsTable, sessionAttendanceTable, programmeCohortsTable, auditLogs } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { authMiddleware, requireRole } from "../../lib/auth";
import { generateId } from "../../lib/id";
import { z } from "zod";

const router = Router();

const attendanceOverrideSchema = z.object({
  reason: z.string().min(10, "Reason must be at least 10 characters"),
  overrideType: z.enum(["include_despite_low_attendance", "exclude_despite_sufficient_attendance"]),
});

// POST /api/lms/students/:id/attendance-override
router.post("/students/:id/attendance-override", authMiddleware, requireRole("MANAGER", "ADMIN", "SUPER_ADMIN"), async (req, res): Promise<void> => {
  try {
    const user = req.user!;
    const tenantId = user.tenantId!;
    const id = req.params.id as string;

    const [student] = await db
      .select({ id: studentsTable.id, cohortId: studentsTable.cohortId, firstName: studentsTable.firstName, lastName: studentsTable.lastName })
      .from(studentsTable)
      // @ts-ignore -- Drizzle and() overload
      .where(and(eq(studentsTable.id, id), eq(studentsTable.tenantId, tenantId)));
    if (!student) { res.status(404).json({ error: "Student not found" }); return; }

    // PM scoping
    if (user.role === "MANAGER" && student.cohortId) {
      const [cohort] = await db
        .select({ programmeManagerId: programmeCohortsTable.programmeManagerId })
        .from(programmeCohortsTable)
        .where(eq(programmeCohortsTable.id, student.cohortId));
      if (cohort && cohort.programmeManagerId !== user.id) {
        res.status(403).json({ error: "Forbidden" }); return;
      }
    }

    const parsed = attendanceOverrideSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
      return;
    }
    const { reason, overrideType } = parsed.data;

    // Store override in student metadata (JSONB) — no dedicated override table in Round 01 schema
    // The override is audit-logged and stored in the student's metadata field
    const overrideRecord = {
      id: generateId("lov"),
      studentId: id,
      cohortId: student.cohortId,
      overrideType,
      reason,
      overriddenBy: user.id,
      overriddenAt: new Date().toISOString(),
    };

    // Audit log the override
    await db.insert(auditLogs).values({
      id: generateId("aud"),
      tenantId,
      userId: user.id,
      userRole: user.role,
      entityType: "student",
      entityId: id,
      action: "attendance_override",
      changes: overrideRecord as any,
      createdAt: new Date(),
    } as any);

    // Store in student metadata
    const [currentStudent] = await db
      .select({ metadata: studentsTable.metadata })
      .from(studentsTable)
      .where(eq(studentsTable.id, id));

    const existingMeta = (currentStudent?.metadata as any) ?? {};
    const overrides = existingMeta.attendanceOverrides ?? [];
    overrides.push(overrideRecord);

    await db
      .update(studentsTable)
      .set({ metadata: { ...existingMeta, attendanceOverrides: overrides }, updatedAt: new Date() } as any)
      // @ts-ignore -- chain broken by as any cast
      .where(eq(studentsTable.id, id));

    res.status(201).json(overrideRecord);
  } catch (err) {
    console.error("[lms/students/:id/attendance-override POST]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/lms/cohorts/:cohortId/attendance-overrides — audit log (Admin only)
router.get("/cohorts/:cohortId/attendance-overrides", authMiddleware, requireRole("ADMIN", "SUPER_ADMIN"), async (req, res): Promise<void> => {
  try {
    const user = req.user!;
    const tenantId = user.tenantId!;
    const cohortId = req.params.cohortId as string;

    const [cohort] = await db
      .select({ id: programmeCohortsTable.id })
      .from(programmeCohortsTable)
      // @ts-ignore -- Drizzle and() overload
      .where(and(eq(programmeCohortsTable.id, cohortId), eq(programmeCohortsTable.tenantId, tenantId)));
    if (!cohort) { res.status(404).json({ error: "Cohort not found" }); return; }

    // Fetch audit log entries for attendance_override on students in this cohort
    const students = await db
      .select({ id: studentsTable.id })
      .from(studentsTable)
      // @ts-ignore -- Drizzle and() overload
      .where(and(eq(studentsTable.cohortId, cohortId), eq(studentsTable.tenantId, tenantId)));

    const studentIds = students.map((s) => s.id);

    const overrideLogs = await db
      .select()
      .from(auditLogs)
      // @ts-ignore -- Drizzle and() overload
      .where(and(
        eq(auditLogs.tenantId, tenantId),
        eq(auditLogs.entityType, "student"),
        eq(auditLogs.action, "attendance_override"),
      ) as any);

    // Filter to students in this cohort
    const filtered = overrideLogs.filter((log) => studentIds.includes(log.entityId ?? ""));

    res.json(filtered);
  } catch (err) {
    console.error("[lms/cohorts/:cohortId/attendance-overrides GET]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
