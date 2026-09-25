import { Router } from "express";
import { db, studentsTable, programmeCohortsTable, sessionAttendanceTable, programmeSessionsTable, lmsTalentScoresTable, lmsChosenTalentsTable, lmsCoachNarrativesTable, lmsTeacherFeedbackTable, lmsStudentSurveysTable } from "@workspace/db";
import { eq, and, count, sql } from "drizzle-orm";
import { authMiddleware, requireRole } from "../../lib/auth";
import { generateId } from "../../lib/id";
import { createStudentSchema, importStudentsSchema } from "@workspace/api-zod";
import { z } from "zod";

const router = Router();

// GET /api/lms/my-students — coach-scoped endpoint (OPERATOR only)
// Returns all students assigned to the authenticated coach across all cohorts
router.get("/my-students", authMiddleware, requireRole("OPERATOR"), async (req, res): Promise<void> => {
  try {
    const user = req.user!;
    const tenantId = user.tenantId!;

    const students = await db
      .select({
        id: studentsTable.id,
        firstName: studentsTable.firstName,
        lastName: studentsTable.lastName,
        cohortId: studentsTable.cohortId,
        yearGroup: studentsTable.yearGroup,
        gender: studentsTable.gender,
        coachId: studentsTable.coachId,
        completionStatus: studentsTable.completionStatus,
        consentStatus: studentsTable.consentStatus,
        pupilPremiumFlag: studentsTable.pupilPremiumFlag,
        ealFlag: studentsTable.ealFlag,
        senStage: studentsTable.senStage,
        lookedAfterFlag: studentsTable.lookedAfterFlag,
        careExperiencedFlag: studentsTable.careExperiencedFlag,
        personalAccessCode: studentsTable.personalAccessCode,
        withdrawnAtSession: studentsTable.withdrawnAtSession,
        createdAt: studentsTable.createdAt,
      })
      .from(studentsTable)
      .where(and(
        eq(studentsTable.tenantId, tenantId),
        eq(studentsTable.coachId, user.id),
      ) as any);

    res.json(students);
  } catch (err) {
    console.error("[lms/my-students GET]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Coach scoping: OPERATOR sees only their assigned students
function studentScopeFilter(tenantId: string, userId: string, role: string, cohortId?: string) {
  const filters: any[] = [eq(studentsTable.tenantId, tenantId)];
  if (cohortId) filters.push(eq(studentsTable.cohortId, cohortId));
  if (role === "OPERATOR") filters.push(eq(studentsTable.coachId, userId));
  return and(...filters);
}

// Generate a unique 6-char personal access code per tenant
async function generatePersonalAccessCode(tenantId: string): Promise<string> {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 20; attempt++) {
    let code = "";
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    const [existing] = await db
      .select({ id: studentsTable.id })
      .from(studentsTable)
      // @ts-ignore -- Drizzle and() overload
      .where(and(eq(studentsTable.tenantId, tenantId), eq(studentsTable.personalAccessCode, code)));
    if (!existing) return code;
  }
  throw new Error("Could not generate unique personal access code");
}

// GET /api/lms/cohorts/:cohortId/students
router.get("/cohorts/:cohortId/students", authMiddleware, requireRole("OPERATOR", "MANAGER", "ADMIN", "SUPER_ADMIN"), async (req, res): Promise<void> => {
  try {
    const user = req.user!;
    const tenantId = user.tenantId!;
    const cohortId = req.params.cohortId as string;
    const { page = "1", limit: rawLimit = "50" } = req.query;
    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(200, Math.max(1, Number(rawLimit)));
    const offset = (pageNum - 1) * limitNum;

    // Verify cohort belongs to tenant (and PM scoping)
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
      .select({
        id: studentsTable.id,
        firstName: studentsTable.firstName,
        lastName: studentsTable.lastName,
        yearGroup: studentsTable.yearGroup,
        gender: studentsTable.gender,
        coachId: studentsTable.coachId,
        completionStatus: studentsTable.completionStatus,
        consentStatus: studentsTable.consentStatus,
        pupilPremiumFlag: studentsTable.pupilPremiumFlag,
        ealFlag: studentsTable.ealFlag,
        senStage: studentsTable.senStage,
        lookedAfterFlag: studentsTable.lookedAfterFlag,
        careExperiencedFlag: studentsTable.careExperiencedFlag,
        personalAccessCode: studentsTable.personalAccessCode,
        withdrawnAtSession: studentsTable.withdrawnAtSession,
        createdAt: studentsTable.createdAt,
      })
      .from(studentsTable)
      .where(studentScopeFilter(tenantId, user.id, user.role, cohortId))
      .limit(limitNum)
      .offset(offset)
      .orderBy(studentsTable.lastName, studentsTable.firstName);

    res.json({ data: rows, pagination: { page: pageNum, limit: limitNum } });
  } catch (err) {
    console.error("[lms/cohorts/:cohortId/students GET]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/lms/cohorts/:cohortId/students
router.post("/cohorts/:cohortId/students", authMiddleware, requireRole("MANAGER", "ADMIN", "SUPER_ADMIN"), async (req, res): Promise<void> => {
  try {
    const user = req.user!;
    const tenantId = user.tenantId!;
    const cohortId = req.params.cohortId as string;

    const [cohort] = await db
      .select({ id: programmeCohortsTable.id, programmeId: programmeCohortsTable.programmeId, programmeManagerId: programmeCohortsTable.programmeManagerId, organizationId: sql<string>`(SELECT organization_id FROM programmes WHERE id = ${programmeCohortsTable.programmeId} LIMIT 1)` })
      .from(programmeCohortsTable)
      // @ts-ignore -- Drizzle and() overload
      .where(and(eq(programmeCohortsTable.id, cohortId), eq(programmeCohortsTable.tenantId, tenantId)));
    if (!cohort) { res.status(404).json({ error: "Cohort not found" }); return; }
    if (user.role === "MANAGER" && cohort.programmeManagerId !== user.id) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    const parsed = createStudentSchema.safeParse({ ...req.body, cohortId, programmeId: cohort.programmeId, organizationId: cohort.organizationId ?? "" });
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
      return;
    }
    const data = parsed.data;
    const personalAccessCode = await generatePersonalAccessCode(tenantId);
    const studentId = generateId("lst");
    const now = new Date();

    await db.insert(studentsTable).values({
      id: studentId,
      tenantId,
      organizationId: cohort.organizationId ?? "",
      programmeId: data.programmeId ?? cohort.programmeId,
      cohortId,
      firstName: data.firstName,
      lastName: data.lastName,
      yearGroup: data.yearGroup ?? null,
      gender: data.gender ?? null,
      pupilPremiumFlag: data.pupilPremiumFlag ?? false,
      ealFlag: data.ealFlag ?? false,
      senStage: data.senStage ?? "NONE",
      lookedAfterFlag: data.lookedAfterFlag ?? false,
      careExperiencedFlag: data.careExperiencedFlag ?? false,
      coachId: data.coachId ?? null,
      consentStatus: data.consentStatus ?? "PENDING",
      completionStatus: "ENROLLED",
      personalAccessCode,
      notes: data.notes ?? null,
      createdAt: now,
      updatedAt: now,
    } as any);

    const [created] = await db.select().from(studentsTable).where(eq(studentsTable.id, studentId));
    res.status(201).json(created);
  } catch (err) {
    console.error("[lms/cohorts/:cohortId/students POST]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/lms/cohorts/:cohortId/students/import/preview
router.post("/cohorts/:cohortId/students/import/preview", authMiddleware, requireRole("MANAGER", "ADMIN", "SUPER_ADMIN"), async (req, res): Promise<void> => {
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

    // Accept rows as raw array — do NOT reject the whole request for invalid rows
    const { rows, columnMapping } = req.body as { rows?: unknown[]; columnMapping?: Record<string, string> };
    if (!Array.isArray(rows)) {
      res.status(400).json({ error: "rows must be an array" }); return;
    }

    // Validate each row individually and produce per-row results
    const preview = rows.map((row: any, idx) => {
      const errors: string[] = [];
      if (!row?.firstName?.trim()) errors.push("firstName is required");
      if (!row?.lastName?.trim()) errors.push("lastName is required");
      return {
        rowIndex: idx,
        data: row,
        valid: errors.length === 0,
        errors,
      };
    });

    const validCount = preview.filter((r) => r.valid).length;
    const invalidCount = preview.length - validCount;

    res.json({
      cohortId,
      columnMapping: columnMapping ?? {},
      totalRows: rows.length,
      validRows: validCount,
      invalidRows: invalidCount,
      preview,
    });
  } catch (err) {
    console.error("[lms/cohorts/:cohortId/students/import/preview POST]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/lms/cohorts/:cohortId/students/import/apply
router.post("/cohorts/:cohortId/students/import/apply", authMiddleware, requireRole("MANAGER", "ADMIN", "SUPER_ADMIN"), async (req, res): Promise<void> => {
  try {
    const user = req.user!;
    const tenantId = user.tenantId!;
    const cohortId = req.params.cohortId as string;

    const [cohort] = await db
      .select({ id: programmeCohortsTable.id, programmeId: programmeCohortsTable.programmeId, programmeManagerId: programmeCohortsTable.programmeManagerId, organizationId: sql<string>`(SELECT organization_id FROM programmes WHERE id = ${programmeCohortsTable.programmeId} LIMIT 1)` })
      .from(programmeCohortsTable)
      // @ts-ignore -- Drizzle and() overload
      .where(and(eq(programmeCohortsTable.id, cohortId), eq(programmeCohortsTable.tenantId, tenantId)));
    if (!cohort) { res.status(404).json({ error: "Cohort not found" }); return; }
    if (user.role === "MANAGER" && cohort.programmeManagerId !== user.id) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    // Accept rows as raw array — silently skip invalid rows, only insert valid ones
    const { rows } = req.body as { rows?: unknown[] };
    if (!Array.isArray(rows)) {
      res.status(400).json({ error: "rows must be an array" }); return;
    }

    // Filter to valid rows only
    const validRows = (rows as any[]).filter((r) => r?.firstName?.trim() && r?.lastName?.trim());
    if (validRows.length === 0) {
      res.status(400).json({ error: "No valid rows to import" });
      return;
    }

    const now = new Date();
    const inserted: string[] = [];

    for (const row of validRows) {
      const personalAccessCode = await generatePersonalAccessCode(tenantId);
      const studentId = generateId("lst");
      await db.insert(studentsTable).values({
        id: studentId,
        tenantId,
        organizationId: cohort.organizationId ?? "",
        programmeId: cohort.programmeId,
        cohortId,
        firstName: row.firstName,
        lastName: row.lastName,
        yearGroup: row.yearGroup ?? null,
        gender: row.gender ?? null,
        pupilPremiumFlag: row.pupilPremiumFlag ?? false,
        ealFlag: row.ealFlag ?? false,
        senStage: row.senStage ?? "NONE",
        lookedAfterFlag: row.lookedAfterFlag ?? false,
        careExperiencedFlag: row.careExperiencedFlag ?? false,
        consentStatus: "PENDING",
        completionStatus: "ENROLLED",
        personalAccessCode,
        createdAt: now,
        updatedAt: now,
      } as any);
      inserted.push(studentId);
    }

    res.status(201).json({ imported: inserted.length, studentIds: inserted });
  } catch (err) {
    console.error("[lms/cohorts/:cohortId/students/import/apply POST]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/lms/students/:id
router.get("/students/:id", authMiddleware, requireRole("OPERATOR", "MANAGER", "ADMIN", "SUPER_ADMIN"), async (req, res): Promise<void> => {
  try {
    const user = req.user!;
    const tenantId = user.tenantId!;
    const id = req.params.id as string;

    const [student] = await db
      .select()
      .from(studentsTable)
      // @ts-ignore -- Drizzle and() overload
      .where(and(eq(studentsTable.id, id), eq(studentsTable.tenantId, tenantId)));
    if (!student) { res.status(404).json({ error: "Student not found" }); return; }

    // Coach scoping
    if (user.role === "OPERATOR" && student.coachId !== user.id) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
    // PM scoping
    if (user.role === "MANAGER" && student.cohortId) {
      const [cohort] = await db
        .select({ programmeManagerId: programmeCohortsTable.programmeManagerId })
        .from(programmeCohortsTable)
        .where(eq(programmeCohortsTable.id, student.cohortId));
      if (cohort && cohort.programmeManagerId !== user.id) {
        res.status(403).json({ error: "Forbidden" }); return;
      }
    }

    // Fetch related data sections
    const [scores, chosenTalents, narratives, teacherFeedback, surveys] = await Promise.all([
      db.select().from(lmsTalentScoresTable)

      // @ts-ignore -- Drizzle and() overload
.where(and(eq(lmsTalentScoresTable.studentId, id), eq(lmsTalentScoresTable.tenantId, tenantId))),
      db.select().from(lmsChosenTalentsTable)

      // @ts-ignore -- Drizzle and() overload
.where(and(eq(lmsChosenTalentsTable.studentId, id), eq(lmsChosenTalentsTable.tenantId, tenantId))),
      db.select().from(lmsCoachNarrativesTable)

      // @ts-ignore -- Drizzle and() overload
.where(and(eq(lmsCoachNarrativesTable.studentId, id), eq(lmsCoachNarrativesTable.tenantId, tenantId))),
      db.select().from(lmsTeacherFeedbackTable)

      // @ts-ignore -- Drizzle and() overload
.where(and(eq(lmsTeacherFeedbackTable.studentId, id), eq(lmsTeacherFeedbackTable.tenantId, tenantId))),
      db.select().from(lmsStudentSurveysTable)

      // @ts-ignore -- Drizzle and() overload
.where(and(eq(lmsStudentSurveysTable.studentId, id), eq(lmsStudentSurveysTable.tenantId, tenantId))),
    ]);

    res.json({
      ...student,
      scores,
      chosenTalents: chosenTalents[0] ?? null,
      narratives: narratives[0] ?? null,
      teacherFeedback: teacherFeedback[0] ?? null,
      surveys,
    });
  } catch (err) {
    console.error("[lms/students/:id GET]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

const updateStudentSchema = createStudentSchema.partial();

// PUT /api/lms/students/:id
router.put("/students/:id", authMiddleware, requireRole("MANAGER", "ADMIN", "SUPER_ADMIN"), async (req, res): Promise<void> => {
  try {
    const user = req.user!;
    const tenantId = user.tenantId!;
    const id = req.params.id as string;

    const [student] = await db
      .select({ id: studentsTable.id, cohortId: studentsTable.cohortId })
      .from(studentsTable)
      // @ts-ignore -- Drizzle and() overload
      .where(and(eq(studentsTable.id, id), eq(studentsTable.tenantId, tenantId)));
    if (!student) { res.status(404).json({ error: "Student not found" }); return; }

    // PM scoping via cohort
    if (user.role === "MANAGER" && student.cohortId) {
      const [cohort] = await db
        .select({ programmeManagerId: programmeCohortsTable.programmeManagerId })
        .from(programmeCohortsTable)
        .where(eq(programmeCohortsTable.id, student.cohortId));
      if (cohort && cohort.programmeManagerId !== user.id) {
        res.status(403).json({ error: "Forbidden" }); return;
      }
    }

    const parsed = updateStudentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
      return;
    }
    const data = parsed.data;

    await db
      .update(studentsTable)
      .set({
        ...(data.firstName !== undefined && { firstName: data.firstName }),
        ...(data.lastName !== undefined && { lastName: data.lastName }),
        ...(data.yearGroup !== undefined && { yearGroup: data.yearGroup }),
        ...(data.gender !== undefined && { gender: data.gender }),
        ...(data.coachId !== undefined && { coachId: data.coachId }),
        ...(data.consentStatus !== undefined && { consentStatus: data.consentStatus }),
        ...(data.pupilPremiumFlag !== undefined && { pupilPremiumFlag: data.pupilPremiumFlag }),
        ...(data.ealFlag !== undefined && { ealFlag: data.ealFlag }),
        ...(data.senStage !== undefined && { senStage: data.senStage }),
        ...(data.lookedAfterFlag !== undefined && { lookedAfterFlag: data.lookedAfterFlag }),
        ...(data.careExperiencedFlag !== undefined && { careExperiencedFlag: data.careExperiencedFlag }),
        ...(data.notes !== undefined && { notes: data.notes }),
        updatedAt: new Date(),
      } as any)
      // @ts-ignore -- chain broken by as any cast
      .where(eq(studentsTable.id, id));

    const [updated] = await db.select().from(studentsTable).where(eq(studentsTable.id, id));
    res.json(updated);
  } catch (err) {
    console.error("[lms/students/:id PUT]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/lms/students/:id/withdraw
router.put("/students/:id/withdraw", authMiddleware, requireRole("MANAGER", "ADMIN", "SUPER_ADMIN"), async (req, res): Promise<void> => {
  try {
    const user = req.user!;
    const tenantId = user.tenantId!;
    const id = req.params.id as string;
    const { withdrawalReason, withdrawnAtSession } = req.body as { withdrawalReason?: string; withdrawnAtSession?: string };

    const [student] = await db
      .select({ id: studentsTable.id, cohortId: studentsTable.cohortId })
      .from(studentsTable)
      // @ts-ignore -- Drizzle and() overload
      .where(and(eq(studentsTable.id, id), eq(studentsTable.tenantId, tenantId)));
    if (!student) { res.status(404).json({ error: "Student not found" }); return; }

    // PM scoping
    if (user.role === "MANAGER" && student.cohortId) {
      const [cohort] = await db
        .select({ programmeManagerId: programmeCohortsTable.programmeManagerId })
        .from(programmeCohortsTable)
        .where(eq(programmeCohortsTable.id, student.cohortId));
      if (cohort && cohort.programmeManagerId !== user.id) {
        res.status(403).json({ error: "Forbidden" }); return;
      }
    }

    await db
      .update(studentsTable)
      .set({
        completionStatus: "WITHDRAWN",
        withdrawalReason: withdrawalReason ?? null,
        withdrawnAtSession: withdrawnAtSession ?? null,
        updatedAt: new Date(),
      } as any)
      // @ts-ignore -- chain broken by as any cast
      .where(eq(studentsTable.id, id));

    res.json({ id, completionStatus: "WITHDRAWN" });
  } catch (err) {
    console.error("[lms/students/:id/withdraw PUT]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/lms/students/:id/completeness
router.get("/students/:id/completeness", authMiddleware, requireRole("OPERATOR", "MANAGER", "ADMIN", "SUPER_ADMIN"), async (req, res): Promise<void> => {
  try {
    const user = req.user!;
    const tenantId = user.tenantId!;
    const id = req.params.id as string;

    const [student] = await db
      .select({ id: studentsTable.id, cohortId: studentsTable.cohortId, coachId: studentsTable.coachId, completionStatus: studentsTable.completionStatus, metadata: studentsTable.metadata })
      .from(studentsTable)
      // @ts-ignore -- Drizzle and() overload
      .where(and(eq(studentsTable.id, id), eq(studentsTable.tenantId, tenantId)));
    if (!student) { res.status(404).json({ error: "Student not found" }); return; }
    if (user.role === "OPERATOR" && student.coachId !== user.id) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
    // PM scoping
    if (user.role === "MANAGER" && student.cohortId) {
      const [cohort] = await db
        .select({ programmeManagerId: programmeCohortsTable.programmeManagerId })
        .from(programmeCohortsTable)
        .where(eq(programmeCohortsTable.id, student.cohortId));
      if (cohort && cohort.programmeManagerId !== user.id) {
        res.status(403).json({ error: "Forbidden" }); return;
      }
    }

    const [scores, chosenTalents, narratives, teacherFeedback, surveys, attendance] = await Promise.all([
      db.select().from(lmsTalentScoresTable)

      // @ts-ignore -- Drizzle and() overload
.where(and(eq(lmsTalentScoresTable.studentId, id), eq(lmsTalentScoresTable.tenantId, tenantId))),
      db.select().from(lmsChosenTalentsTable)

      // @ts-ignore -- Drizzle and() overload
.where(and(eq(lmsChosenTalentsTable.studentId, id), eq(lmsChosenTalentsTable.tenantId, tenantId))),
      db.select().from(lmsCoachNarrativesTable)

      // @ts-ignore -- Drizzle and() overload
.where(and(eq(lmsCoachNarrativesTable.studentId, id), eq(lmsCoachNarrativesTable.tenantId, tenantId))),
      db.select().from(lmsTeacherFeedbackTable)

      // @ts-ignore -- Drizzle and() overload
.where(and(eq(lmsTeacherFeedbackTable.studentId, id), eq(lmsTeacherFeedbackTable.tenantId, tenantId))),
      db.select().from(lmsStudentSurveysTable)

      // @ts-ignore -- Drizzle and() overload
.where(and(eq(lmsStudentSurveysTable.studentId, id), eq(lmsStudentSurveysTable.tenantId, tenantId))),
      db.select().from(sessionAttendanceTable)

      // @ts-ignore -- Drizzle and() overload
.where(and(eq(sessionAttendanceTable.studentId, id), eq(sessionAttendanceTable.tenantId, tenantId))),
    ]);

    // Cohort min threshold
    let minAttendanceSessions = 6;
    if (student.cohortId) {
      const [cohort] = await db
        .select({ minAttendanceSessions: programmeCohortsTable.minAttendanceSessions })
        .from(programmeCohortsTable)
        .where(eq(programmeCohortsTable.id, student.cohortId));
      if (cohort?.minAttendanceSessions) minAttendanceSessions = cohort.minAttendanceSessions;
    }

    const attendedCount = attendance.filter((a) => a.attended).length;

    // Total sessions = cohort session count, not attendance rows
    let totalSessions = 8; // default
    if (student.cohortId) {
      const [{ sessionCount }] = await db
        .select({ sessionCount: count() })
        .from(programmeSessionsTable)
        // @ts-ignore -- Drizzle and() overload
        .where(and(eq(programmeSessionsTable.cohortId, student.cohortId), eq(programmeSessionsTable.tenantId, tenantId)));
      totalSessions = sessionCount;
    }

    // Apply attendance overrides from student metadata
    const meta = (student.metadata as any) ?? {};
    const overrides: any[] = meta.attendanceOverrides ?? [];
    const latestOverride = overrides.length > 0 ? overrides[overrides.length - 1] : null;
    let meetsThreshold = attendedCount >= minAttendanceSessions;
    if (latestOverride?.overrideType === "include_despite_low_attendance") meetsThreshold = true;
    if (latestOverride?.overrideType === "exclude_despite_sufficient_attendance") meetsThreshold = false;

    const coachScorePre = scores.find((s) => s.raterType === "coach" && s.timePoint === "pre");
    const coachScoreEnd = scores.find((s) => s.raterType === "coach" && s.timePoint === "end");
    const studentScorePre = scores.find((s) => s.raterType === "student" && s.timePoint === "pre");
    const studentScoreEnd = scores.find((s) => s.raterType === "student" && s.timePoint === "end");
    const teacherScorePre = scores.find((s) => s.raterType === "teacher" && s.timePoint === "pre");
    const teacherScoreEnd = scores.find((s) => s.raterType === "teacher" && s.timePoint === "end");

    const narrative = narratives[0] ?? null;
    const narrativeFields = ["overallEngagement", "attendanceComment", "itwReflection", "wowReflection", "talentProgressSummary", "overallProgressSummary", "nextSteps"];
    const narrativeFilled = narrative ? narrativeFields.filter((f) => (narrative as any)[f]).length : 0;

    const surveyPre = surveys.find((s) => s.timePoint === "pre");
    const surveyEnd = surveys.find((s) => s.timePoint === "end");

    const tf = teacherFeedback[0] ?? null;

    // Blocking sections for school report
    const blockingComplete =
      meetsThreshold &&
      !!coachScorePre?.isComplete &&
      !!coachScoreEnd?.isComplete &&
      !!chosenTalents[0] &&
      !!narrative?.isComplete &&
      !!surveyEnd;

    res.json({
      studentId: id,
      status: student.completionStatus === "WITHDRAWN" ? "excluded" : blockingComplete ? "ready" : "incomplete",
      attendance: { attended: attendedCount, total: totalSessions, meetsThreshold },
      coachScores: { pre: !!coachScorePre?.isComplete, end: !!coachScoreEnd?.isComplete },
      studentScores: { pre: !!studentScorePre?.isComplete, end: !!studentScoreEnd?.isComplete },
      teacherScores: { pre: !!teacherScorePre?.isComplete, end: !!teacherScoreEnd?.isComplete },
      chosenTalents: !!chosenTalents[0],
      narratives: { complete: narrativeFilled, total: narrativeFields.length, isComplete: !!narrative?.isComplete },
      teacherFeedback: { submitted: !!tf?.isComplete, blocking: false },
      studentSurvey: { pre: !!surveyPre, end: !!surveyEnd },
      parentSurvey: { submitted: false, blocking: false },
    });
  } catch (err) {
    console.error("[lms/students/:id/completeness GET]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
