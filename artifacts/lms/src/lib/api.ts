const TIMEOUT_MS = 30_000;

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" } : { "X-Requested-With": "XMLHttpRequest" },
      body: body ? JSON.stringify(body) : undefined,
      credentials: "include",
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new ApiError(text, res.status);
    }

    const contentType = res.headers.get("content-type");
    if (contentType?.includes("application/json")) {
      return (await res.json()) as T;
    }
    return undefined as T;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  get: <T>(url: string) => request<T>("GET", url),
  post: <T>(url: string, body?: unknown) => request<T>("POST", url, body),
  put: <T>(url: string, body?: unknown) => request<T>("PUT", url, body),
  delete: <T>(url: string) => request<T>("DELETE", url),
};

// ─── LMS Coach API helpers ──────────────────────────────────────────────────

export interface Student {
  id: string;
  firstName: string;
  lastName: string;
  cohortId: string | null;
  yearGroup: string | null;
  gender: string | null;
  coachId: string | null;
  completionStatus: string | null;
  consentStatus: string | null;
  pupilPremiumFlag: boolean;
  ealFlag: boolean;
  senStage: string | null;
  lookedAfterFlag: boolean;
  careExperiencedFlag: boolean;
  personalAccessCode: string | null;
  withdrawnAtSession: number | null;
  createdAt: string;
}

export interface Cohort {
  id: string;
  cohortName: string;
  programmeId: string;
  programmeType: string;
  programmeManagerId: string;
  leadTeacherName: string | null;
  minAttendanceSessions: number;
  lmsLifecycleStatus: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  capacity: number | null;
  enrolledCount: number;
  createdAt: string;
  studentCount?: number;
}

export interface AttendanceRecord {
  sessionId: string;
  studentId: string;
  attended: boolean;
  attendanceStatus: "PRESENT" | "ABSENT" | "LATE" | "EXCUSED" | "WITHDRAWN";
  notes?: string;
}

export interface TalentScores {
  confidence: number;
  resilience: number;
  communication: number;
  selfAwareness: number;
}

export interface ScoreEntry extends TalentScores {
  raterType: string;
  timePoint: string;
}

export interface ChosenTalents {
  confidence: boolean;
  resilience: boolean;
  communication: boolean;
  selfAwareness: boolean;
}

export interface Narrative {
  studentId: string;
  overallEngagement: "exceptional" | "strong" | "good" | "developing" | "limited" | null;
  attendanceComment: string | null;
  itwReflection: string | null;
  wowReflection: string | null;
  talentProgressSummary: string | null;
  overallProgressSummary: string | null;
  nextSteps: string | null;
  isComplete: boolean;
  lastSavedAt: string | null;
}

export interface CompletenessStudent {
  studentId: string;
  status: "excluded" | "ready" | "incomplete";
  attendance: { attended: number; total: number; meetsThreshold: boolean };
  coachScores: { pre: boolean; end: boolean };
  studentScores: { pre: boolean; end: boolean };
  teacherScores: { pre: boolean; end: boolean };
  chosenTalents: boolean;
  narratives: { complete: number; total: number; isComplete: boolean };
  teacherFeedback: { submitted: boolean; blocking: boolean };
  studentSurvey: { pre: boolean; end: boolean };
  parentSurvey: { submitted: boolean; blocking: boolean };
}

export interface Session {
  id: string;
  sessionNumber: number;
  sessionType: string | null;
  sessionDate: string | null;
  status: string;
}

export interface AttendanceGrid {
  cohortId: string;
  sessions: Session[];
  grid: Array<{
    student: {
      id: string;
      firstName: string;
      lastName: string;
      completionStatus: string | null;
    };
    sessions: Array<{
      sessionId: string;
      sessionNumber: number;
      sessionType: string | null;
      attended: boolean | null;
      attendanceStatus: "PRESENT" | "ABSENT" | "LATE" | "EXCUSED" | "WITHDRAWN" | null;
      notes: string | null;
    }>;
  }>;
}

// Coach-scoped endpoints
export const lmsApi = {
  // My Students (coach-scoped, returns all assigned students across cohorts)
  getMyStudents: () =>
    api.get<Student[]>("/api/lms/students/my-students"),

  // Students by cohort (OPERATOR+ with coach scoping)
  getCohortStudents: (cohortId: string) =>
    api.get<Student[]>(`/api/lms/students/cohorts/${cohortId}/students`),

  getStudent: (id: string) =>
    api.get<Student>(`/api/lms/students/students/${id}`),

  getStudentCompleteness: (id: string) =>
    api.get<CompletenessStudent>(`/api/lms/students/students/${id}/completeness`),

  // Attendance
  getAttendance: (cohortId: string) =>
    api.get<AttendanceGrid>(`/api/lms/cohorts/${cohortId}/attendance`),

  putAttendance: (records: AttendanceRecord[]) =>
    api.put<{ updated: number; ids: string[] }>("/api/lms/attendance", { records }),

  // Scores
  getScores: (studentId: string) =>
    api.get<ScoreEntry[]>(`/api/lms/students/${studentId}/scores`),

  putScores: (studentId: string, entry: ScoreEntry) =>
    api.put(`/api/lms/students/${studentId}/scores`, entry),

  // Chosen Talents
  getChosenTalents: (studentId: string) =>
    api.get<ChosenTalents>(`/api/lms/students/${studentId}/chosen-talents`),

  putChosenTalents: (studentId: string, talents: ChosenTalents) =>
    api.put(`/api/lms/students/${studentId}/chosen-talents`, talents),

  // Narratives
  getNarratives: (studentId: string) =>
    api.get<Narrative>(`/api/lms/students/${studentId}/narratives`),

  putNarratives: (studentId: string, fields: Partial<Narrative>) =>
    api.put(`/api/lms/students/${studentId}/narratives`, fields),

  // Handover
  createHandoverSession: (studentId: string) =>
    api.post<{ inviteToken: string; expiresAt: string }>(
      `/api/lms/students/${studentId}/handover-session`,
    ),

  // Cohorts (coach needs cohort list to find their students)
  getCohorts: () =>
    api.get<Cohort[]>("/api/lms/cohorts"),
};

// ─── PM / Manager API types ─────────────────────────────────────────────────

export interface DashboardCohortCard {
  id: string;
  cohortName: string;
  programmeType: string;
  lmsLifecycleStatus: string;
  status: string;
  leadTeacherName: string | null;
  totalStudents: number;
  activeStudents: number;
  withdrawnStudents: number;
}

export interface DashboardData {
  totalCohorts: number;
  cohorts: DashboardCohortCard[];
}

export interface CohortCompleteness {
  cohortId: string;
  totalStudents: number;
  readyStudents: number;
  incompleteStudents: number;
  excludedStudents: number;
  cohortBlockingItems: {
    leadTeacherNamed: boolean;
    tripData: { itw: boolean; wow: boolean };
    cohortNarratives: { complete: number; total: number; missing: string[] };
  };
  students: Array<CompletenessStudent & { name: string }>;
}

export interface SurveyToken {
  id: string;
  tokenType: string;
  createdAt: string;
  expiresAt: string | null;
  useCount: number;
  maxUses: number | null;
  revokedAt: string | null;
}

export interface TripData {
  tripType: "itw" | "wow";
  venueName: string | null;
  activityHighlights: string[];
  featuredStudentQuote: string | null;
  featuredCoachQuote: string | null;
  isComplete: boolean;
}

export interface CohortNarratives {
  programmeStrengths: string | null;
  programmeChallenges: string | null;
  overallAssessment: string | null;
  conclusionNarrative: string | null;
  featuredStudentQuote: string | null;
}

export interface TeacherLink {
  id: string;
  tokenType: string;
  createdAt: string;
  expiresAt: string | null;
  useCount: number;
  maxUses: number | null;
  revokedAt: string | null;
}

// ─── Teacher portal types ────────────────────────────────────────────────────

export interface TeacherStudent {
  id: string;
  firstName: string;
  lastName: string;
  cohortId: string | null;
  feedbackSubmitted: boolean;
}

export interface TeacherFeedbackEntry {
  studentId: string;
  aspirationChange: boolean | null;
  attendanceChange: boolean | null;
  behaviourChange: boolean | null;
  academicProgressChange: boolean | null;
  freeTextReflection: string | null;
}

// ─── PM API helpers ──────────────────────────────────────────────────────────

export const pmApi = {
  // Dashboard
  getDashboard: () =>
    api.get<DashboardData>("/api/lms/dashboard"),

  // Cohorts — returns { data, pagination }
  getCohorts: () =>
    api.get<{ data: Cohort[]; pagination: { page: number; limit: number } }>("/api/lms/cohorts")
      .then((r) => r.data),

  getCohort: (id: string) =>
    api.get<Cohort>(`/api/lms/cohorts/${id}`),

  createCohort: (data: {
    cohortName: string;
    programmeId: string;
    programmeType: "rising_futures" | "finding_futures" | "launching_futures";
    leadTeacherName?: string;
    minAttendanceSessions?: number;
  }) =>
    api.post<Cohort>("/api/lms/cohorts", data),

  updateCohort: (id: string, data: Partial<Cohort>) =>
    api.put<Cohort>(`/api/lms/cohorts/${id}`, data),

  // Students — returns { data, pagination }
  getCohortStudents: (cohortId: string) =>
    api.get<{ data: Student[]; pagination: { page: number; limit: number } }>(
      `/api/lms/students/cohorts/${cohortId}/students`,
    ).then((r) => r.data),

  createStudent: (cohortId: string, data: Record<string, unknown>) =>
    api.post<Student>(`/api/lms/students/cohorts/${cohortId}/students`, data),

  importStudents: (cohortId: string, rows: Record<string, string>[]) =>
    api.post<{ imported: number; errors: string[] }>(
      `/api/lms/students/cohorts/${cohortId}/import`,
      { rows },
    ),

  // Completeness
  getCohortCompleteness: (cohortId: string) =>
    api.get<CohortCompleteness>(`/api/lms/cohorts/${cohortId}/completeness`),

  // Survey links
  getStudentSurveyLinks: (studentId: string) =>
    api.get<SurveyToken[]>(`/api/lms/students/${studentId}/survey-links`),

  createStudentSurveyLink: (studentId: string, tokenType: "student_survey" | "parent_survey") =>
    api.post<{ token: string; expiresAt: string }>(
      `/api/lms/students/${studentId}/survey-links`,
      { tokenType },
    ),

  // GET /api/lms/cohorts/:cohortId/surveys returns { cohortId, students: [...] }
  getCohortSurveyStatus: (cohortId: string) =>
    api.get<{
      cohortId: string;
      students: Array<{
        studentId: string;
        studentSurvey: { pre: boolean; end: boolean };
        parentSurvey: { submitted: boolean };
      }>;
    }>(`/api/lms/cohorts/${cohortId}/surveys`),

  // Teacher links — token list has no recipientEmail field
  getTeacherLinks: (cohortId: string) =>
    api.get<TeacherLink[]>(`/api/lms/cohorts/${cohortId}/teacher-links`),

  createTeacherLinks: (cohortId: string, recipients: Array<{ email: string; name?: string }>) =>
    api.post<{ created: number }>(`/api/lms/cohorts/${cohortId}/teacher-links`, { recipients }),

  revokeToken: (tokenId: string) =>
    api.delete(`/api/lms/tokens/${tokenId}`),

  // Report content — GET returns { cohortId, itw, wow }
  getTripData: (cohortId: string) =>
    api.get<{ cohortId: string; itw: TripData | null; wow: TripData | null }>(
      `/api/lms/cohorts/${cohortId}/trip-data`,
    ),

  putTripData: (cohortId: string, data: Partial<TripData> & { tripType: "itw" | "wow" }) =>
    api.put(`/api/lms/cohorts/${cohortId}/trip-data`, data),

  getCohortNarratives: (cohortId: string) =>
    api.get<CohortNarratives>(`/api/lms/cohorts/${cohortId}/narratives`),

  putCohortNarratives: (cohortId: string, data: Partial<CohortNarratives>) =>
    api.put(`/api/lms/cohorts/${cohortId}/narratives`, data),
};

// ─── Teacher portal API helpers (session-cookie auth) ───────────────────────

export const teacherApi = {
  // GET /api/lms/public/teacher → { students: TeacherStudent[] }
  getStudents: () =>
    api.get<{ students: TeacherStudent[] }>("/api/lms/public/teacher"),

  // POST /api/lms/public/teacher/submit
  submitFeedback: (data: TeacherFeedbackEntry) =>
    api.post<{ id: string; submitted: boolean }>("/api/lms/public/teacher/submit", data),
};
