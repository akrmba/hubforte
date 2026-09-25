import { Router } from "express";
import { authMiddleware, requireRole } from "../../lib/auth";
import { db } from "@workspace/db";
import { lmsReportsTable, studentsTable, programmeCohortsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

const router = Router();

// GET /api/lms/cohorts/:cohortId/reports
router.get(
  "/cohorts/:cohortId/reports",
  authMiddleware,
  requireRole("MANAGER", "ADMIN", "SUPER_ADMIN"),
  async (req, res): Promise<void> => {
    try {
      const user = req.user!;
      const tenantId = user.tenantId!;
      const { cohortId } = req.params;

      const [cohort] = await db
        .select({ id: programmeCohortsTable.id, programmeManagerId: programmeCohortsTable.programmeManagerId })
        .from(programmeCohortsTable)
        // @ts-ignore
        .where(and(eq(programmeCohortsTable.id, cohortId), eq(programmeCohortsTable.tenantId, tenantId)));
      if (!cohort) { res.status(404).json({ error: "Cohort not found" }); return; }
      if (user.role === "MANAGER" && cohort.programmeManagerId !== user.id) {
        res.status(403).json({ error: "Forbidden" }); return;
      }

      const students = await db
        .select({ id: studentsTable.id, firstName: studentsTable.firstName, lastName: studentsTable.lastName })
        .from(studentsTable)
        // @ts-ignore
        .where(and(eq(studentsTable.cohortId, cohortId), eq(studentsTable.tenantId, tenantId)));

      const reports = await db
        .select()
        .from(lmsReportsTable)
        // @ts-ignore
        .where(and(eq(lmsReportsTable.cohortId, cohortId), eq(lmsReportsTable.tenantId, tenantId)));

      const reportMap = new Map(reports.map((r) => [r.studentId, r]));

      const result = students.map((s) => {
        const report = reportMap.get(s.id);
        return {
          id: report?.id ?? `pending-${s.id}`,
          studentId: s.id,
          firstName: s.firstName,
          lastName: s.lastName,
          status: report?.status ?? "pending",
          generatedAt: report?.createdAt?.toISOString() ?? null,
          previewUrl: report?.fileReference ?? null,
        };
      });

      res.json({ cohortId, reports: result });
    } catch (err) {
      console.error("[lms/cohorts/:cohortId/reports GET]", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// POST /api/lms/cohorts/:cohortId/reports/generate
router.post(
  "/cohorts/:cohortId/reports/generate",
  authMiddleware,
  requireRole("MANAGER", "ADMIN", "SUPER_ADMIN"),
  async (req, res): Promise<void> => {
    try {
      const user = req.user!;
      const tenantId = user.tenantId!;
      const { cohortId } = req.params;

      const [cohort] = await db
        .select({ id: programmeCohortsTable.id, programmeManagerId: programmeCohortsTable.programmeManagerId })
        .from(programmeCohortsTable)
        // @ts-ignore
        .where(and(eq(programmeCohortsTable.id, cohortId), eq(programmeCohortsTable.tenantId, tenantId)));
      if (!cohort) { res.status(404).json({ error: "Cohort not found" }); return; }
      if (user.role === "MANAGER" && cohort.programmeManagerId !== user.id) {
        res.status(403).json({ error: "Forbidden" }); return;
      }

      // Queue generation — in v1 this is a synchronous stub that returns queued count
      const students = await db
        .select({ id: studentsTable.id })
        .from(studentsTable)
        // @ts-ignore
        .where(and(eq(studentsTable.cohortId, cohortId), eq(studentsTable.tenantId, tenantId)));

      res.json({ queued: students.length, message: "Report generation queued" });
    } catch (err) {
      console.error("[lms/cohorts/:cohortId/reports/generate POST]", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// GET /api/lms/reports/:id
router.get(
  "/reports/:id",
  authMiddleware,
  requireRole("MANAGER", "ADMIN", "SUPER_ADMIN"),
  async (req, res): Promise<void> => {
    try {
      const user = req.user!;
      const tenantId = user.tenantId!;
      const { id } = req.params;

      const [report] = await db
        .select()
        .from(lmsReportsTable)
        // @ts-ignore
        .where(and(eq(lmsReportsTable.id, id), eq(lmsReportsTable.tenantId, tenantId)));
      if (!report) { res.status(404).json({ error: "Report not found" }); return; }

      if (user.role === "MANAGER") {
        const [cohort] = await db
          .select({ programmeManagerId: programmeCohortsTable.programmeManagerId })
          .from(programmeCohortsTable)
          // @ts-ignore
          .where(and(eq(programmeCohortsTable.id, report.cohortId), eq(programmeCohortsTable.tenantId, tenantId)));
        if (!cohort || cohort.programmeManagerId !== user.id) {
          res.status(403).json({ error: "Forbidden" }); return;
        }
      }

      res.json(report);
    } catch (err) {
      console.error("[lms/reports/:id GET]", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// PUT /api/lms/reports/:id/send
router.put(
  "/reports/:id/send",
  authMiddleware,
  requireRole("MANAGER", "ADMIN", "SUPER_ADMIN"),
  async (req, res): Promise<void> => {
    try {
      const user = req.user!;
      const tenantId = user.tenantId!;
      const { id } = req.params;

      const [report] = await db
        .select()
        .from(lmsReportsTable)
        // @ts-ignore
        .where(and(eq(lmsReportsTable.id, id), eq(lmsReportsTable.tenantId, tenantId)));
      if (!report) { res.status(404).json({ error: "Report not found" }); return; }

      if (user.role === "MANAGER") {
        const [cohort] = await db
          .select({ programmeManagerId: programmeCohortsTable.programmeManagerId })
          .from(programmeCohortsTable)
          // @ts-ignore
          .where(and(eq(programmeCohortsTable.id, report.cohortId), eq(programmeCohortsTable.tenantId, tenantId)));
        if (!cohort || cohort.programmeManagerId !== user.id) {
          res.status(403).json({ error: "Forbidden" }); return;
        }
      }

      if (report.status !== "ready") {
        res.status(400).json({ error: "Report is not ready to send" }); return;
      }

      const now = new Date();
      await db
        .update(lmsReportsTable)
        .set({ status: "sent", sentAt: now })
        // @ts-ignore
        .where(and(eq(lmsReportsTable.id, id), eq(lmsReportsTable.tenantId, tenantId)));

      res.json({ id, status: "sent", sentAt: now.toISOString() });
    } catch (err) {
      console.error("[lms/reports/:id/send PUT]", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

export default router;
