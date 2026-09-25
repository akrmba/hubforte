import { Router } from "express";
import { db, lmsTalentScoresTable, studentsTable, programmeCohortsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { authMiddleware, requireRole } from "../../lib/auth";
import { generateId } from "../../lib/id";
import { upsertScoresSchema } from "@workspace/api-zod";

const router = Router();

// Shared scoping helper: enforces coach scoping (OPERATOR) and PM scoping (MANAGER)
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

// GET /api/lms/students/:id/scores
router.get("/students/:id/scores", authMiddleware, requireRole("OPERATOR", "MANAGER", "ADMIN", "SUPER_ADMIN"), async (req, res): Promise<void> => {
  try {
    const user = req.user!;
    const tenantId = user.tenantId!;
    const id = req.params.id as string;

    const access = await assertStudentAccess(tenantId, id, user.id, user.role);
    if ("error" in access) { res.status(access.status).json({ error: access.error }); return; }

    const scores = await db
      .select()
      .from(lmsTalentScoresTable)
      // @ts-ignore -- Drizzle and() overload
      .where(and(eq(lmsTalentScoresTable.studentId, id), eq(lmsTalentScoresTable.tenantId, tenantId)));

    res.json(scores);
  } catch (err) {
    console.error("[lms/students/:id/scores GET]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/lms/students/:id/scores
router.put("/students/:id/scores", authMiddleware, requireRole("OPERATOR", "MANAGER", "ADMIN", "SUPER_ADMIN"), async (req, res): Promise<void> => {
  try {
    const user = req.user!;
    const tenantId = user.tenantId!;
    const id = req.params.id as string;

    const access = await assertStudentAccess(tenantId, id, user.id, user.role);
    if ("error" in access) { res.status(access.status).json({ error: access.error }); return; }

    const parsed = upsertScoresSchema.safeParse({ ...req.body, studentId: id });
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
      return;
    }
    const data = parsed.data;

    // isComplete = all 4 scores filled
    const isComplete = [data.confidence, data.resilience, data.communication, data.selfAwareness]
      .every((v) => v !== null && v !== undefined);

    const now = new Date();

    const [existing] = await db
      .select({ id: lmsTalentScoresTable.id })
      .from(lmsTalentScoresTable)
      // @ts-ignore -- Drizzle and() overload
      .where(and(
        // @ts-ignore -- Drizzle eq() overload
        eq(lmsTalentScoresTable.studentId, id) as any,
        // @ts-ignore -- Drizzle eq() overload
        eq(lmsTalentScoresTable.raterType, data.raterType) as any,
        // @ts-ignore -- Drizzle eq() overload
        eq(lmsTalentScoresTable.timePoint, data.timePoint) as any,
        // @ts-ignore -- Drizzle eq() overload
        eq(lmsTalentScoresTable.tenantId, tenantId) as any,
      ) as any);

    if (existing) {
      await db
        .update(lmsTalentScoresTable)
        .set({
          confidence: data.confidence ?? null,
          resilience: data.resilience ?? null,
          communication: data.communication ?? null,
          selfAwareness: data.selfAwareness ?? null,
          isComplete,
          submittedBy: user.id,
          updatedAt: now,
        } as any)
        // @ts-ignore -- chain broken by as any cast
        .where(eq(lmsTalentScoresTable.id, existing.id));
      const [updated] = await db.select().from(lmsTalentScoresTable).where(eq(lmsTalentScoresTable.id, existing.id));
      res.json(updated);
    } else {
      const scoreId = generateId("lts");
      await db.insert(lmsTalentScoresTable).values({
        id: scoreId,
        tenantId,
        studentId: id,
        raterType: data.raterType,
        timePoint: data.timePoint,
        confidence: data.confidence ?? null,
        resilience: data.resilience ?? null,
        communication: data.communication ?? null,
        selfAwareness: data.selfAwareness ?? null,
        isComplete,
        submittedBy: user.id,
        createdAt: now,
        updatedAt: now,
      } as any);
      const [created] = await db.select().from(lmsTalentScoresTable).where(eq(lmsTalentScoresTable.id, scoreId));
      res.status(201).json(created);
    }
  } catch (err) {
    console.error("[lms/students/:id/scores PUT]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
