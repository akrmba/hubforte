import { Router } from "express";
import { db, lmsCoachNarrativesTable, studentsTable, programmeCohortsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { authMiddleware, requireRole } from "../../lib/auth";
import { generateId } from "../../lib/id";
import { upsertNarrativesSchema } from "@workspace/api-zod";

const router = Router();

// Required narrative fields for isComplete calculation
const REQUIRED_NARRATIVE_FIELDS = [
  "overallEngagement",
  "itwReflection",
  "wowReflection",
  "talentProgressSummary",
  "overallProgressSummary",
  "nextSteps",
];

function calcIsComplete(data: Record<string, any>): boolean {
  return REQUIRED_NARRATIVE_FIELDS.every((f) => !!data[f]);
}

async function assertStudentAccess(tenantId: string, studentId: string, userId: string, role: string): Promise<{ student: { id: string; coachId: string | null; cohortId: string | null } } | { error: string; status: number }> {
  const [student] = await db
    .select({ id: studentsTable.id, coachId: studentsTable.coachId, cohortId: studentsTable.cohortId })
    .from(studentsTable)
    // @ts-ignore -- Drizzle and() overload
    .where(and(eq(studentsTable.id, studentId), eq(studentsTable.tenantId, tenantId)));
  if (!student) return { error: "Student not found", status: 404 };
  if (role === "OPERATOR" && student.coachId !== userId) return { error: "Forbidden", status: 403 };
  if (role === "MANAGER" && student.cohortId) {
    const [cohort] = await db
      .select({ programmeManagerId: programmeCohortsTable.programmeManagerId })
      .from(programmeCohortsTable)
      .where(eq(programmeCohortsTable.id, student.cohortId));
    if (cohort && cohort.programmeManagerId !== userId) return { error: "Forbidden", status: 403 };
  }
  return { student };
}

// GET /api/lms/students/:id/narratives
router.get("/students/:id/narratives", authMiddleware, requireRole("OPERATOR", "MANAGER", "ADMIN", "SUPER_ADMIN"), async (req, res): Promise<void> => {
  try {
    const user = req.user!;
    const tenantId = user.tenantId!;
    const id = req.params.id as string;

    const access = await assertStudentAccess(tenantId, id, user.id, user.role);
    if ("error" in access) { res.status(access.status).json({ error: access.error }); return; }

    const [record] = await db
      .select()
      .from(lmsCoachNarrativesTable)
      // @ts-ignore -- Drizzle and() overload
      .where(and(eq(lmsCoachNarrativesTable.studentId, id), eq(lmsCoachNarrativesTable.tenantId, tenantId)));

    res.json(record ?? null);
  } catch (err) {
    console.error("[lms/students/:id/narratives GET]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/lms/students/:id/narratives — partial update / auto-save
router.put("/students/:id/narratives", authMiddleware, requireRole("OPERATOR", "MANAGER", "ADMIN", "SUPER_ADMIN"), async (req, res): Promise<void> => {
  try {
    const user = req.user!;
    const tenantId = user.tenantId!;
    const id = req.params.id as string;

    const access = await assertStudentAccess(tenantId, id, user.id, user.role);
    if ("error" in access) { res.status(access.status).json({ error: access.error }); return; }

    const parsed = upsertNarrativesSchema.safeParse({ ...req.body, studentId: id });
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
      return;
    }
    const data = parsed.data;
    const now = new Date();

    const [existing] = await db
      .select()
      .from(lmsCoachNarrativesTable)
      // @ts-ignore -- Drizzle and() overload
      .where(and(eq(lmsCoachNarrativesTable.studentId, id), eq(lmsCoachNarrativesTable.tenantId, tenantId)));

    if (existing) {
      // Merge: only update fields present in body
      const merged = {
        overallEngagement: data.overallEngagement ?? existing.overallEngagement,
        attendanceComment: data.attendanceComment ?? existing.attendanceComment,
        itwReflection: data.itwReflection ?? existing.itwReflection,
        wowReflection: data.wowReflection ?? existing.wowReflection,
        talentProgressSummary: data.talentProgressSummary ?? existing.talentProgressSummary,
        overallProgressSummary: data.overallProgressSummary ?? existing.overallProgressSummary,
        nextSteps: data.nextSteps ?? existing.nextSteps,
      };
      const isComplete = calcIsComplete(merged);

      await db
        .update(lmsCoachNarrativesTable)
        .set({ ...merged, isComplete, submittedBy: user.id, lastSavedAt: now, updatedAt: now } as any)
        .where(eq(lmsCoachNarrativesTable.id, existing.id));

      const [updated] = await db.select().from(lmsCoachNarrativesTable).where(eq(lmsCoachNarrativesTable.id, existing.id));
      res.json(updated);
    } else {
      const recordId = generateId("lcn");
      const isComplete = calcIsComplete(data as any);
      await db.insert(lmsCoachNarrativesTable).values({
        id: recordId,
        tenantId,
        studentId: id,
        overallEngagement: data.overallEngagement ?? null,
        attendanceComment: data.attendanceComment ?? null,
        itwReflection: data.itwReflection ?? null,
        wowReflection: data.wowReflection ?? null,
        talentProgressSummary: data.talentProgressSummary ?? null,
        overallProgressSummary: data.overallProgressSummary ?? null,
        nextSteps: data.nextSteps ?? null,
        isComplete,
        submittedBy: user.id,
        lastSavedAt: now,
        createdAt: now,
        updatedAt: now,
      } as any);
      const [created] = await db.select().from(lmsCoachNarrativesTable).where(eq(lmsCoachNarrativesTable.id, recordId));
      res.status(201).json(created);
    }
  } catch (err) {
    console.error("[lms/students/:id/narratives PUT]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
