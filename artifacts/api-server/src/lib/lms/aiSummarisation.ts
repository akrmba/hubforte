/**
 * LMS AI Summarisation (Task 6.3)
 *
 * Generates per-student and cohort-level AI summaries using the existing
 * chatCompletion provider. Stores results in lms_ai_summaries.
 */

import { db, lmsAiSummariesTable, lmsCoachNarrativesTable, lmsTeacherFeedbackTable, lmsStudentSurveysTable, lmsTalentScoresTable, studentsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { chatCompletion } from "../aiProvider";
import { generateId } from "../id";
import { logger } from "../logger";
import type { CohortImpact, StudentImpact } from "./impactEngine";

type SummaryType =
  | "student_voice_per_student"
  | "teacher_reflection_per_student"
  | "cohort_student_voice"
  | "cohort_coach_summary"
  | "cohort_teacher_summary";

async function upsertSummary({
  tenantId,
  cohortId,
  studentId,
  summaryType,
  generatedText,
  aiProvider,
  promptTokens,
  completionTokens,
  failed,
  failureReason,
}: {
  tenantId: string;
  cohortId: string;
  studentId: string | null;
  summaryType: SummaryType;
  generatedText?: string;
  aiProvider?: string;
  promptTokens?: number;
  completionTokens?: number;
  failed: boolean;
  failureReason?: string;
}) {
  // Check for existing
  const existing = await db.select({ id: lmsAiSummariesTable.id })
    .from(lmsAiSummariesTable)
    // @ts-ignore
    .where(and(
      eq(lmsAiSummariesTable.cohortId, cohortId),
      eq(lmsAiSummariesTable.summaryType, summaryType),
      studentId ? eq(lmsAiSummariesTable.studentId, studentId) : eq(lmsAiSummariesTable.studentId, null as any),
      eq(lmsAiSummariesTable.tenantId, tenantId),
    ));

  if (existing.length > 0) {
    await db.update(lmsAiSummariesTable)
      .set({ generatedText, aiProvider, promptTokens, completionTokens, failed, failureReason: failureReason ?? null, wasEdited: false })
      // @ts-ignore
      .where(eq(lmsAiSummariesTable.id, existing[0].id));
    return existing[0].id;
  }

  const id = generateId("aisum");
  await db.insert(lmsAiSummariesTable).values({
    id,
    tenantId,
    cohortId,
    studentId,
    summaryType,
    generatedText,
    wasEdited: false,
    isManual: false,
    aiProvider,
    promptTokens,
    completionTokens,
    failed,
    failureReason: failureReason ?? null,
  });
  return id;
}

export async function generateStudentVoiceSummary(
  tenantId: string,
  cohortId: string,
  student: StudentImpact,
): Promise<void> {
  const prompt = `You are writing a warm, encouraging student voice summary for a young person's impact report.

Student: ${student.name}
Attendance: ${student.attendance.attended} of ${student.attendance.total} sessions (${Math.round(student.attendance.pct)}%)
Chosen talents: ${student.chosenTalents.join(", ") || "not recorded"}
Score improvement (triangulated):
  Confidence: ${student.triangulated.improvement.confidence?.toFixed(1) ?? "n/a"}
  Resilience: ${student.triangulated.improvement.resilience?.toFixed(1) ?? "n/a"}
  Communication: ${student.triangulated.improvement.communication?.toFixed(1) ?? "n/a"}
  Self-awareness: ${student.triangulated.improvement.selfAwareness?.toFixed(1) ?? "n/a"}

Write 2-3 sentences celebrating this student's journey and growth. Use "you" to address the student directly. Be specific about their talents and improvements. Keep it warm and personal.`;

  try {
    const result = await chatCompletion({ prompt });
    await upsertSummary({
      tenantId, cohortId, studentId: student.studentId,
      summaryType: "student_voice_per_student",
      generatedText: result.content,
      aiProvider: result.provider,
      promptTokens: result.inputTokens,
      completionTokens: result.outputTokens,
      failed: false,
    });
  } catch (err: any) {
    logger.error({ err, studentId: student.studentId }, "Failed to generate student voice summary");
    await upsertSummary({
      tenantId, cohortId, studentId: student.studentId,
      summaryType: "student_voice_per_student",
      failed: true, failureReason: err.message,
    });
  }
}

export async function generateTeacherReflectionSummary(
  tenantId: string,
  cohortId: string,
  student: StudentImpact,
  teacherFeedback: { aspirationChange: boolean; attendanceChange: boolean; behaviourChange: boolean; academicProgressChange: boolean; freeTextReflection: string | null } | null,
): Promise<void> {
  if (!teacherFeedback) {
    await upsertSummary({
      tenantId, cohortId, studentId: student.studentId,
      summaryType: "teacher_reflection_per_student",
      generatedText: "No teacher data collected.",
      failed: false,
    });
    return;
  }

  const changes = [
    teacherFeedback.aspirationChange && "aspirations",
    teacherFeedback.attendanceChange && "attendance",
    teacherFeedback.behaviourChange && "behaviour",
    teacherFeedback.academicProgressChange && "academic progress",
  ].filter(Boolean).join(", ");

  const prompt = `You are writing a professional teacher reflection sentence for a student impact report.

Student: ${student.name}
Teacher observed positive changes in: ${changes || "no specific areas noted"}
Teacher's free text: ${teacherFeedback.freeTextReflection || "none provided"}

Write 1-2 sentences summarising the teacher's perspective on this student's development. Be professional and specific. If no changes were noted, write a neutral, supportive sentence.`;

  try {
    const result = await chatCompletion({ prompt });
    await upsertSummary({
      tenantId, cohortId, studentId: student.studentId,
      summaryType: "teacher_reflection_per_student",
      generatedText: result.content,
      aiProvider: result.provider,
      promptTokens: result.inputTokens,
      completionTokens: result.outputTokens,
      failed: false,
    });
  } catch (err: any) {
    logger.error({ err, studentId: student.studentId }, "Failed to generate teacher reflection summary");
    await upsertSummary({
      tenantId, cohortId, studentId: student.studentId,
      summaryType: "teacher_reflection_per_student",
      failed: true, failureReason: err.message,
    });
  }
}

export async function generateCohortSummaries(
  tenantId: string,
  impact: CohortImpact,
): Promise<void> {
  const { cohortId, cohortName, eligibleStudents, cohortAverageScores } = impact;

  const impStr = (v: number | null) => v !== null ? (v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1)) : "n/a";

  const cohortContext = `Cohort: ${cohortName}
Eligible students: ${eligibleStudents}
Average score improvements (triangulated):
  Confidence: ${impStr(cohortAverageScores.improvement.confidence)}
  Resilience: ${impStr(cohortAverageScores.improvement.resilience)}
  Communication: ${impStr(cohortAverageScores.improvement.communication)}
  Self-awareness: ${impStr(cohortAverageScores.improvement.selfAwareness)}`;

  const summaries: Array<{ type: SummaryType; prompt: string }> = [
    {
      type: "cohort_student_voice",
      prompt: `${cohortContext}\n\nWrite a 3-4 sentence cohort student voice summary celebrating the collective journey of this group of young people. Address them as "you" collectively. Be warm, celebratory, and specific about the growth shown.`,
    },
    {
      type: "cohort_coach_summary",
      prompt: `${cohortContext}\n\nWrite a 3-4 sentence coach summary for this cohort's impact report. Write in third person about the cohort. Focus on the coaching journey, the growth observed, and the programme's impact. Professional and reflective tone.`,
    },
    {
      type: "cohort_teacher_summary",
      prompt: `${cohortContext}\n\nWrite a 2-3 sentence teacher perspective summary for this cohort's impact report. Write in third person. Focus on what teachers observed about the students' development during the programme. Professional tone.`,
    },
  ];

  await Promise.all(summaries.map(async ({ type, prompt }) => {
    try {
      const result = await chatCompletion({ prompt });
      await upsertSummary({
        tenantId, cohortId, studentId: null,
        summaryType: type,
        generatedText: result.content,
        aiProvider: result.provider,
        promptTokens: result.inputTokens,
        completionTokens: result.outputTokens,
        failed: false,
      });
    } catch (err: any) {
      logger.error({ err, summaryType: type }, "Failed to generate cohort summary");
      await upsertSummary({
        tenantId, cohortId, studentId: null,
        summaryType: type,
        failed: true, failureReason: err.message,
      });
    }
  }));
}

export async function generateAllSummariesForCohort(
  tenantId: string,
  cohortId: string,
  impact: CohortImpact,
): Promise<void> {
  // Load teacher feedback for all students
  const allTf = await db.select().from(lmsTeacherFeedbackTable)
    // @ts-ignore
    .where(and(eq(lmsTeacherFeedbackTable.tenantId, tenantId)));

  const tfMap = new Map(allTf.map((t) => [t.studentId, t]));

  // Per-student summaries (sequential to avoid rate limits)
  for (const student of impact.students) {
    if (!student.eligible) continue;
    const tf = tfMap.get(student.studentId) ?? null;
    await generateStudentVoiceSummary(tenantId, cohortId, student);
    await generateTeacherReflectionSummary(tenantId, cohortId, student, tf ? {
      aspirationChange: !!(tf as any).aspirationChange,
      attendanceChange: !!(tf as any).attendanceChange,
      behaviourChange: !!(tf as any).behaviourChange,
      academicProgressChange: !!(tf as any).academicProgressChange,
      freeTextReflection: (tf as any).freeTextReflection ?? null,
    } : null);
  }

  // Cohort-level summaries
  await generateCohortSummaries(tenantId, impact);
}
