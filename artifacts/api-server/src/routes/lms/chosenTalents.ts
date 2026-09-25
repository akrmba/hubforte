import { Router } from "express";
import { db, lmsChosenTalentsTable, studentsTable, programmeCohortsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { authMiddleware, requireRole } from "../../lib/auth";
import { generateId } from "../../lib/id";
import { z } from "zod";

const router = Router();

const upsertChosenTalentsSchema = z.object({
  confidence: z.boolean().default(true),
  resilience: z.boolean().default(true),
  communication: z.boolean().default(true),
  selfAwareness: z.boolean().default(true),
});

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

// GET /api/lms/students/:id/chosen-talents
router.get("/students/:id/chosen-talents", authMiddleware, requireRole("OPERATOR", "MANAGER", "ADMIN", "SUPER_ADMIN"), async (req, res): Promise<void> => {
  try {
    const user = req.user!;
    const tenantId = user.tenantId!;
    const id = req.params.id as string;

    const access = await assertStudentAccess(tenantId, id, user.id, user.role);
    if ("error" in access) { res.status(access.status).json({ error: access.error }); return; }

    const [record] = await db
      .select()
      .from(lmsChosenTalentsTable)
      // @ts-ignore -- Drizzle and() overload
      .where(and(eq(lmsChosenTalentsTable.studentId, id), eq(lmsChosenTalentsTable.tenantId, tenantId)));

    res.json(record ?? null);
  } catch (err) {
    console.error("[lms/students/:id/chosen-talents GET]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/lms/students/:id/chosen-talents
router.put("/students/:id/chosen-talents", authMiddleware, requireRole("OPERATOR", "MANAGER", "ADMIN", "SUPER_ADMIN"), async (req, res): Promise<void> => {
  try {
    const user = req.user!;
    const tenantId = user.tenantId!;
    const id = req.params.id as string;

    const access = await assertStudentAccess(tenantId, id, user.id, user.role);
    if ("error" in access) { res.status(access.status).json({ error: access.error }); return; }

    const parsed = upsertChosenTalentsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
      return;
    }
    const data = parsed.data;
    const now = new Date();

    const [existing] = await db
      .select({ id: lmsChosenTalentsTable.id })
      .from(lmsChosenTalentsTable)
      // @ts-ignore -- Drizzle and() overload
      .where(and(eq(lmsChosenTalentsTable.studentId, id), eq(lmsChosenTalentsTable.tenantId, tenantId)));

    if (existing) {
      await db
        .update(lmsChosenTalentsTable)
        .set({ ...data, setBy: user.id, updatedAt: now } as any)
        .where(eq(lmsChosenTalentsTable.id, existing.id));
      const [updated] = await db.select().from(lmsChosenTalentsTable).where(eq(lmsChosenTalentsTable.id, existing.id));
      res.json(updated);
    } else {
      const recordId = generateId("lct");
      await db.insert(lmsChosenTalentsTable).values({
        id: recordId,
        tenantId,
        studentId: id,
        ...data,
        setBy: user.id,
        createdAt: now,
        updatedAt: now,
      } as any);
      const [created] = await db.select().from(lmsChosenTalentsTable).where(eq(lmsChosenTalentsTable.id, recordId));
      res.status(201).json(created);
    }
  } catch (err) {
    console.error("[lms/students/:id/chosen-talents PUT]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
