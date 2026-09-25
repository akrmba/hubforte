import { Router } from "express";
import { db, programmeCohortsTable, studentsTable, programmeSessionsTable, usersTable, lmsTripDataTable, lmsCohortNarrativesTable, lmsReportsTable, lmsTalentScoresTable, lmsChosenTalentsTable, lmsCoachNarrativesTable, lmsStudentSurveysTable, sessionAttendanceTable } from "@workspace/db";
import { eq, and, count, sql } from "drizzle-orm";
import { authMiddleware, requireRole } from "../../lib/auth";
import { generateId } from "../../lib/id";
import { createCohortSchema } from "@workspace/api-zod";
import { z } from "zod";

const router = Router();

// Scoping helper: PMs see only their cohorts; Admins/Super see all
function cohortScopeFilter(tenantId: string, userId: string, role: string) {
  const base = eq(programmeCohortsTable.tenantId, tenantId);
  if (role === "MANAGER") {
    return and(base, eq(programmeCohortsTable.programmeManagerId, userId));
  }
  return base;
}

// Session types for auto-generation
const SESSION_TYPES = [
  "welcome",
  "coaching1",
  "coaching2",
  "itw",
  "coaching3",
  "wow",
  "coaching4",
  "graduation",
] as const;

// GET /api/lms/cohorts
router.get("/", authMiddleware, requireRole("MANAGER", "ADMIN", "SUPER_ADMIN"), async (req, res): Promise<void> => {
  try {
    const user = req.user!;
    const tenantId = user.tenantId!;
    const { status, programmeType, page = "1", limit: rawLimit = "25" } = req.query;

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(100, Math.max(1, Number(rawLimit)));
    const offset = (pageNum - 1) * limitNum;

    const filters: ReturnType<typeof eq>[] = [];
    filters.push(eq(programmeCohortsTable.tenantId, tenantId) as any);

    if (user.role === "MANAGER") {
      filters.push(eq(programmeCohortsTable.programmeManagerId, user.id) as any);
    }
    if (status) filters.push(eq(programmeCohortsTable.lmsLifecycleStatus, status as string) as any);
    if (programmeType) filters.push(eq(programmeCohortsTable.programmeType, programmeType as string) as any);

    const rows = await db
      .select({
        id: programmeCohortsTable.id,
        cohortName: programmeCohortsTable.cohortName,
        programmeId: programmeCohortsTable.programmeId,
        programmeType: programmeCohortsTable.programmeType,
        programmeManagerId: programmeCohortsTable.programmeManagerId,
        leadTeacherName: programmeCohortsTable.leadTeacherName,
        minAttendanceSessions: programmeCohortsTable.minAttendanceSessions,
        lmsLifecycleStatus: programmeCohortsTable.lmsLifecycleStatus,
        status: programmeCohortsTable.status,
        startDate: programmeCohortsTable.startDate,
        endDate: programmeCohortsTable.endDate,
        capacity: programmeCohortsTable.capacity,
        enrolledCount: programmeCohortsTable.enrolledCount,
        createdAt: programmeCohortsTable.createdAt,
      })
      .from(programmeCohortsTable)
      .where(and(...filters))
      .limit(limitNum)
      .offset(offset)
      .orderBy(programmeCohortsTable.createdAt);

    // Attach student counts
    const ids = rows.map((r) => r.id);
    let studentCounts: Record<string, number> = {};
    if (ids.length > 0) {
      const allStudents = await db
        .select({ cohortId: studentsTable.cohortId })
        .from(studentsTable)
        .where(eq(studentsTable.tenantId, tenantId));
      for (const s of allStudents) {
        if (s.cohortId && ids.includes(s.cohortId)) {
          studentCounts[s.cohortId] = (studentCounts[s.cohortId] || 0) + 1;
        }
      }
    }

    res.json({
      data: rows.map((r) => ({ ...r, studentCount: studentCounts[r.id] || 0 })),
      pagination: { page: pageNum, limit: limitNum },
    });
  } catch (err) {
    console.error("[lms/cohorts GET]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/lms/cohorts
router.post("/", authMiddleware, requireRole("MANAGER", "ADMIN", "SUPER_ADMIN"), async (req, res): Promise<void> => {
  try {
    const user = req.user!;
    const tenantId = user.tenantId!;
    const parsed = createCohortSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
      return;
    }
    const data = parsed.data;

    const cohortId = generateId("lco");
    const now = new Date();

    await db.insert(programmeCohortsTable).values({
      id: cohortId,
      tenantId,
      programmeId: data.programmeId,
      cohortName: data.cohortName,
      startDate: data.startDate ? new Date(data.startDate) : null,
      endDate: data.endDate ? new Date(data.endDate) : null,
      capacity: data.capacity ?? null,
      programmeType: data.programmeType ?? null,
      programmeManagerId: data.programmeManagerId ?? user.id,
      leadTeacherName: data.leadTeacherName ?? null,
      minAttendanceSessions: data.minAttendanceSessions ?? 6,
      lmsLifecycleStatus: "setup",
      status: "PLANNED",
      notes: data.notes ?? null,
      createdAt: now,
      updatedAt: now,
    } as any);

    // Auto-generate 8 sessions
    const sessionInserts = SESSION_TYPES.map((sessionType, idx) => ({
      id: generateId("lse"),
      tenantId,
      programmeId: data.programmeId,
      cohortId,
      sessionNumber: idx + 1,
      sessionType,
      status: "SCHEDULED",
      createdAt: now,
      updatedAt: now,
    }));
    await db.insert(programmeSessionsTable).values(sessionInserts as any[]);

    const [created] = await db
      .select()
      .from(programmeCohortsTable)
      .where(eq(programmeCohortsTable.id, cohortId));

    res.status(201).json(created);
  } catch (err) {
    console.error("[lms/cohorts POST]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/lms/cohorts/:id
router.get("/:id", authMiddleware, requireRole("MANAGER", "ADMIN", "SUPER_ADMIN"), async (req, res): Promise<void> => {
  try {
    const user = req.user!;
    const tenantId = user.tenantId!;
    const id = req.params.id as string;

    const [cohort] = await db
      .select()
      .from(programmeCohortsTable)
      // @ts-ignore -- Drizzle and() overload
      .where(and(eq(programmeCohortsTable.id, id), eq(programmeCohortsTable.tenantId, tenantId)));

    if (!cohort) {
      res.status(404).json({ error: "Cohort not found" });
      return;
    }

    // PM scoping
    if (user.role === "MANAGER" && cohort.programmeManagerId !== user.id) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const [{ studentCount }] = await db
      .select({ studentCount: count() })
      .from(studentsTable)
      // @ts-ignore -- Drizzle and() overload
      .where(and(eq(studentsTable.cohortId, id), eq(studentsTable.tenantId, tenantId)));

    const sessions = await db
      .select()
      .from(programmeSessionsTable)
      // @ts-ignore -- Drizzle and() overload
      .where(and(eq(programmeSessionsTable.cohortId, id), eq(programmeSessionsTable.tenantId, tenantId)))
      .orderBy(programmeSessionsTable.sessionNumber);

    res.json({ ...cohort, studentCount, sessions });
  } catch (err) {
    console.error("[lms/cohorts/:id GET]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

const updateCohortSchema = createCohortSchema.partial().omit({ programmeId: true });

// PUT /api/lms/cohorts/:id
router.put("/:id", authMiddleware, requireRole("MANAGER", "ADMIN", "SUPER_ADMIN"), async (req, res): Promise<void> => {
  try {
    const user = req.user!;
    const tenantId = user.tenantId!;
    const id = req.params.id as string;

    const [cohort] = await db
      .select()
      .from(programmeCohortsTable)
      // @ts-ignore -- Drizzle and() overload
      .where(and(eq(programmeCohortsTable.id, id), eq(programmeCohortsTable.tenantId, tenantId)));

    if (!cohort) { res.status(404).json({ error: "Cohort not found" }); return; }
    if (user.role === "MANAGER" && cohort.programmeManagerId !== user.id) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    const parsed = updateCohortSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
      return;
    }
    const data = parsed.data;

    await db
      .update(programmeCohortsTable)
      .set({
        ...(data.cohortName !== undefined && { cohortName: data.cohortName }),
        ...(data.startDate !== undefined && { startDate: data.startDate ? new Date(data.startDate) : null }),
        ...(data.endDate !== undefined && { endDate: data.endDate ? new Date(data.endDate) : null }),
        ...(data.capacity !== undefined && { capacity: data.capacity }),
        ...(data.programmeType !== undefined && { programmeType: data.programmeType }),
        ...(data.programmeManagerId !== undefined && { programmeManagerId: data.programmeManagerId }),
        ...(data.leadTeacherName !== undefined && { leadTeacherName: data.leadTeacherName }),
        ...(data.minAttendanceSessions !== undefined && { minAttendanceSessions: data.minAttendanceSessions }),
        ...(data.notes !== undefined && { notes: data.notes }),
        updatedAt: new Date(),
      } as any)
      // @ts-ignore -- chain broken by as any cast
      .where(eq(programmeCohortsTable.id, id));

    const [updated] = await db.select().from(programmeCohortsTable).where(eq(programmeCohortsTable.id, id));
    res.json(updated);
  } catch (err) {
    console.error("[lms/cohorts/:id PUT]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Status transition validation — full 5-state machine
const STATUS_TRANSITIONS: Record<string, string> = {
  setup: "active",
  active: "data_collection",
  data_collection: "report_generation",
  report_generation: "complete",
};

// PUT /api/lms/cohorts/:id/status
router.put("/:id/status", authMiddleware, requireRole("MANAGER", "ADMIN", "SUPER_ADMIN"), async (req, res): Promise<void> => {
  try {
    const user = req.user!;
    const tenantId = user.tenantId!;
    const id = req.params.id as string;
    const { status } = req.body as { status: string };

    if (!status) { res.status(400).json({ error: "status is required" }); return; }

    const [cohort] = await db
      .select()
      .from(programmeCohortsTable)
      // @ts-ignore -- Drizzle and() overload
      .where(and(eq(programmeCohortsTable.id, id), eq(programmeCohortsTable.tenantId, tenantId)));

    if (!cohort) { res.status(404).json({ error: "Cohort not found" }); return; }
    if (user.role === "MANAGER" && cohort.programmeManagerId !== user.id) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    const current = cohort.lmsLifecycleStatus ?? "setup";
    const expected = STATUS_TRANSITIONS[current];
    if (!expected || status !== expected) {
      res.status(400).json({ error: `Invalid transition: ${current} → ${status}. Expected: ${expected ?? "none (already complete)"}` });
      return;
    }

    // Gate: setup → active: all students must have a coach assigned
    if (status === "active") {
      const [{ unassigned }] = await db
        .select({ unassigned: count() })
        .from(studentsTable)
        // @ts-ignore -- Drizzle and() overload
        .where(and(
          eq(studentsTable.cohortId, id),
          eq(studentsTable.tenantId, tenantId),
          sql`${studentsTable.coachId} IS NULL`,
        ) as any);
      if (unassigned > 0) {
        res.status(400).json({ error: `${unassigned} student(s) have no coach assigned` });
        return;
      }
    }

    // Gate: active → data_collection: at least one session delivered
    if (status === "data_collection") {
      const [{ delivered }] = await db
        .select({ delivered: count() })
        .from(programmeSessionsTable)
        // @ts-ignore -- Drizzle and() overload
        .where(and(
          eq(programmeSessionsTable.cohortId, id),
          eq(programmeSessionsTable.tenantId, tenantId),
          eq(programmeSessionsTable.status, "COMPLETED"),
        ) as any);
      if (delivered === 0) {
        res.status(400).json({ error: "At least one session must be completed before moving to data collection" });
        return;
      }
    }

    // Gate: data_collection → report_generation: lead teacher set + trip data complete + cohort narratives complete + all active students ready for blocking sections
    if (status === "report_generation") {
      if (!cohort.leadTeacherName) {
        res.status(400).json({ error: "Lead teacher name must be set before moving to report generation" });
        return;
      }
      // Trip data must be complete for both ITW and WOW
      const tripRows = await db
        .select({ tripType: lmsTripDataTable.tripType, isComplete: lmsTripDataTable.isComplete })
        .from(lmsTripDataTable)
        // @ts-ignore -- Drizzle and() overload
        .where(and(eq(lmsTripDataTable.cohortId, id), eq(lmsTripDataTable.tenantId, tenantId)));
      const itwComplete = tripRows.find((t) => t.tripType === "itw")?.isComplete ?? false;
      const wowComplete = tripRows.find((t) => t.tripType === "wow")?.isComplete ?? false;
      if (!itwComplete || !wowComplete) {
        res.status(400).json({ error: "Both ITW and WOW trip data must be marked complete before moving to report generation" });
        return;
      }
      // Cohort narratives must be complete
      const [cohortNarrative] = await db
        .select({ id: lmsCohortNarrativesTable.id, programmeStrengths: lmsCohortNarrativesTable.programmeStrengths, programmeChallenges: lmsCohortNarrativesTable.programmeChallenges, overallAssessment: lmsCohortNarrativesTable.overallAssessment, conclusionNarrative: lmsCohortNarrativesTable.conclusionNarrative })
        .from(lmsCohortNarrativesTable)
        // @ts-ignore -- Drizzle and() overload
        .where(and(eq(lmsCohortNarrativesTable.cohortId, id), eq(lmsCohortNarrativesTable.tenantId, tenantId)));
      const narrativeComplete = cohortNarrative &&
        cohortNarrative.programmeStrengths && cohortNarrative.programmeChallenges &&
        cohortNarrative.overallAssessment && cohortNarrative.conclusionNarrative;
      if (!narrativeComplete) {
        res.status(400).json({ error: "Cohort narratives (strengths, challenges, assessment, conclusion) must be complete before moving to report generation" });
        return;
      }
      // All active (non-withdrawn) students must be ready for blocking sections
      const activeStudents = await db
        .select({ id: studentsTable.id, completionStatus: studentsTable.completionStatus, metadata: studentsTable.metadata })
        .from(studentsTable)
        // @ts-ignore -- Drizzle and() overload
        .where(and(eq(studentsTable.cohortId, id), eq(studentsTable.tenantId, tenantId)));
      if (activeStudents.length === 0) {
        res.status(400).json({ error: "Cohort must have at least one student before moving to report generation" });
        return;
      }
      const nonWithdrawn = activeStudents.filter((s) => s.completionStatus !== "WITHDRAWN");
      if (nonWithdrawn.length === 0) {
        res.status(400).json({ error: "Cohort has no active students — all are withdrawn" });
        return;
      }
      // Load blocking data for all active students in one pass
      const studentIds = nonWithdrawn.map((s) => s.id);
      const minAttendance = cohort.minAttendanceSessions ?? 6;
      const [allSessions, allAttendance, allScores, allChosenTalents, allNarratives, allSurveys] = await Promise.all([
        db.select({ id: programmeSessionsTable.id }).from(programmeSessionsTable)
          // @ts-ignore -- Drizzle and() overload
          .where(and(eq(programmeSessionsTable.cohortId, id), eq(programmeSessionsTable.tenantId, tenantId))),
        db.select({ studentId: sessionAttendanceTable.studentId, attended: sessionAttendanceTable.attended }).from(sessionAttendanceTable).where(eq(sessionAttendanceTable.tenantId, tenantId)),
        db.select({ studentId: lmsTalentScoresTable.studentId, raterType: lmsTalentScoresTable.raterType, timePoint: lmsTalentScoresTable.timePoint, isComplete: lmsTalentScoresTable.isComplete }).from(lmsTalentScoresTable).where(eq(lmsTalentScoresTable.tenantId, tenantId)),
        db.select({ studentId: lmsChosenTalentsTable.studentId }).from(lmsChosenTalentsTable).where(eq(lmsChosenTalentsTable.tenantId, tenantId)),
        db.select({ studentId: lmsCoachNarrativesTable.studentId, isComplete: lmsCoachNarrativesTable.isComplete }).from(lmsCoachNarrativesTable).where(eq(lmsCoachNarrativesTable.tenantId, tenantId)),
        db.select({ studentId: lmsStudentSurveysTable.studentId, timePoint: lmsStudentSurveysTable.timePoint }).from(lmsStudentSurveysTable).where(eq(lmsStudentSurveysTable.tenantId, tenantId)),
      ]);
      const totalSessions = allSessions.length;
      const notReady: string[] = [];
      for (const student of nonWithdrawn) {
        const attended = allAttendance.filter((a) => a.studentId === student.id && a.attended).length;
        const meta = (student.metadata as any) ?? {};
        const overrides: any[] = meta.attendanceOverrides ?? [];
        const latest = overrides.length > 0 ? overrides[overrides.length - 1] : null;
        let meetsThreshold = attended >= minAttendance;
        if (latest?.overrideType === "include_despite_low_attendance") meetsThreshold = true;
        if (latest?.overrideType === "exclude_despite_sufficient_attendance") meetsThreshold = false;
        const coachPre = allScores.find((s) => s.studentId === student.id && s.raterType === "coach" && s.timePoint === "pre");
        const coachEnd = allScores.find((s) => s.studentId === student.id && s.raterType === "coach" && s.timePoint === "end");
        const chosenTalents = allChosenTalents.find((c) => c.studentId === student.id);
        const narrative = allNarratives.find((n) => n.studentId === student.id);
        const surveyEnd = allSurveys.find((s) => s.studentId === student.id && s.timePoint === "end");
        const ready = meetsThreshold && !!coachPre?.isComplete && !!coachEnd?.isComplete && !!chosenTalents && !!narrative?.isComplete && !!surveyEnd;
        if (!ready) notReady.push(`${student.id}`);
      }
      if (notReady.length > 0) {
        res.status(400).json({ error: `${notReady.length} active student(s) are not ready for blocking sections`, notReadyStudentIds: notReady });
        return;
      }
    }

    // Gate: report_generation → complete: at least one report with status "sent"
    if (status === "complete") {
      const [{ sentCount }] = await db
        .select({ sentCount: count() })
        .from(lmsReportsTable)
        // @ts-ignore -- Drizzle and() overload
        .where(and(
          // @ts-ignore -- Drizzle eq() overload
          eq(lmsReportsTable.cohortId, id),
          // @ts-ignore -- Drizzle eq() overload
          eq(lmsReportsTable.tenantId, tenantId),
          // @ts-ignore -- Drizzle eq() overload
          eq(lmsReportsTable.status, "sent"),
        ) as any);
      if (sentCount === 0) {
        res.status(400).json({ error: "At least one report must be in 'sent' status before marking the cohort complete" });
        return;
      }
    }

    await db
      .update(programmeCohortsTable)
      .set({ lmsLifecycleStatus: status, updatedAt: new Date() } as any)
      // @ts-ignore -- chain broken by as any cast
      .where(eq(programmeCohortsTable.id, id));

    res.json({ id, lmsLifecycleStatus: status });
  } catch (err) {
    console.error("[lms/cohorts/:id/status PUT]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/lms/cohorts/:id — setup status only, no student data
router.delete("/:id", authMiddleware, requireRole("ADMIN", "SUPER_ADMIN"), async (req, res): Promise<void> => {
  try {
    const user = req.user!;
    const tenantId = user.tenantId!;
    const id = req.params.id as string;

    const [cohort] = await db
      .select()
      .from(programmeCohortsTable)
      // @ts-ignore -- Drizzle and() overload
      .where(and(eq(programmeCohortsTable.id, id), eq(programmeCohortsTable.tenantId, tenantId)));

    if (!cohort) { res.status(404).json({ error: "Cohort not found" }); return; }
    if (cohort.lmsLifecycleStatus !== "setup") {
      res.status(400).json({ error: "Only cohorts in setup status can be deleted" });
      return;
    }

    const [{ studentCount }] = await db
      .select({ studentCount: count() })
      .from(studentsTable)
      // @ts-ignore -- Drizzle and() overload
      .where(and(eq(studentsTable.cohortId, id), eq(studentsTable.tenantId, tenantId)));

    if (studentCount > 0) {
      res.status(400).json({ error: "Cannot delete cohort with enrolled students" });
      return;
    }

    // Delete auto-generated sessions first
    await db
      .delete(programmeSessionsTable)
      // @ts-ignore -- Drizzle and() overload
      .where(and(eq(programmeSessionsTable.cohortId, id), eq(programmeSessionsTable.tenantId, tenantId)));

    await db
      .delete(programmeCohortsTable)
      // @ts-ignore -- Drizzle and() overload
      .where(and(eq(programmeCohortsTable.id, id), eq(programmeCohortsTable.tenantId, tenantId)));

    res.status(204).send();
  } catch (err) {
    console.error("[lms/cohorts/:id DELETE]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
