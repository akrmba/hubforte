/**
 * LMS Report Generation Worker (Task 6.6)
 *
 * POST /worker/lms-generate-report
 *   Body: { cohortId, reportType: "school_ofsted" | "student_personal", studentId? }
 *
 * Loads the latest impact snapshot, renders the appropriate template,
 * generates a PDF, and updates lms_reports status to "ready".
 */

import { Router } from "express";
import crypto from "crypto";
import {
  db,
  lmsReportsTable,
  lmsImpactSnapshotsTable,
  programmeCohortsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { generateId } from "../lib/id";
import { generateStudentReport, generateSchoolReport } from "../lib/lms/pdfGenerator";
import type { CohortImpact } from "../lib/lms/impactEngine";

const router = Router();

function workerAuth(req: any, res: any): boolean {
  const expectedSecret = process.env.WORKER_SECRET;
  const workerSecret = req.headers["x-worker-secret"];
  if (!expectedSecret || !workerSecret || typeof workerSecret !== "string") {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  // Constant-time comparison to prevent timing attacks
  const expected = Buffer.from(expectedSecret);
  const provided = Buffer.from(workerSecret);
  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

// POST /worker/lms-generate-report
router.post("/worker/lms-generate-report", async (req, res): Promise<void> => {
  if (!workerAuth(req, res)) return;

  const { cohortId, tenantId, reportType, studentId, generatedBy } = req.body as {
    cohortId: string;
    tenantId: string;
    reportType: "school_ofsted" | "student_personal";
    studentId?: string;
    generatedBy: string;
  };

  if (!cohortId || !tenantId || !reportType || !generatedBy) {
    res.status(400).json({ error: "cohortId, tenantId, reportType, generatedBy are required" });
    return;
  }

  try {
    // Load latest snapshot
    const [snapshot] = await db
      .select()
      .from(lmsImpactSnapshotsTable)
      // @ts-ignore
      .where(and(
        eq(lmsImpactSnapshotsTable.cohortId, cohortId),
        eq(lmsImpactSnapshotsTable.tenantId, tenantId),
        eq(lmsImpactSnapshotsTable.isLatest, true),
      ));

    if (!snapshot) {
      res.status(400).json({ error: "No impact snapshot found — run calculate first" });
      return;
    }

    const impact = snapshot.resultsJson as unknown as CohortImpact;

    // Create report row in "generating" state
    const reportId = generateId("rpt");
    await db.insert(lmsReportsTable).values({
      id: reportId,
      tenantId,
      cohortId,
      studentId: studentId ?? null,
      reportType,
      snapshotId: snapshot.id,
      status: "generating",
      version: 1,
      generatedBy,
    });

    res.json({ reportId, status: "generating" });

    // Generate PDF asynchronously after responding
    setImmediate(async () => {
      try {
        let result;
        if (reportType === "student_personal" && studentId) {
          const student = impact.students.find((s) => s.studentId === studentId);
          if (!student) throw new Error(`Student ${studentId} not in snapshot`);
          result = await generateStudentReport(cohortId, student, impact.cohortName, impact.leadTeacherName);
        } else {
          result = await generateSchoolReport(impact);
        }

        await db
          .update(lmsReportsTable)
          .set({ status: "ready", fileReference: result.fileReference })
          // @ts-ignore
          .where(eq(lmsReportsTable.id, reportId));
      } catch (err) {
        console.error("[worker/lms-generate-report] PDF generation failed", err);
        await db
          .update(lmsReportsTable)
          .set({ status: "error" as any })
          // @ts-ignore
          .where(eq(lmsReportsTable.id, reportId));
      }
    });
  } catch (err) {
    console.error("[worker/lms-generate-report POST]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /worker/lms-generate-all-reports
// Queues student_personal reports for all eligible students + one school_ofsted report
router.post("/worker/lms-generate-all-reports", async (req, res): Promise<void> => {
  if (!workerAuth(req, res)) return;

  const { cohortId, tenantId, generatedBy } = req.body as {
    cohortId: string;
    tenantId: string;
    generatedBy: string;
  };

  if (!cohortId || !tenantId || !generatedBy) {
    res.status(400).json({ error: "cohortId, tenantId, generatedBy are required" });
    return;
  }

  try {
    const [snapshot] = await db
      .select()
      .from(lmsImpactSnapshotsTable)
      // @ts-ignore
      .where(and(
        eq(lmsImpactSnapshotsTable.cohortId, cohortId),
        eq(lmsImpactSnapshotsTable.tenantId, tenantId),
        eq(lmsImpactSnapshotsTable.isLatest, true),
      ));

    if (!snapshot) {
      res.status(400).json({ error: "No impact snapshot found" });
      return;
    }

    const impact = snapshot.resultsJson as unknown as CohortImpact;
    const eligibleStudents = impact.students.filter((s) => s.eligible);

    res.json({ queued: eligibleStudents.length + 1 });

    // Fire all report jobs asynchronously
    setImmediate(async () => {
      // School report
      try {
        const schoolReportId = generateId("rpt");
        await db.insert(lmsReportsTable).values({
          id: schoolReportId, tenantId, cohortId, studentId: null,
          reportType: "school_ofsted", snapshotId: snapshot.id,
          status: "generating", version: 1, generatedBy,
        });
        const result = await generateSchoolReport(impact);
        await db.update(lmsReportsTable).set({ status: "ready", fileReference: result.fileReference })
          // @ts-ignore
          .where(eq(lmsReportsTable.id, schoolReportId));
      } catch (err) {
        console.error("[worker/lms-generate-all-reports] school report failed", err);
      }

      // Per-student reports
      for (const student of eligibleStudents) {
        try {
          const rptId = generateId("rpt");
          await db.insert(lmsReportsTable).values({
            id: rptId, tenantId, cohortId, studentId: student.studentId,
            reportType: "student_personal", snapshotId: snapshot.id,
            status: "generating", version: 1, generatedBy,
          });
          const result = await generateStudentReport(cohortId, student, impact.cohortName, impact.leadTeacherName);
          await db.update(lmsReportsTable).set({ status: "ready", fileReference: result.fileReference })
            // @ts-ignore
            .where(eq(lmsReportsTable.id, rptId));
        } catch (err) {
          console.error(`[worker/lms-generate-all-reports] student ${student.studentId} failed`, err);
        }
      }
    });
  } catch (err) {
    console.error("[worker/lms-generate-all-reports POST]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
