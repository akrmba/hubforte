import { Router } from "express";
import { db, lmsForwardToFutureTable, studentsTable, programmeCohortsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { authMiddleware, requireRole } from "../../lib/auth";
import { generateId } from "../../lib/id";
import { upsertForwardToFutureSchema, type UpsertForwardToFutureInput } from "@workspace/api-zod";
import { z } from "zod";

const router = Router();

const batchUpsertFtFSchema = z.object({
  entries: z.array(upsertForwardToFutureSchema as any).min(1).max(200),
});

// GET /api/lms/cohorts/:cohortId/forward-to-future
router.get("/cohorts/:cohortId/forward-to-future", authMiddleware, requireRole("MANAGER", "ADMIN", "SUPER_ADMIN"), async (req, res): Promise<void> => {
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

    const rows = await db
      .select()
      .from(lmsForwardToFutureTable)
      // @ts-ignore -- Drizzle and() overload
      .where(and(eq(lmsForwardToFutureTable.cohortId, cohortId), eq(lmsForwardToFutureTable.tenantId, tenantId)));

    res.json(rows);
  } catch (err) {
    console.error("[lms/cohorts/:cohortId/forward-to-future GET]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/lms/cohorts/:cohortId/forward-to-future — batch upsert
router.put("/cohorts/:cohortId/forward-to-future", authMiddleware, requireRole("MANAGER", "ADMIN", "SUPER_ADMIN"), async (req, res): Promise<void> => {
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

    const parsed = batchUpsertFtFSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
      return;
    }
    const entries = parsed.data.entries as UpsertForwardToFutureInput[];

    const now = new Date();
    const results: string[] = [];

    for (const entry of entries) {
      // Verify student belongs to this cohort and tenant
      const [student] = await db
        .select({ id: studentsTable.id })
        .from(studentsTable)
        // @ts-ignore -- Drizzle and() overload
        .where(and(
          // @ts-ignore -- Drizzle eq() overload
          eq(studentsTable.id, entry.studentId) as any,
          // @ts-ignore -- Drizzle eq() overload
          eq(studentsTable.cohortId, cohortId) as any,
          // @ts-ignore -- Drizzle eq() overload
          eq(studentsTable.tenantId, tenantId) as any,
        ) as any);
      if (!student) continue;

      const [existing] = await db
        .select({ id: lmsForwardToFutureTable.id })
        .from(lmsForwardToFutureTable)
        // @ts-ignore -- Drizzle and() overload
        .where(and(
          // @ts-ignore -- Drizzle eq() overload
          eq(lmsForwardToFutureTable.studentId, entry.studentId) as any,
          // @ts-ignore -- Drizzle eq() overload
          eq(lmsForwardToFutureTable.cohortId, cohortId) as any,
          // @ts-ignore -- Drizzle eq() overload
          eq(lmsForwardToFutureTable.tenantId, tenantId) as any,
        ) as any);

      if (existing) {
        await db
          .update(lmsForwardToFutureTable)
          .set({
            programmeType: entry.programmeType,
            sessionDate: entry.sessionDate ? new Date(entry.sessionDate) : null,
            responsesJson: entry.responsesJson,
            enteredBy: user.id,
            updatedAt: now,
          } as any)
          // @ts-ignore -- chain broken by as any cast
          .where(eq(lmsForwardToFutureTable.id, existing.id));
        results.push(existing.id);
      } else {
        const recordId = generateId("lft");
        await db.insert(lmsForwardToFutureTable).values({
          id: recordId,
          tenantId,
          cohortId,
          studentId: entry.studentId,
          programmeType: entry.programmeType,
          sessionDate: entry.sessionDate ? new Date(entry.sessionDate) : null,
          responsesJson: entry.responsesJson,
          enteredBy: user.id,
          enteredAt: now,
          updatedAt: now,
        } as any);
        results.push(recordId);
      }
    }

    res.json({ upserted: results.length, ids: results });
  } catch (err) {
    console.error("[lms/cohorts/:cohortId/forward-to-future PUT]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
