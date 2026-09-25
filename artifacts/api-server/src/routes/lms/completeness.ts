import { Router } from "express";
import { db, studentsTable, programmeCohortsTable, programmeSessionsTable, sessionAttendanceTable, lmsTalentScoresTable, lmsChosenTalentsTable, lmsCoachNarrativesTable, lmsTeacherFeedbackTable, lmsStudentSurveysTable, lmsParentSurveysTable, lmsAiSummariesTable, lmsTripDataTable, lmsCohortNarrativesTable } from "@workspace/db";
import { eq, and, count, sql } from "drizzle-orm";
import { authMiddleware, requireRole } from "../../lib/auth";

const router = Router();

// GET /api/lms/cohorts/:cohortId/completeness
router.get("/cohorts/:cohortId/completeness", authMiddleware, requireRole("MANAGER", "ADMIN", "SUPER_ADMIN"), async (req, res): Promise<void> => {
  try {
    const user = req.user!;
    const tenantId = user.tenantId!;
    const { cohortId } = req.params;

    const [cohort] = await db
      .select({
        id: programmeCohortsTable.id,
        programmeManagerId: programmeCohortsTable.programmeManagerId,
        leadTeacherName: programmeCohortsTable.leadTeacherName,
        minAttendanceSessions: programmeCohortsTable.minAttendanceSessions,
      })
      .from(programmeCohortsTable)
      // @ts-expect-error Drizzle and() typing
      .where(and(eq(programmeCohortsTable.id, cohortId), eq(programmeCohortsTable.tenantId, tenantId)));

    if (!cohort) { res.status(404).json({ error: "Cohort not found" }); return; }
    if (user.role === "MANAGER" && cohort.programmeManagerId !== user.id) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    const minAttendance = cohort.minAttendanceSessions ?? 6;

    // Load all data in parallel
    const [students, sessions, allAttendance, allScores, allChosenTalents, allNarratives, allTeacherFeedback, allSurveys, allParentSurveys, allAiSummaries, tripDataRows, cohortNarrativeRows] = await Promise.all([
      db.select({ id: studentsTable.id, firstName: studentsTable.firstName, lastName: studentsTable.lastName, completionStatus: studentsTable.completionStatus, metadata: studentsTable.metadata }).from(studentsTable)// @ts-expect-error Drizzle and() typing
.where(and(eq(studentsTable.cohortId, cohortId), eq(studentsTable.tenantId, tenantId))),
      db.select().from(programmeSessionsTable)// @ts-expect-error Drizzle and() typing
.where(and(eq(programmeSessionsTable.cohortId, cohortId), eq(programmeSessionsTable.tenantId, tenantId))),
      db.select().from(sessionAttendanceTable).where(eq(sessionAttendanceTable.tenantId, tenantId)),
      db.select().from(lmsTalentScoresTable).where(eq(lmsTalentScoresTable.tenantId, tenantId)),
      db.select().from(lmsChosenTalentsTable).where(eq(lmsChosenTalentsTable.tenantId, tenantId)),
      db.select().from(lmsCoachNarrativesTable).where(eq(lmsCoachNarrativesTable.tenantId, tenantId)),
      db.select().from(lmsTeacherFeedbackTable).where(eq(lmsTeacherFeedbackTable.tenantId, tenantId)),
      db.select().from(lmsStudentSurveysTable).where(eq(lmsStudentSurveysTable.tenantId, tenantId)),
      db.select().from(lmsParentSurveysTable).where(eq(lmsParentSurveysTable.tenantId, tenantId)),
      db.select().from(lmsAiSummariesTable)// @ts-expect-error Drizzle and() typing
.where(and(eq(lmsAiSummariesTable.cohortId, cohortId), eq(lmsAiSummariesTable.tenantId, tenantId))),
      db.select().from(lmsTripDataTable)// @ts-expect-error Drizzle and() typing
.where(and(eq(lmsTripDataTable.cohortId, cohortId), eq(lmsTripDataTable.tenantId, tenantId))),
      db.select().from(lmsCohortNarrativesTable)// @ts-expect-error Drizzle and() typing
.where(and(eq(lmsCohortNarrativesTable.cohortId, cohortId), eq(lmsCohortNarrativesTable.tenantId, tenantId))),
    ]);

    const studentIds = students.map((s) => s.id);

    // Cohort-level blocking items
    const itwTrip = tripDataRows.find((t) => t.tripType === "itw");
    const wowTrip = tripDataRows.find((t) => t.tripType === "wow");
    const cohortNarrative = cohortNarrativeRows[0] ?? null;
    const narrativeFields = ["programmeStrengths", "programmeChallenges", "overallAssessment", "conclusionNarrative"];
    const narrativeFilled = cohortNarrative ? narrativeFields.filter((f) => !!(cohortNarrative as any)[f]) : [];
    const narrativeMissing = narrativeFields.filter((f) => !cohortNarrative || !(cohortNarrative as any)[f]);

    const cohortBlockingItems = {
      leadTeacherNamed: !!cohort.leadTeacherName,
      tripData: { itw: !!itwTrip?.isComplete, wow: !!wowTrip?.isComplete },
      cohortNarratives: {
        complete: narrativeFilled.length,
        total: narrativeFields.length,
        missing: narrativeMissing,
      },
    };

    // Per-student completeness
    const studentResults = students.map((student) => {
      const studentAttendance = allAttendance.filter((a) => a.studentId === student.id);
      const attendedCount = studentAttendance.filter((a) => a.attended).length;

      // Check attendance overrides stored in student metadata
      const meta = (student.metadata as any) ?? {};
      const overrides: any[] = meta.attendanceOverrides ?? [];
      const latestOverride = overrides.length > 0 ? overrides[overrides.length - 1] : null;
      let meetsThreshold = attendedCount >= minAttendance;
      if (latestOverride?.overrideType === "include_despite_low_attendance") meetsThreshold = true;
      if (latestOverride?.overrideType === "exclude_despite_sufficient_attendance") meetsThreshold = false;

      const scores = allScores.filter((s) => s.studentId === student.id);
      const coachScorePre = scores.find((s) => s.raterType === "coach" && s.timePoint === "pre");
      const coachScoreEnd = scores.find((s) => s.raterType === "coach" && s.timePoint === "end");
      const studentScorePre = scores.find((s) => s.raterType === "student" && s.timePoint === "pre");
      const studentScoreEnd = scores.find((s) => s.raterType === "student" && s.timePoint === "end");
      const teacherScorePre = scores.find((s) => s.raterType === "teacher" && s.timePoint === "pre");
      const teacherScoreEnd = scores.find((s) => s.raterType === "teacher" && s.timePoint === "end");

      const chosenTalents = allChosenTalents.find((c) => c.studentId === student.id);
      const narrative = allNarratives.find((n) => n.studentId === student.id);
      const narrativeFieldList = ["overallEngagement", "itwReflection", "wowReflection", "talentProgressSummary", "overallProgressSummary", "nextSteps", "attendanceComment"];
      const narrativeFilledCount = narrative ? narrativeFieldList.filter((f) => !!(narrative as any)[f]).length : 0;
      const narrativeMissingList = narrativeFieldList.filter((f) => !narrative || !(narrative as any)[f]);

      const tf = allTeacherFeedback.find((t) => t.studentId === student.id);
      const surveyPre = allSurveys.find((s) => s.studentId === student.id && s.timePoint === "pre");
      const surveyEnd = allSurveys.find((s) => s.studentId === student.id && s.timePoint === "end");
      const parentSurvey = allParentSurveys.find((p) => p.studentId === student.id);

      const aiSummaryVoice = allAiSummaries.find((a) => a.studentId === student.id && a.summaryType === "student_voice_per_student");
      const aiSummaryTeacher = allAiSummaries.find((a) => a.studentId === student.id && a.summaryType === "teacher_reflection_per_student");

      // Blocking for school report (teacher feedback and parent survey are optional in v1)
      const blockingComplete =
        meetsThreshold &&
        !!coachScorePre?.isComplete &&
        !!coachScoreEnd?.isComplete &&
        !!chosenTalents &&
        !!narrative?.isComplete &&
        !!surveyEnd;

      const status = student.completionStatus === "WITHDRAWN"
        ? "excluded"
        : blockingComplete ? "ready" : "incomplete";

      return {
        studentId: student.id,
        name: `${student.firstName} ${student.lastName}`,
        status,
        attendance: { attended: attendedCount, total: sessions.length, meetsThreshold },
        coachScores: { pre: !!coachScorePre?.isComplete, end: !!coachScoreEnd?.isComplete },
        studentScores: { pre: !!studentScorePre?.isComplete, end: !!studentScoreEnd?.isComplete, channel: surveyEnd?.submissionChannel ?? null },
        teacherScores: { pre: !!teacherScorePre?.isComplete, end: !!teacherScoreEnd?.isComplete },
        chosenTalents: !!chosenTalents,
        narratives: { complete: narrativeFilledCount, total: narrativeFieldList.length, missing: narrativeMissingList },
        teacherFeedback: { submitted: !!tf?.isComplete, blocking: false },
        studentSurvey: { pre: !!surveyPre, end: !!surveyEnd },
        parentSurvey: { submitted: !!parentSurvey, blocking: false },
        aiSummaries: {
          studentVoice: aiSummaryVoice ? (aiSummaryVoice.failed ? "failed" : "generated") : "pending",
          teacherReflection: aiSummaryTeacher ? (aiSummaryTeacher.failed ? "failed" : "generated") : "pending",
        },
      };
    });

    const readyStudents = studentResults.filter((s) => s.status === "ready").length;
    const incompleteStudents = studentResults.filter((s) => s.status === "incomplete").length;
    const excludedStudents = studentResults.filter((s) => s.status === "excluded").length;

    res.json({
      cohortId,
      totalStudents: students.length,
      readyStudents,
      incompleteStudents,
      excludedStudents,
      cohortBlockingItems,
      students: studentResults,
    });
  } catch (err) {
    console.error("[lms/cohorts/:cohortId/completeness GET]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
