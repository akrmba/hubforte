/**
 * LMS Impact Calculation Engine (Task 6.1)
 *
 * Calculates per-student and cohort-level impact metrics from raw LMS data.
 * Stores results as a snapshot in lms_impact_snapshots.
 */

import { db, lmsImpactSnapshotsTable, lmsTalentScoresTable, lmsChosenTalentsTable, lmsCoachNarrativesTable, lmsTeacherFeedbackTable, lmsStudentSurveysTable, lmsParentSurveysTable, lmsAiSummariesTable, lmsTripDataTable, lmsCohortNarrativesTable, studentsTable, programmeCohortsTable, programmeSessionsTable, sessionAttendanceTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { generateId } from "../id";

export interface TalentScores {
  confidence: number | null;
  resilience: number | null;
  communication: number | null;
  selfAwareness: number | null;
}

export interface StudentImpact {
  studentId: string;
  name: string;
  yearGroup: string | null;
  gender: string | null;
  eligible: boolean;
  excludedReason: string | null;
  attendance: { attended: number; total: number; pct: number };
  coachScores: { pre: TalentScores; end: TalentScores; improvement: TalentScores };
  studentScores: { pre: TalentScores; end: TalentScores; improvement: TalentScores };
  teacherScores: { pre: TalentScores; end: TalentScores; improvement: TalentScores };
  triangulated: { pre: TalentScores; end: TalentScores; improvement: TalentScores };
  chosenTalents: string[];
  aiSummaries: { studentVoice: string | null; teacherReflection: string | null };
}

export interface CohortImpact {
  cohortId: string;
  cohortName: string;
  programmeType: string | null;
  leadTeacherName: string | null;
  totalStudents: number;
  eligibleStudents: number;
  excludedStudents: number;
  averageAttendancePct: number;
  cohortAverageScores: {
    pre: TalentScores;
    end: TalentScores;
    improvement: TalentScores;
  };
  demographics: {
    byGender: Record<string, { count: number; avgImprovement: TalentScores }>;
    byYearGroup: Record<string, { count: number; avgImprovement: TalentScores }>;
  };
  aiSummaries: {
    cohortStudentVoice: string | null;
    cohortCoachSummary: string | null;
    cohortTeacherSummary: string | null;
  };
  students: StudentImpact[];
}

const WEIGHTS = { coach: 0.4, student: 0.3, teacher: 0.3 };
const TALENT_FIELDS = ["confidence", "resilience", "communication", "selfAwareness"] as const;

function avg(vals: (number | null)[]): number | null {
  const nums = vals.filter((v): v is number => v !== null);
  return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

function improvement(pre: TalentScores, end: TalentScores): TalentScores {
  return {
    confidence: pre.confidence !== null && end.confidence !== null ? end.confidence - pre.confidence : null,
    resilience: pre.resilience !== null && end.resilience !== null ? end.resilience - pre.resilience : null,
    communication: pre.communication !== null && end.communication !== null ? end.communication - pre.communication : null,
    selfAwareness: pre.selfAwareness !== null && end.selfAwareness !== null ? end.selfAwareness - pre.selfAwareness : null,
  };
}

function triangulate(coach: TalentScores, student: TalentScores, teacher: TalentScores): TalentScores {
  const result: TalentScores = { confidence: null, resilience: null, communication: null, selfAwareness: null };
  for (const f of TALENT_FIELDS) {
    const vals: { v: number; w: number }[] = [];
    if (coach[f] !== null) vals.push({ v: coach[f]!, w: WEIGHTS.coach });
    if (student[f] !== null) vals.push({ v: student[f]!, w: WEIGHTS.student });
    if (teacher[f] !== null) vals.push({ v: teacher[f]!, w: WEIGHTS.teacher });
    if (vals.length > 0) {
      const totalW = vals.reduce((a, b) => a + b.w, 0);
      result[f] = vals.reduce((a, b) => a + b.v * b.w, 0) / totalW;
    }
  }
  return result;
}

function avgTalents(scores: TalentScores[]): TalentScores {
  return {
    confidence: avg(scores.map((s) => s.confidence)),
    resilience: avg(scores.map((s) => s.resilience)),
    communication: avg(scores.map((s) => s.communication)),
    selfAwareness: avg(scores.map((s) => s.selfAwareness)),
  };
}

function emptyScores(): TalentScores {
  return { confidence: null, resilience: null, communication: null, selfAwareness: null };
}

export async function calculateCohortImpact(
  cohortId: string,
  tenantId: string,
  calculatedBy: string,
): Promise<{ snapshot: typeof lmsImpactSnapshotsTable.$inferSelect; impact: CohortImpact }> {
  // Load all data in parallel
  const [cohort, students, sessions, allAttendance, allScores, allChosenTalents, allNarratives, allTeacherFeedback, allAiSummaries, cohortAiSummaries] = await Promise.all([
    db.select({
      id: programmeCohortsTable.id,
      cohortName: programmeCohortsTable.cohortName,
      programmeType: programmeCohortsTable.programmeType,
      leadTeacherName: programmeCohortsTable.leadTeacherName,
      minAttendanceSessions: programmeCohortsTable.minAttendanceSessions,
    }).from(programmeCohortsTable)
      // @ts-ignore
      .where(and(eq(programmeCohortsTable.id, cohortId), eq(programmeCohortsTable.tenantId, tenantId)))
      .then((r) => r[0] ?? null),
    db.select({ id: studentsTable.id, firstName: studentsTable.firstName, lastName: studentsTable.lastName, yearGroup: studentsTable.yearGroup, gender: studentsTable.gender, completionStatus: studentsTable.completionStatus, metadata: studentsTable.metadata })
      .from(studentsTable)
      // @ts-ignore
      .where(and(eq(studentsTable.cohortId, cohortId), eq(studentsTable.tenantId, tenantId))),
    db.select().from(programmeSessionsTable)
      // @ts-ignore
      .where(and(eq(programmeSessionsTable.cohortId, cohortId), eq(programmeSessionsTable.tenantId, tenantId))),
    db.select().from(sessionAttendanceTable).where(eq(sessionAttendanceTable.tenantId, tenantId)),
    db.select().from(lmsTalentScoresTable).where(eq(lmsTalentScoresTable.tenantId, tenantId)),
    db.select().from(lmsChosenTalentsTable).where(eq(lmsChosenTalentsTable.tenantId, tenantId)),
    db.select().from(lmsCoachNarrativesTable).where(eq(lmsCoachNarrativesTable.tenantId, tenantId)),
    db.select().from(lmsTeacherFeedbackTable).where(eq(lmsTeacherFeedbackTable.tenantId, tenantId)),
    db.select().from(lmsAiSummariesTable)
      // @ts-ignore
      .where(and(eq(lmsAiSummariesTable.cohortId, cohortId), eq(lmsAiSummariesTable.tenantId, tenantId))),
    db.select().from(lmsAiSummariesTable)
      // @ts-ignore
      .where(and(eq(lmsAiSummariesTable.cohortId, cohortId), eq(lmsAiSummariesTable.tenantId, tenantId))),
  ]);

  if (!cohort) throw new Error(`Cohort ${cohortId} not found`);

  const minAttendance = cohort.minAttendanceSessions ?? 6;

  const studentImpacts: StudentImpact[] = students.map((student) => {
    const meta = (student.metadata as any) ?? {};
    const overrides: any[] = meta.attendanceOverrides ?? [];
    const latestOverride = overrides[overrides.length - 1] ?? null;

    const studentAttendance = allAttendance.filter((a) => a.studentId === student.id);
    const attendedCount = studentAttendance.filter((a) => a.attended).length;
    let meetsThreshold = attendedCount >= minAttendance;
    if (latestOverride?.overrideType === "include_despite_low_attendance") meetsThreshold = true;
    if (latestOverride?.overrideType === "exclude_despite_sufficient_attendance") meetsThreshold = false;

    const isWithdrawn = student.completionStatus === "WITHDRAWN";
    const eligible = !isWithdrawn && meetsThreshold;
    const excludedReason = isWithdrawn ? "withdrawn" : !meetsThreshold ? "low_attendance" : null;

    const scores = allScores.filter((s) => s.studentId === student.id);
    const getScore = (rater: string, tp: string): TalentScores => {
      const s = scores.find((x) => x.raterType === rater && x.timePoint === tp);
      return s ? { confidence: s.confidence, resilience: s.resilience, communication: s.communication, selfAwareness: s.selfAwareness } : emptyScores();
    };

    const coachPre = getScore("coach", "pre");
    const coachEnd = getScore("coach", "end");
    const studentPre = getScore("student", "pre");
    const studentEnd = getScore("student", "end");
    const teacherPre = getScore("teacher", "pre");
    const teacherEnd = getScore("teacher", "end");

    const triPre = triangulate(coachPre, studentPre, teacherPre);
    const triEnd = triangulate(coachEnd, studentEnd, teacherEnd);

    const chosenTalentsRow = allChosenTalents.find((c) => c.studentId === student.id);
    const chosenTalents: string[] = chosenTalentsRow ? ((chosenTalentsRow as any).talents ?? []) : [];

    const aiVoice = allAiSummaries.find((a) => a.studentId === student.id && a.summaryType === "student_voice_per_student");
    const aiTeacher = allAiSummaries.find((a) => a.studentId === student.id && a.summaryType === "teacher_reflection_per_student");

    return {
      studentId: student.id,
      name: `${student.firstName} ${student.lastName}`,
      yearGroup: (student as any).yearGroup ?? null,
      gender: (student as any).gender ?? null,
      eligible,
      excludedReason,
      attendance: { attended: attendedCount, total: sessions.length, pct: sessions.length > 0 ? (attendedCount / sessions.length) * 100 : 0 },
      coachScores: { pre: coachPre, end: coachEnd, improvement: improvement(coachPre, coachEnd) },
      studentScores: { pre: studentPre, end: studentEnd, improvement: improvement(studentPre, studentEnd) },
      teacherScores: { pre: teacherPre, end: teacherEnd, improvement: improvement(teacherPre, teacherEnd) },
      triangulated: { pre: triPre, end: triEnd, improvement: improvement(triPre, triEnd) },
      chosenTalents,
      aiSummaries: {
        studentVoice: aiVoice?.editedText ?? aiVoice?.generatedText ?? null,
        teacherReflection: aiTeacher?.editedText ?? aiTeacher?.generatedText ?? null,
      },
    };
  });

  const eligible = studentImpacts.filter((s) => s.eligible);

  // Cohort averages (eligible students only)
  const cohortAvgPre = avgTalents(eligible.map((s) => s.triangulated.pre));
  const cohortAvgEnd = avgTalents(eligible.map((s) => s.triangulated.end));
  const cohortAvgImprovement = improvement(cohortAvgPre, cohortAvgEnd);

  // Demographics
  const byGender: Record<string, StudentImpact[]> = {};
  const byYearGroup: Record<string, StudentImpact[]> = {};
  for (const s of eligible) {
    const g = s.gender ?? "unknown";
    const y = s.yearGroup ?? "unknown";
    (byGender[g] ??= []).push(s);
    (byYearGroup[y] ??= []).push(s);
  }

  const demoGroup = (groups: Record<string, StudentImpact[]>) =>
    Object.fromEntries(Object.entries(groups).map(([k, arr]) => [k, {
      count: arr.length,
      avgImprovement: avgTalents(arr.map((s) => s.triangulated.improvement)),
    }]));

  // Cohort-level AI summaries
  const cohortStudentVoice = cohortAiSummaries.find((a) => !a.studentId && a.summaryType === "cohort_student_voice");
  const cohortCoachSummary = cohortAiSummaries.find((a) => !a.studentId && a.summaryType === "cohort_coach_summary");
  const cohortTeacherSummary = cohortAiSummaries.find((a) => !a.studentId && a.summaryType === "cohort_teacher_summary");

  const impact: CohortImpact = {
    cohortId,
    cohortName: cohort.cohortName,
    programmeType: cohort.programmeType ?? null,
    leadTeacherName: cohort.leadTeacherName ?? null,
    totalStudents: students.length,
    eligibleStudents: eligible.length,
    excludedStudents: students.length - eligible.length,
    averageAttendancePct: eligible.length > 0 ? avg(eligible.map((s) => s.attendance.pct)) ?? 0 : 0,
    cohortAverageScores: { pre: cohortAvgPre, end: cohortAvgEnd, improvement: cohortAvgImprovement },
    demographics: { byGender: demoGroup(byGender), byYearGroup: demoGroup(byYearGroup) },
    aiSummaries: {
      cohortStudentVoice: cohortStudentVoice?.editedText ?? cohortStudentVoice?.generatedText ?? null,
      cohortCoachSummary: cohortCoachSummary?.editedText ?? cohortCoachSummary?.generatedText ?? null,
      cohortTeacherSummary: cohortTeacherSummary?.editedText ?? cohortTeacherSummary?.generatedText ?? null,
    },
    students: studentImpacts,
  };

  // Atomically determine version, clear old isLatest, and insert new snapshot
  const [snapshot] = await db.transaction(async (tx) => {
    const existing = await tx.select({ snapshotVersion: lmsImpactSnapshotsTable.snapshotVersion })
      .from(lmsImpactSnapshotsTable)
      // @ts-ignore
      .where(and(eq(lmsImpactSnapshotsTable.cohortId, cohortId), eq(lmsImpactSnapshotsTable.tenantId, tenantId)));
    const nextVersion = existing.length > 0 ? Math.max(...existing.map((e) => e.snapshotVersion)) + 1 : 1;

    if (existing.length > 0) {
      await tx.update(lmsImpactSnapshotsTable)
        .set({ isLatest: false })
        // @ts-ignore
        .where(and(eq(lmsImpactSnapshotsTable.cohortId, cohortId), eq(lmsImpactSnapshotsTable.tenantId, tenantId)));
    }
    return tx.insert(lmsImpactSnapshotsTable).values({
      id: generateId("snap"),
      tenantId,
      cohortId,
      snapshotVersion: nextVersion,
      calculatedBy,
      resultsJson: impact as any,
      weightsJson: WEIGHTS as any,
      isLatest: true,
    }).returning();
  });

  return { snapshot, impact };
}
