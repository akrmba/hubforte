import { Router } from "express";
import { db, lmsTripDataTable, lmsCohortNarrativesTable, programmeCohortsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { authMiddleware, requireRole } from "../../lib/auth";
import { generateId } from "../../lib/id";
import { upsertTripDataSchema, upsertCohortNarrativesSchema } from "@workspace/api-zod";

const router = Router();

// Helper: verify cohort access
async function getCohort(tenantId: string, cohortId: string, userId: string, role: string) {
  const [cohort] = await db
    .select({ id: programmeCohortsTable.id, programmeManagerId: programmeCohortsTable.programmeManagerId })
    .from(programmeCohortsTable)
    // @ts-ignore -- Drizzle and() overload
    .where(and(eq(programmeCohortsTable.id, cohortId), eq(programmeCohortsTable.tenantId, tenantId)));
  if (!cohort) return null;
  if (role === "MANAGER" && cohort.programmeManagerId !== userId) return "forbidden";
  return cohort;
}

// GET /api/lms/cohorts/:cohortId/trip-data
router.get("/cohorts/:cohortId/trip-data", authMiddleware, requireRole("MANAGER", "ADMIN", "SUPER_ADMIN"), async (req, res): Promise<void> => {
  try {
    const user = req.user!;
    const tenantId = user.tenantId!;
    const cohortId = req.params.cohortId as string;

    const cohort = await getCohort(tenantId, cohortId, user.id, user.role);
    if (!cohort) { res.status(404).json({ error: "Cohort not found" }); return; }
    if (cohort === "forbidden") { res.status(403).json({ error: "Forbidden" }); return; }

    const rows = await db
      .select()
      .from(lmsTripDataTable)
      // @ts-ignore -- Drizzle and() overload
      .where(and(eq(lmsTripDataTable.cohortId, cohortId), eq(lmsTripDataTable.tenantId, tenantId)));

    const itw = rows.find((r) => r.tripType === "itw") ?? null;
    const wow = rows.find((r) => r.tripType === "wow") ?? null;

    res.json({ cohortId, itw, wow });
  } catch (err) {
    console.error("[lms/cohorts/:cohortId/trip-data GET]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/lms/cohorts/:cohortId/trip-data
router.put("/cohorts/:cohortId/trip-data", authMiddleware, requireRole("MANAGER", "ADMIN", "SUPER_ADMIN"), async (req, res): Promise<void> => {
  try {
    const user = req.user!;
    const tenantId = user.tenantId!;
    const cohortId = req.params.cohortId as string;

    const cohort = await getCohort(tenantId, cohortId, user.id, user.role);
    if (!cohort) { res.status(404).json({ error: "Cohort not found" }); return; }
    if (cohort === "forbidden") { res.status(403).json({ error: "Forbidden" }); return; }

    const parsed = upsertTripDataSchema.safeParse({ ...req.body, cohortId });
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
      return;
    }
    const data = parsed.data;
    const now = new Date();

    // isComplete: venueName + at least one highlight
    const isComplete = !!(data.venueName && data.activityHighlights && data.activityHighlights.length > 0);

    const [existing] = await db
      .select({ id: lmsTripDataTable.id })
      .from(lmsTripDataTable)
      // @ts-ignore -- Drizzle and() overload
      .where(and(
        // @ts-ignore -- Drizzle eq() overload
        eq(lmsTripDataTable.cohortId, cohortId) as any,
        // @ts-ignore -- Drizzle eq() overload
        eq(lmsTripDataTable.tripType, data.tripType) as any,
        // @ts-ignore -- Drizzle eq() overload
        eq(lmsTripDataTable.tenantId, tenantId) as any,
      ) as any);

    if (existing) {
      await db
        .update(lmsTripDataTable)
        .set({
          venueName: data.venueName ?? null,
          activityHighlights: data.activityHighlights ?? null,
          featuredStudentQuote: data.featuredStudentQuote ?? null,
          featuredCoachQuote: data.featuredCoachQuote ?? null,
          isComplete: data.isComplete ?? isComplete,
          enteredBy: user.id,
          enteredAt: now,
        } as any)
        // @ts-ignore -- chain broken by as any cast
        .where(eq(lmsTripDataTable.id, existing.id));
      const [updated] = await db.select().from(lmsTripDataTable).where(eq(lmsTripDataTable.id, existing.id));
      res.json(updated);
    } else {
      const recordId = generateId("ltd");
      await db.insert(lmsTripDataTable).values({
        id: recordId,
        tenantId,
        cohortId,
        tripType: data.tripType,
        venueName: data.venueName ?? null,
        activityHighlights: data.activityHighlights ?? null,
        featuredStudentQuote: data.featuredStudentQuote ?? null,
        featuredCoachQuote: data.featuredCoachQuote ?? null,
        isComplete: data.isComplete ?? isComplete,
        enteredBy: user.id,
        enteredAt: now,
      } as any);
      const [created] = await db.select().from(lmsTripDataTable).where(eq(lmsTripDataTable.id, recordId));
      res.status(201).json(created);
    }
  } catch (err) {
    console.error("[lms/cohorts/:cohortId/trip-data PUT]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/lms/cohorts/:cohortId/narratives
router.get("/cohorts/:cohortId/narratives", authMiddleware, requireRole("MANAGER", "ADMIN", "SUPER_ADMIN"), async (req, res): Promise<void> => {
  try {
    const user = req.user!;
    const tenantId = user.tenantId!;
    const cohortId = req.params.cohortId as string;

    const cohort = await getCohort(tenantId, cohortId, user.id, user.role);
    if (!cohort) { res.status(404).json({ error: "Cohort not found" }); return; }
    if (cohort === "forbidden") { res.status(403).json({ error: "Forbidden" }); return; }

    const [record] = await db
      .select()
      .from(lmsCohortNarrativesTable)
      // @ts-ignore -- Drizzle and() overload
      .where(and(eq(lmsCohortNarrativesTable.cohortId, cohortId), eq(lmsCohortNarrativesTable.tenantId, tenantId)));

    res.json(record ?? null);
  } catch (err) {
    console.error("[lms/cohorts/:cohortId/narratives GET]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/lms/cohorts/:cohortId/narratives
router.put("/cohorts/:cohortId/narratives", authMiddleware, requireRole("MANAGER", "ADMIN", "SUPER_ADMIN"), async (req, res): Promise<void> => {
  try {
    const user = req.user!;
    const tenantId = user.tenantId!;
    const cohortId = req.params.cohortId as string;

    const cohort = await getCohort(tenantId, cohortId, user.id, user.role);
    if (!cohort) { res.status(404).json({ error: "Cohort not found" }); return; }
    if (cohort === "forbidden") { res.status(403).json({ error: "Forbidden" }); return; }

    const parsed = upsertCohortNarrativesSchema.safeParse({ ...req.body, cohortId });
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
      return;
    }
    const data = parsed.data;
    const now = new Date();

    const [existing] = await db
      .select()
      .from(lmsCohortNarrativesTable)
      // @ts-ignore -- Drizzle and() overload
      .where(and(eq(lmsCohortNarrativesTable.cohortId, cohortId), eq(lmsCohortNarrativesTable.tenantId, tenantId)));

    if (existing) {
      await db
        .update(lmsCohortNarrativesTable)
        .set({
          programmeStrengths: data.programmeStrengths ?? existing.programmeStrengths,
          programmeChallenges: data.programmeChallenges ?? existing.programmeChallenges,
          overallAssessment: data.overallAssessment ?? existing.overallAssessment,
          conclusionNarrative: data.conclusionNarrative ?? existing.conclusionNarrative,
          featuredStudentQuote: data.featuredStudentQuote ?? existing.featuredStudentQuote,
          enteredBy: user.id,
          lastSavedAt: now,
          updatedAt: now,
        } as any)
        // @ts-ignore -- chain broken by as any cast
        .where(eq(lmsCohortNarrativesTable.id, existing.id));
      const [updated] = await db.select().from(lmsCohortNarrativesTable).where(eq(lmsCohortNarrativesTable.id, existing.id));
      res.json(updated);
    } else {
      const recordId = generateId("lcr");
      await db.insert(lmsCohortNarrativesTable).values({
        id: recordId,
        tenantId,
        cohortId,
        programmeStrengths: data.programmeStrengths ?? null,
        programmeChallenges: data.programmeChallenges ?? null,
        overallAssessment: data.overallAssessment ?? null,
        conclusionNarrative: data.conclusionNarrative ?? null,
        featuredStudentQuote: data.featuredStudentQuote ?? null,
        enteredBy: user.id,
        lastSavedAt: now,
        createdAt: now,
        updatedAt: now,
      } as any);
      const [created] = await db.select().from(lmsCohortNarrativesTable).where(eq(lmsCohortNarrativesTable.id, recordId));
      res.status(201).json(created);
    }
  } catch (err) {
    console.error("[lms/cohorts/:cohortId/narratives PUT]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
