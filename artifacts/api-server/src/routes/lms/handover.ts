/**
 * LMS Coach Device Handover — Phase 3 Task 3.5
 *
 * Generates a short-lived (15 min) student_survey token so a coach can
 * hand a device to a student to complete their survey on the spot.
 *
 * POST /api/lms/students/:id/handover-session
 */

import { Router } from "express";
import { db, lmsAccessTokensTable, studentsTable, programmeCohortsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { randomBytes, createHash } from "crypto";
import { authMiddleware, requireRole } from "../../lib/auth";
import { generateId } from "../../lib/id";

const router = Router();

router.post("/students/:id/handover-session", authMiddleware, requireRole("OPERATOR", "MANAGER", "ADMIN", "SUPER_ADMIN"), async (req, res): Promise<void> => {
  try {
    const user = req.user!;
    const tenantId = user.tenantId!;
    const studentId = req.params.id as string;

    const [student] = await db
      .select({ id: studentsTable.id, cohortId: studentsTable.cohortId, coachId: studentsTable.coachId })
      .from(studentsTable)
      // @ts-ignore -- Drizzle and() overload
      .where(and(eq(studentsTable.id, studentId), eq(studentsTable.tenantId, tenantId)));

    if (!student) { res.status(404).json({ error: "Student not found" }); return; }

    // OPERATOR (coach) may only hand over their own students
    if (user.role === "OPERATOR" && student.coachId !== user.id) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    // MANAGER may only hand over students in their cohorts
    if (user.role === "MANAGER" && student.cohortId) {
      const [cohort] = await db
        .select({ programmeManagerId: programmeCohortsTable.programmeManagerId })
        .from(programmeCohortsTable)
        // @ts-ignore
        .where(and(eq(programmeCohortsTable.id, student.cohortId), eq(programmeCohortsTable.tenantId, tenantId)));
      if (!cohort || cohort.programmeManagerId !== user.id) {
        res.status(403).json({ error: "Forbidden" }); return;
      }
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000); // 15 minutes

    const inviteToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(inviteToken).digest("hex");
    const tokenId = generateId("ltk");

    await db.insert(lmsAccessTokensTable).values({
      id: tokenId,
      tenantId,
      tokenHash,
      tokenType: "student_survey",
      scopeType: "student",
      scopeId: studentId,
      expiresAt,
      createdBy: user.id,
      maxUses: 1, // single-use handover token
      useCount: 0,
      createdAt: now,
    } as any);

    res.status(201).json({
      tokenId,
      inviteToken,
      expiresAt,
      expiresInSeconds: 15 * 60,
    });
  } catch (err) {
    console.error("[lms/students/:id/handover-session POST]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
