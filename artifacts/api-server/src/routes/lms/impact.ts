/**
 * LMS Impact Engine API routes (Task 6.1 / 6.3)
 *
 * POST /api/lms/cohorts/:cohortId/impact/calculate  — run impact engine, store snapshot
 * GET  /api/lms/cohorts/:cohortId/impact/latest     — fetch latest snapshot
 * POST /api/lms/cohorts/:cohortId/ai-summaries/generate — trigger AI summarisation
 * PUT  /api/lms/ai-summaries/:id                    — edit a summary (wasEdited flag)
 */

import { Router } from "express";
import { db, lmsImpactSnapshotsTable, lmsAiSummariesTable, programmeCohortsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { authMiddleware, requireRole } from "../../lib/auth";
import { calculateCohortImpact } from "../../lib/lms/impactEngine";
import { generateAllSummariesForCohort } from "../../lib/lms/aiSummarisation";

const router = Router();

async function assertCohortAccess(tenantId: string, cohortId: string, userId: string, role: string) {
  const [cohort] = await db
    .select({ id: programmeCohortsTable.id, programmeManagerId: programmeCohortsTable.programmeManagerId })
    .from(programmeCohortsTable)
    // @ts-ignore
    .where(and(eq(programmeCohortsTable.id, cohortId), eq(programmeCohortsTable.tenantId, tenantId)));
  if (!cohort) return null;
  if (role === "MANAGER" && cohort.programmeManagerId !== userId) return "forbidden";
  return cohort;
}

// POST /api/lms/cohorts/:cohortId/impact/calculate
router.post(
  "/cohorts/:cohortId/impact/calculate",
  authMiddleware,
  requireRole("MANAGER", "ADMIN", "SUPER_ADMIN"),
  async (req, res): Promise<void> => {
    try {
      const user = req.user!;
      const tenantId = user.tenantId!;
      const cohortId = req.params.cohortId as string;

      const cohort = await assertCohortAccess(tenantId, cohortId, user.id, user.role);
      if (!cohort) { res.status(404).json({ error: "Cohort not found" }); return; }
      if (cohort === "forbidden") { res.status(403).json({ error: "Forbidden" }); return; }

      const { snapshot, impact } = await calculateCohortImpact(cohortId, tenantId, user.id);

      res.json({
        snapshotId: snapshot.id,
        snapshotVersion: snapshot.snapshotVersion,
        eligibleStudents: impact.eligibleStudents,
        totalStudents: impact.totalStudents,
        cohortAverageScores: impact.cohortAverageScores,
      });
    } catch (err) {
      console.error("[lms/impact/calculate POST]", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// GET /api/lms/cohorts/:cohortId/impact/latest
router.get(
  "/cohorts/:cohortId/impact/latest",
  authMiddleware,
  requireRole("MANAGER", "ADMIN", "SUPER_ADMIN"),
  async (req, res): Promise<void> => {
    try {
      const user = req.user!;
      const tenantId = user.tenantId!;
      const cohortId = req.params.cohortId as string;

      const cohort = await assertCohortAccess(tenantId, cohortId, user.id, user.role);
      if (!cohort) { res.status(404).json({ error: "Cohort not found" }); return; }
      if (cohort === "forbidden") { res.status(403).json({ error: "Forbidden" }); return; }

      const [snapshot] = await db
        .select()
        .from(lmsImpactSnapshotsTable)
        // @ts-ignore
        .where(and(
          eq(lmsImpactSnapshotsTable.cohortId, cohortId),
          eq(lmsImpactSnapshotsTable.tenantId, tenantId),
          eq(lmsImpactSnapshotsTable.isLatest, true),
        ));

      if (!snapshot) { res.status(404).json({ error: "No impact snapshot found" }); return; }

      res.json(snapshot);
    } catch (err) {
      console.error("[lms/impact/latest GET]", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// POST /api/lms/cohorts/:cohortId/ai-summaries/generate
router.post(
  "/cohorts/:cohortId/ai-summaries/generate",
  authMiddleware,
  requireRole("MANAGER", "ADMIN", "SUPER_ADMIN"),
  async (req, res): Promise<void> => {
    try {
      const user = req.user!;
      const tenantId = user.tenantId!;
      const cohortId = req.params.cohortId as string;

      const cohort = await assertCohortAccess(tenantId, cohortId, user.id, user.role);
      if (!cohort) { res.status(404).json({ error: "Cohort not found" }); return; }
      if (cohort === "forbidden") { res.status(403).json({ error: "Forbidden" }); return; }

      // Require a latest snapshot
      const [snapshot] = await db
        .select()
        .from(lmsImpactSnapshotsTable)
        // @ts-ignore
        .where(and(
          eq(lmsImpactSnapshotsTable.cohortId, cohortId),
          eq(lmsImpactSnapshotsTable.tenantId, tenantId),
          eq(lmsImpactSnapshotsTable.isLatest, true),
        ));
      if (!snapshot) { res.status(400).json({ error: "Run impact calculation first" }); return; }

      // Run async — respond immediately
      res.json({ queued: true, message: "AI summary generation started" });

      // Fire and forget (in production this would be a worker job)
      generateAllSummariesForCohort(tenantId, cohortId, snapshot.resultsJson as any).catch((err) => {
        console.error("[lms/ai-summaries/generate]", err);
      });
    } catch (err) {
      console.error("[lms/ai-summaries/generate POST]", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// GET /api/lms/cohorts/:cohortId/ai-summaries
router.get(
  "/cohorts/:cohortId/ai-summaries",
  authMiddleware,
  requireRole("MANAGER", "ADMIN", "SUPER_ADMIN"),
  async (req, res): Promise<void> => {
    try {
      const user = req.user!;
      const tenantId = user.tenantId!;
      const cohortId = req.params.cohortId as string;

      const cohort = await assertCohortAccess(tenantId, cohortId, user.id, user.role);
      if (!cohort) { res.status(404).json({ error: "Cohort not found" }); return; }
      if (cohort === "forbidden") { res.status(403).json({ error: "Forbidden" }); return; }

      const summaries = await db
        .select()
        .from(lmsAiSummariesTable)
        // @ts-ignore
        .where(and(eq(lmsAiSummariesTable.cohortId, cohortId), eq(lmsAiSummariesTable.tenantId, tenantId)));

      res.json(summaries);
    } catch (err) {
      console.error("[lms/ai-summaries GET]", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// PUT /api/lms/ai-summaries/:id  — PM edits a summary
router.put(
  "/ai-summaries/:id",
  authMiddleware,
  requireRole("MANAGER", "ADMIN", "SUPER_ADMIN"),
  async (req, res): Promise<void> => {
    try {
      const user = req.user!;
      const tenantId = user.tenantId!;
      const { id } = req.params;
      const { editedText } = req.body;

      if (typeof editedText !== "string") {
        res.status(400).json({ error: "editedText is required" }); return;
      }

      const [summary] = await db
        .select()
        .from(lmsAiSummariesTable)
        // @ts-ignore
        .where(and(eq(lmsAiSummariesTable.id, id), eq(lmsAiSummariesTable.tenantId, tenantId)));
      if (!summary) { res.status(404).json({ error: "Summary not found" }); return; }

      if (user.role === "MANAGER" && summary.cohortId) {
        const [cohort] = await db
          .select({ programmeManagerId: programmeCohortsTable.programmeManagerId })
          .from(programmeCohortsTable)
          // @ts-ignore
          .where(and(eq(programmeCohortsTable.id, summary.cohortId), eq(programmeCohortsTable.tenantId, tenantId)));
        if (!cohort || cohort.programmeManagerId !== user.id) {
          res.status(403).json({ error: "Forbidden" }); return;
        }
      }

      await db
        .update(lmsAiSummariesTable)
        .set({ editedText, wasEdited: true, editedBy: user.id, editedAt: new Date() })
        // @ts-ignore
        .where(eq(lmsAiSummariesTable.id, id));

      res.json({ id, wasEdited: true });
    } catch (err) {
      console.error("[lms/ai-summaries/:id PUT]", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

export default router;
