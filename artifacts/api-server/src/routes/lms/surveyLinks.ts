/**
 * LMS Survey Links — Phase 3
 *
 * Authenticated (JWT) endpoints for PM to generate and list survey tokens.
 *
 * POST /api/lms/students/:id/survey-links   — generate student/parent survey token
 * GET  /api/lms/students/:id/survey-links   — list active tokens for a student
 * GET  /api/lms/cohorts/:cohortId/surveys   — survey submission status for all students
 */

import { Router } from "express";
import { db, lmsAccessTokensTable, studentsTable, programmeCohortsTable, lmsStudentSurveysTable, lmsParentSurveysTable } from "@workspace/db";
import { eq, and, isNull, gt, sql } from "drizzle-orm";
import { randomBytes, createHash } from "crypto";
import { z } from "zod";
import { authMiddleware, requireRole } from "../../lib/auth";
import { generateId } from "../../lib/id";

const router = Router();

// ─── Shared PM scoping helper ────────────────────────────────────────────────────

async function assertStudentPmAccess(
  studentId: string,
  tenantId: string,
  userId: string,
  role: string,
): Promise<{ ok: boolean; student?: { id: string; cohortId: string | null } }> {
  const [student] = await db
    .select({ id: studentsTable.id, cohortId: studentsTable.cohortId })
    .from(studentsTable)
    // @ts-ignore -- Drizzle and() overload
    .where(and(eq(studentsTable.id, studentId), eq(studentsTable.tenantId, tenantId)));

  if (!student) return { ok: false };

  if (role === "MANAGER" && student.cohortId) {
    const [cohort] = await db
      .select({ programmeManagerId: programmeCohortsTable.programmeManagerId })
      .from(programmeCohortsTable)
      // @ts-ignore
      .where(and(eq(programmeCohortsTable.id, student.cohortId), eq(programmeCohortsTable.tenantId, tenantId)));
    if (!cohort || cohort.programmeManagerId !== userId) return { ok: false };
  }

  return { ok: true, student };
}

// ─── POST /api/lms/students/:id/survey-links ─────────────────────────────────────

const generateSurveyLinkSchema = z.object({
  tokenType: z.enum(["student_survey", "parent_survey"]),
});

router.post("/students/:id/survey-links", authMiddleware, requireRole("MANAGER", "ADMIN", "SUPER_ADMIN"), async (req, res): Promise<void> => {
  try {
    const user = req.user!;
    const tenantId = user.tenantId!;
    const studentId = req.params.id as string;

    const access = await assertStudentPmAccess(studentId, tenantId, user.id, user.role);
    if (!access.ok) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const parsed = generateSurveyLinkSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
      return;
    }

    const { tokenType } = parsed.data;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // 14 days

    const inviteToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(inviteToken).digest("hex");
    const tokenId = generateId("ltk");

    await db.insert(lmsAccessTokensTable).values({
      id: tokenId,
      tenantId,
      tokenHash,
      tokenType,
      scopeType: "student",
      scopeId: studentId,
      expiresAt,
      createdBy: user.id,
      maxUses: 5,
      useCount: 0,
      createdAt: now,
    } as any);

    res.status(201).json({
      tokenId,
      tokenType,
      // inviteToken returned once — PM embeds in fragment URL for distribution
      // Never stored in plain text after this response
      inviteToken,
      expiresAt,
    });
  } catch (err) {
    console.error("[lms/students/:id/survey-links POST]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /api/lms/students/:id/survey-links ──────────────────────────────────────

router.get("/students/:id/survey-links", authMiddleware, requireRole("MANAGER", "ADMIN", "SUPER_ADMIN"), async (req, res): Promise<void> => {
  try {
    const user = req.user!;
    const tenantId = user.tenantId!;
    const studentId = req.params.id as string;

    const access = await assertStudentPmAccess(studentId, tenantId, user.id, user.role);
    if (!access.ok) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const now = new Date();
    const tokens = await db
      .select({
        id: lmsAccessTokensTable.id,
        tokenType: lmsAccessTokensTable.tokenType,
        expiresAt: lmsAccessTokensTable.expiresAt,
        useCount: lmsAccessTokensTable.useCount,
        maxUses: lmsAccessTokensTable.maxUses,
        createdAt: lmsAccessTokensTable.createdAt,
      })
      .from(lmsAccessTokensTable)
      // @ts-ignore -- Drizzle and() overload
      .where(and(
        // @ts-ignore
        eq(lmsAccessTokensTable.tenantId, tenantId),
        // @ts-ignore
        eq(lmsAccessTokensTable.scopeId, studentId),
        // @ts-ignore
        eq(lmsAccessTokensTable.scopeType, "student"),
        // @ts-ignore
        isNull(lmsAccessTokensTable.revokedAt),
        // @ts-ignore
        gt(lmsAccessTokensTable.expiresAt, now),
        // @ts-ignore
        sql`${lmsAccessTokensTable.useCount} < ${lmsAccessTokensTable.maxUses}`,
      ) as any);

    res.json(tokens);
  } catch (err) {
    console.error("[lms/students/:id/survey-links GET]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /api/lms/cohorts/:cohortId/surveys ──────────────────────────────────────

router.get("/cohorts/:cohortId/surveys", authMiddleware, requireRole("MANAGER", "ADMIN", "SUPER_ADMIN"), async (req, res): Promise<void> => {
  try {
    const user = req.user!;
    const tenantId = user.tenantId!;
    const cohortId = req.params.cohortId as string;

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

    const studentIds = students.map((s) => s.id);

    const [allStudentSurveys, allParentSurveys] = await Promise.all([
      studentIds.length > 0
        ? db.select({ studentId: lmsStudentSurveysTable.studentId, timePoint: lmsStudentSurveysTable.timePoint })
            .from(lmsStudentSurveysTable)
            // @ts-ignore
            .where(eq(lmsStudentSurveysTable.tenantId, tenantId))
        : Promise.resolve([] as { studentId: string; timePoint: string }[]),
      studentIds.length > 0
        ? db.select({ studentId: lmsParentSurveysTable.studentId })
            .from(lmsParentSurveysTable)
            // @ts-ignore
            .where(eq(lmsParentSurveysTable.tenantId, tenantId))
        : Promise.resolve([] as { studentId: string }[]),
    ]);

    const result = students.map((s) => {
      const surveys = allStudentSurveys.filter((sv) => sv.studentId === s.id);
      const parentSurvey = allParentSurveys.find((p) => p.studentId === s.id);
      return {
        studentId: s.id,
        name: `${s.firstName} ${s.lastName}`,
        studentSurvey: {
          pre: surveys.some((sv) => sv.timePoint === "pre"),
          end: surveys.some((sv) => sv.timePoint === "end"),
        },
        parentSurvey: !!parentSurvey,
      };
    });

    res.json({ cohortId, students: result });
  } catch (err) {
    console.error("[lms/cohorts/:cohortId/surveys GET]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
