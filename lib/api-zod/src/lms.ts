/**
 * LMS Zod validation schemas
 * Hand-written (not orval-generated). Covers all LMS data entry inputs for Round 01.
 */
import { z } from "zod";

// ─── Cohort ──────────────────────────────────────────────────────────────────

export const createCohortSchema = z.object({
  programmeId: z.string().min(1),
  cohortName: z.string().min(1).max(200),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  capacity: z.number().int().positive().optional(),
  programmeType: z.enum(["rising_futures", "finding_futures", "launching_futures"]).optional(),
  programmeManagerId: z.string().optional(),
  leadTeacherName: z.string().optional(),
  minAttendanceSessions: z.number().int().min(1).max(20).default(6),
  lmsLifecycleStatus: z.enum(["setup", "data_collection", "report_generation", "complete"]).optional(),
  notes: z.string().optional(),
});

export type CreateCohortInput = z.infer<typeof createCohortSchema>;

// ─── Student ─────────────────────────────────────────────────────────────────

export const createStudentSchema = z.object({
  organizationId: z.string().min(1),
  programmeId: z.string().optional(),
  cohortId: z.string().optional(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  yearGroup: z.string().optional(),
  age: z.number().int().min(0).max(25).optional(),
  gender: z.string().optional(),
  // Need indicators
  pupilPremiumFlag: z.boolean().default(false),
  ealFlag: z.boolean().default(false),
  senStage: z.enum(["NONE", "SEN_SUPPORT", "EHCP"]).optional(),
  lookedAfterFlag: z.boolean().default(false),
  careExperiencedFlag: z.boolean().default(false),
  // LMS fields
  coachId: z.string().optional(),
  consentStatus: z.enum(["OBTAINED", "PENDING", "WITHDRAWN", "NOT_REQUIRED"]).default("PENDING"),
  notes: z.string().optional(),
});

export type CreateStudentInput = z.infer<typeof createStudentSchema>;

// ─── Student Import ───────────────────────────────────────────────────────────

export const importStudentRowSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  yearGroup: z.string().optional(),
  gender: z.string().optional(),
  pupilPremiumFlag: z.boolean().default(false),
  ealFlag: z.boolean().default(false),
  senStage: z.enum(["NONE", "SEN_SUPPORT", "EHCP"]).optional(),
  lookedAfterFlag: z.boolean().default(false),
  careExperiencedFlag: z.boolean().default(false),
});

export const importStudentsSchema = z.object({
  cohortId: z.string().min(1),
  columnMapping: z.record(z.string(), z.string()), // CSV header → field name
  rows: z.array(importStudentRowSchema).min(1).max(500),
});

export type ImportStudentsInput = z.infer<typeof importStudentsSchema>;

// ─── Attendance ───────────────────────────────────────────────────────────────

export const attendanceRecordSchema = z.object({
  sessionId: z.string().min(1),
  studentId: z.string().min(1),
  attended: z.boolean(),
  attendanceStatus: z.enum(["PRESENT", "ABSENT", "LATE", "EXCUSED", "WITHDRAWN"]),
  notes: z.string().optional(),
});

export const upsertAttendanceSchema = z.object({
  records: z.array(attendanceRecordSchema).min(1).max(100),
});

export type UpsertAttendanceInput = z.infer<typeof upsertAttendanceSchema>;

// ─── Talent Scores ────────────────────────────────────────────────────────────

const talentScoreValue = z.number().int().min(0).max(4).nullable().optional();

export const upsertScoresSchema = z.object({
  studentId: z.string().min(1),
  raterType: z.enum(["student", "coach", "teacher"]),
  timePoint: z.enum(["pre", "end", "forward_to_future"]),
  confidence: talentScoreValue,
  resilience: talentScoreValue,
  communication: talentScoreValue,
  selfAwareness: talentScoreValue,
});

export type UpsertScoresInput = z.infer<typeof upsertScoresSchema>;

// ─── Coach Narratives ─────────────────────────────────────────────────────────

export const upsertNarrativesSchema = z.object({
  studentId: z.string().min(1),
  overallEngagement: z.enum(["exceptional", "strong", "good", "developing", "limited"]).optional(),
  attendanceComment: z.string().optional(),
  itwReflection: z.string().optional(),
  wowReflection: z.string().optional(),
  talentProgressSummary: z.string().optional(),
  overallProgressSummary: z.string().optional(),
  nextSteps: z.string().optional(),
  isComplete: z.boolean().optional(),
});

export type UpsertNarrativesInput = z.infer<typeof upsertNarrativesSchema>;

// ─── Teacher Feedback ─────────────────────────────────────────────────────────

export const submitTeacherFeedbackSchema = z.object({
  studentId: z.string().min(1),
  aspirationChange: z.boolean().optional(),
  attendanceChange: z.boolean().optional(),
  behaviourChange: z.boolean().optional(),
  academicProgressChange: z.boolean().optional(),
  freeTextReflection: z.string().optional(),
  isComplete: z.boolean().optional(),
});

export type SubmitTeacherFeedbackInput = z.infer<typeof submitTeacherFeedbackSchema>;

// ─── Student Survey ───────────────────────────────────────────────────────────

// "not_sure" replaces "neutral" per plan spec
const likertScale = z.enum(["strongly_agree", "agree", "not_sure", "disagree", "strongly_disagree"]).optional();

export const submitStudentSurveySchema = z.object({
  studentId: z.string().min(1),
  timePoint: z.enum(["pre", "end", "forward_to_future"]),
  enjoyedProgramme: likertScale,
  preparedFuture: likertScale,
  motivatedSchool: likertScale,
  shownSkills: likertScale,
  betterFutureIdeas: likertScale,
  positiveDifference: likertScale,
  threeWords: z.string().max(200).optional(),
  favouriteThing: z.string().optional(),
  whyFavourite: z.string().optional(),
  changeOneThing: z.string().optional(),
  otherComments: z.string().optional(),
  submissionChannel: z.enum(["coach_handover", "qr_code", "url_code", "email_link", "sms_link"]),
});

export type SubmitStudentSurveyInput = z.infer<typeof submitStudentSurveySchema>;

// ─── Parent Survey ────────────────────────────────────────────────────────────

export const submitParentSurveySchema = z.object({
  studentId: z.string().min(1),
  positiveDifferenceChild: likertScale,
  childMorePrepared: likertScale,
  childMoreMotivated: likertScale,
  biggestChanges: z.string().optional(),
  submissionChannel: z.enum(["coach_handover", "qr_code", "url_code", "email_link", "sms_link"]),
});

export type SubmitParentSurveyInput = z.infer<typeof submitParentSurveySchema>;

// ─── Trip Data ────────────────────────────────────────────────────────────────

export const upsertTripDataSchema = z.object({
  cohortId: z.string().min(1),
  tripType: z.enum(["itw", "wow"]),
  venueName: z.string().optional(),
  activityHighlights: z.array(z.string().max(300)).max(5).optional(),
  featuredStudentQuote: z.string().optional(),
  featuredCoachQuote: z.string().optional(),
  isComplete: z.boolean().optional(),
});

export type UpsertTripDataInput = z.infer<typeof upsertTripDataSchema>;

// ─── Cohort Narratives ────────────────────────────────────────────────────────

export const upsertCohortNarrativesSchema = z.object({
  cohortId: z.string().min(1),
  programmeStrengths: z.string().optional(),
  programmeChallenges: z.string().optional(),
  overallAssessment: z.string().optional(),
  conclusionNarrative: z.string().optional(),
  featuredStudentQuote: z.string().optional(),
});

export type UpsertCohortNarrativesInput = z.infer<typeof upsertCohortNarrativesSchema>;

// ─── Forward to the Future ────────────────────────────────────────────────────

export const upsertForwardToFutureSchema = z.object({
  cohortId: z.string().min(1),
  studentId: z.string().min(1),
  programmeType: z.enum(["rising_futures", "finding_futures", "launching_futures"]),
  sessionDate: z.string().optional(), // ISO date string
  responsesJson: z.record(z.string(), z.unknown()), // flexible payload
});

export type UpsertForwardToFutureInput = z.infer<typeof upsertForwardToFutureSchema>;
