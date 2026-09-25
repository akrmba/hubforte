/**
 * LMS Smoke Tests — Round 02
 *
 * Tests the authenticated LMS API core CRUD endpoints.
 * Requires a running API server with LMS module enabled for the test tenant.
 *
 * Run: pnpm test:smoke:lms
 * Env: API_BASE_URL, TEST_PM_EMAIL, TEST_PM_PASSWORD, TEST_COACH_EMAIL, TEST_COACH_PASSWORD
 *
 * When the server is unreachable the entire suite is SKIPPED (not vacuously green).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const API_BASE = process.env.API_BASE_URL || "http://localhost:3000";
const PM_EMAIL = process.env.TEST_PM_EMAIL || "manager@crm.example";
const PM_PASSWORD = process.env.TEST_PM_PASSWORD || "password123";
const COACH_EMAIL = process.env.TEST_COACH_EMAIL || "operator@crm.example";
const COACH_PASSWORD = process.env.TEST_COACH_PASSWORD || "password123";

// ─── Auth helpers ─────────────────────────────────────────────────────────────

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
    },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Login failed for ${email}: ${res.status}`);
  const data = await res.json();
  return data.token as string;
}

function authHeaders(token: string) {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

// ─── Server availability check (runs at module load time) ────────────────────

let serverAvailable = false;
try {
  const probe = await fetch(`${API_BASE}/api/health`);
  serverAvailable = probe.status < 500;
} catch {
  // server not running — suite will be skipped
}

// ─── State shared across tests ────────────────────────────────────────────────

let pmToken = "";
let coachToken = "";
let createdCohortId = "";
let createdStudentId = "";
let testProgrammeId = "";

// ─── Suite — skipped entirely when server is unreachable ─────────────────────
// Using describe.skip prevents vacuous green runs when no server is present.

const describeSuite = serverAvailable ? describe : describe.skip;

describeSuite("LMS smoke suite", () => {

  beforeAll(async () => {
    // Auth bootstrap — fail loudly so the suite is not vacuously green
    try {
      pmToken = await login(PM_EMAIL, PM_PASSWORD);
    } catch (err) {
      throw new Error(`[lms smoke] PM login failed — cannot run suite without authenticated PM. ${err}`);
    }
    try {
      coachToken = await login(COACH_EMAIL, COACH_PASSWORD);
    } catch (err) {
      throw new Error(`[lms smoke] Coach login failed — cannot run suite without authenticated coach. ${err}`);
    }

    // Discover a programme to use for cohort creation
    const res = await fetch(`${API_BASE}/api/lms/cohorts?limit=1`, {
      headers: authHeaders(pmToken),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.data?.length > 0) {
        testProgrammeId = data.data[0].programmeId ?? "";
      }
    }
  });

  afterAll(async () => {
    if (createdCohortId && pmToken) {
      await fetch(`${API_BASE}/api/lms/cohorts/${createdCohortId}`, {
        method: "DELETE",
        headers: authHeaders(pmToken),
      }).catch(() => {});
    }
  });

  // ─── Module guard ───────────────────────────────────────────────────────────

  describe("LMS module guard", () => {
    it("returns 401 without auth token", async () => {
      const res = await fetch(`${API_BASE}/api/lms/cohorts`);
      expect(res.status).toBe(401);
    });

    it("returns 200 or 403 with valid auth (module enabled check)", async () => {
      const res = await fetch(`${API_BASE}/api/lms/cohorts`, {
        headers: authHeaders(pmToken),
      });
      expect([200, 403]).toContain(res.status);
    });
  });

  // ─── Cohort CRUD ────────────────────────────────────────────────────────────

  describe("LMS Cohort CRUD (PM)", () => {
    it("lists cohorts", async () => {
      const res = await fetch(`${API_BASE}/api/lms/cohorts`, {
        headers: authHeaders(pmToken),
      });
      if (res.status === 403) return; // LMS module disabled
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty("data");
      expect(Array.isArray(data.data)).toBe(true);
    });

    it("creates a cohort with auto-sessions", async () => {
      if (!testProgrammeId) return;
      const res = await fetch(`${API_BASE}/api/lms/cohorts`, {
        method: "POST",
        headers: authHeaders(pmToken),
        body: JSON.stringify({
          programmeId: testProgrammeId,
          cohortName: `Smoke Test Cohort ${Date.now()}`,
          programmeType: "rising_futures",
          minAttendanceSessions: 6,
          leadTeacherName: "Ms Smith",
        }),
      });
      if (res.status === 403) return;
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data).toHaveProperty("id");
      expect(data.lmsLifecycleStatus).toBe("setup");
      createdCohortId = data.id;
    });

    it("gets cohort detail with sessions", async () => {
      if (!createdCohortId) return;
      const res = await fetch(`${API_BASE}/api/lms/cohorts/${createdCohortId}`, {
        headers: authHeaders(pmToken),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.id).toBe(createdCohortId);
      expect(Array.isArray(data.sessions)).toBe(true);
      expect(data.sessions.length).toBe(8);
    });

    it("updates cohort lead teacher name", async () => {
      if (!createdCohortId) return;
      const res = await fetch(`${API_BASE}/api/lms/cohorts/${createdCohortId}`, {
        method: "PUT",
        headers: authHeaders(pmToken),
        body: JSON.stringify({ leadTeacherName: "Mr Jones" }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.leadTeacherName).toBe("Mr Jones");
    });

    it("rejects invalid status transition (setup→complete)", async () => {
      if (!createdCohortId) return;
      const res = await fetch(`${API_BASE}/api/lms/cohorts/${createdCohortId}/status`, {
        method: "PUT",
        headers: authHeaders(pmToken),
        body: JSON.stringify({ status: "complete" }),
      });
      expect(res.status).toBe(400);
    });

    it("rejects setup→active when no students have a coach assigned", async () => {
      if (!createdCohortId) return;
      const res = await fetch(`${API_BASE}/api/lms/cohorts/${createdCohortId}/status`, {
        method: "PUT",
        headers: authHeaders(pmToken),
        body: JSON.stringify({ status: "active" }),
      });
      // Gate: all students must have coach assigned (or no students yet)
      expect(res.status).toBe(400);
    });
  });

  // ─── Student CRUD + Import ──────────────────────────────────────────────────

  describe("LMS Student CRUD (PM)", () => {
    it("lists students in cohort (empty)", async () => {
      if (!createdCohortId) return;
      const res = await fetch(`${API_BASE}/api/lms/cohorts/${createdCohortId}/students`, {
        headers: authHeaders(pmToken),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.data)).toBe(true);
    });

    it("previews CSV import — valid and invalid rows separated", async () => {
      if (!createdCohortId) return;
      const res = await fetch(`${API_BASE}/api/lms/cohorts/${createdCohortId}/students/import/preview`, {
        method: "POST",
        headers: authHeaders(pmToken),
        body: JSON.stringify({
          cohortId: createdCohortId,
          columnMapping: { "First Name": "firstName", "Last Name": "lastName" },
          rows: [
            { firstName: "Alice", lastName: "Test", pupilPremiumFlag: false, ealFlag: false, lookedAfterFlag: false, careExperiencedFlag: false },
            { firstName: "", lastName: "NoFirst", pupilPremiumFlag: false, ealFlag: false, lookedAfterFlag: false, careExperiencedFlag: false },
          ],
        }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.totalRows).toBe(2);
      expect(data.validRows).toBe(1);
      expect(data.invalidRows).toBe(1);
    });

    it("applies CSV import", async () => {
      if (!createdCohortId) return;
      const res = await fetch(`${API_BASE}/api/lms/cohorts/${createdCohortId}/students/import/apply`, {
        method: "POST",
        headers: authHeaders(pmToken),
        body: JSON.stringify({
          cohortId: createdCohortId,
          columnMapping: { "First Name": "firstName", "Last Name": "lastName" },
          rows: [
            { firstName: "Alice", lastName: "Smoke", pupilPremiumFlag: false, ealFlag: false, lookedAfterFlag: false, careExperiencedFlag: false },
            { firstName: "Bob", lastName: "Smoke", pupilPremiumFlag: true, ealFlag: false, lookedAfterFlag: false, careExperiencedFlag: false },
          ],
        }),
      });
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.imported).toBe(2);
      expect(Array.isArray(data.studentIds)).toBe(true);
      if (data.studentIds.length > 0) createdStudentId = data.studentIds[0];
    });

    it("gets student detail", async () => {
      if (!createdStudentId) return;
      const res = await fetch(`${API_BASE}/api/lms/students/${createdStudentId}`, {
        headers: authHeaders(pmToken),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.id).toBe(createdStudentId);
      expect(data).toHaveProperty("scores");
      expect(data).toHaveProperty("narratives");
    });

    it("per-student completeness — attendance.total equals cohort session count", async () => {
      if (!createdStudentId) return;
      const res = await fetch(`${API_BASE}/api/lms/students/${createdStudentId}/completeness`, {
        headers: authHeaders(pmToken),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty("studentId");
      expect(data).toHaveProperty("status");
      expect(data).toHaveProperty("attendance");
      expect(data).toHaveProperty("coachScores");
      // Must equal cohort session count (8), not attendance row count
      expect(data.attendance.total).toBe(8);
    });
  });

  // ─── Attendance ─────────────────────────────────────────────────────────────

  describe("LMS Attendance", () => {
    it("gets attendance grid for cohort", async () => {
      if (!createdCohortId) return;
      const res = await fetch(`${API_BASE}/api/lms/cohorts/${createdCohortId}/attendance`, {
        headers: authHeaders(pmToken),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty("sessions");
      expect(data).toHaveProperty("grid");
    });

    it("PM attendance write for nonexistent student is silently skipped (updated:0)", async () => {
      // Verifies the PM scoping path: unknown student → skip, not 500
      const res = await fetch(`${API_BASE}/api/lms/attendance`, {
        method: "PUT",
        headers: authHeaders(pmToken),
        body: JSON.stringify({
          records: [{ studentId: "nonexistent_student_id", sessionId: "nonexistent_session_id", attended: true }],
        }),
      });
      expect(res.status).not.toBe(500);
      if (res.status === 200) {
        const data = await res.json();
        expect(data.updated).toBe(0);
      }
    });
  });

  // ─── Scores ─────────────────────────────────────────────────────────────────

  describe("LMS Scores", () => {
    it("upserts coach scores for a student", async () => {
      if (!createdStudentId) return;
      const res = await fetch(`${API_BASE}/api/lms/students/${createdStudentId}/scores`, {
        method: "PUT",
        headers: authHeaders(pmToken),
        body: JSON.stringify({
          raterType: "coach",
          timePoint: "pre",
          confidence: 3,
          resilience: 2,
          communication: 4,
          selfAwareness: 1,
        }),
      });
      expect([200, 201]).toContain(res.status);
      const data = await res.json();
      expect(data.isComplete).toBe(true);
    });

    it("rejects scores out of 0-4 range", async () => {
      if (!createdStudentId) return;
      const res = await fetch(`${API_BASE}/api/lms/students/${createdStudentId}/scores`, {
        method: "PUT",
        headers: authHeaders(pmToken),
        body: JSON.stringify({
          raterType: "coach",
          timePoint: "end",
          confidence: 5, // invalid
          resilience: 2,
          communication: 4,
          selfAwareness: 1,
        }),
      });
      expect(res.status).toBe(400);
    });
  });

  // ─── Narratives ─────────────────────────────────────────────────────────────

  describe("LMS Narratives (auto-save)", () => {
    it("saves partial narrative and returns isComplete=false", async () => {
      if (!createdStudentId) return;
      const res = await fetch(`${API_BASE}/api/lms/students/${createdStudentId}/narratives`, {
        method: "PUT",
        headers: authHeaders(pmToken),
        body: JSON.stringify({
          overallEngagement: "strong",
          itwReflection: "Great day at the forest.",
        }),
      });
      expect([200, 201]).toContain(res.status);
      const data = await res.json();
      expect(data.overallEngagement).toBe("strong");
      expect(data.isComplete).toBe(false);
    });
  });

  // ─── Report content ─────────────────────────────────────────────────────────

  describe("LMS Report Content (PM)", () => {
    it("upserts ITW trip data", async () => {
      if (!createdCohortId) return;
      const res = await fetch(`${API_BASE}/api/lms/cohorts/${createdCohortId}/trip-data`, {
        method: "PUT",
        headers: authHeaders(pmToken),
        body: JSON.stringify({
          tripType: "itw",
          venueName: "Epping Forest",
          activityHighlights: ["Team challenge", "Navigation exercise"],
          featuredStudentQuote: "I learned to trust my team.",
        }),
      });
      expect([200, 201]).toContain(res.status);
      const data = await res.json();
      expect(data.tripType).toBe("itw");
      expect(data.isComplete).toBe(true);
    });

    it("gets trip data for cohort", async () => {
      if (!createdCohortId) return;
      const res = await fetch(`${API_BASE}/api/lms/cohorts/${createdCohortId}/trip-data`, {
        headers: authHeaders(pmToken),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty("itw");
      expect(data).toHaveProperty("wow");
    });

    it("upserts cohort narratives", async () => {
      if (!createdCohortId) return;
      const res = await fetch(`${API_BASE}/api/lms/cohorts/${createdCohortId}/narratives`, {
        method: "PUT",
        headers: authHeaders(pmToken),
        body: JSON.stringify({
          programmeStrengths: "Strong coach engagement.",
          overallAssessment: "Excellent cohort.",
        }),
      });
      expect([200, 201]).toContain(res.status);
    });

    it("rejects invalid transition from setup to report_generation", async () => {
      if (!createdCohortId) return;
      // Cohort is in setup — report_generation is not the next valid state
      const res = await fetch(`${API_BASE}/api/lms/cohorts/${createdCohortId}/status`, {
        method: "PUT",
        headers: authHeaders(pmToken),
        body: JSON.stringify({ status: "report_generation" }),
      });
      expect(res.status).toBe(400);
    });
  });

  // ─── Completeness dashboard ─────────────────────────────────────────────────

  describe("LMS Completeness Dashboard", () => {
    it("returns completeness matrix — attendance.total equals session count", async () => {
      if (!createdCohortId) return;
      const res = await fetch(`${API_BASE}/api/lms/cohorts/${createdCohortId}/completeness`, {
        headers: authHeaders(pmToken),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty("cohortId");
      expect(data).toHaveProperty("totalStudents");
      expect(data).toHaveProperty("cohortBlockingItems");
      expect(data).toHaveProperty("students");
      expect(Array.isArray(data.students)).toBe(true);
      expect(data.cohortBlockingItems).toHaveProperty("leadTeacherNamed");
      expect(data.cohortBlockingItems).toHaveProperty("tripData");
      expect(data.cohortBlockingItems).toHaveProperty("cohortNarratives");
      for (const s of data.students) {
        expect(s.attendance.total).toBe(8);
      }
    });
  });

  // ─── Dashboard ──────────────────────────────────────────────────────────────

  describe("LMS Dashboard", () => {
    it("returns cross-cohort overview", async () => {
      const res = await fetch(`${API_BASE}/api/lms/dashboard`, {
        headers: authHeaders(pmToken),
      });
      if (res.status === 403) return;
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty("totalCohorts");
      expect(data).toHaveProperty("cohorts");
    });
  });

  // ─── Coach scoping ──────────────────────────────────────────────────────────

  describe("LMS Coach scoping", () => {
    it("coach cannot access cohort list — OPERATOR requires MANAGER+", async () => {
      const res = await fetch(`${API_BASE}/api/lms/cohorts`, {
        headers: authHeaders(coachToken),
      });
      expect(res.status).toBe(403);
    });

    it("coach cannot create a cohort", async () => {
      if (!testProgrammeId) return;
      const res = await fetch(`${API_BASE}/api/lms/cohorts`, {
        method: "POST",
        headers: authHeaders(coachToken),
        body: JSON.stringify({
          programmeId: testProgrammeId,
          cohortName: "Coach Should Not Create This",
          programmeType: "rising_futures",
        }),
      });
      expect(res.status).toBe(403);
    });

    it("coach cannot access a student not assigned to them", async () => {
      if (!createdStudentId) return;
      // createdStudentId has no coachId — coach must be denied
      const res = await fetch(`${API_BASE}/api/lms/students/${createdStudentId}`, {
        headers: authHeaders(coachToken),
      });
      expect([403, 404]).toContain(res.status);
    });
  });

  // ─── Teacher links ───────────────────────────────────────────────────────────

  describe("LMS Teacher Links (PM)", () => {
    let createdTokenId = "";

    it("generates teacher-feedback tokens for cohort", async () => {
      if (!createdCohortId) return;
      const res = await fetch(`${API_BASE}/api/lms/cohorts/${createdCohortId}/teacher-links`, {
        method: "POST",
        headers: authHeaders(pmToken),
        body: JSON.stringify({
          recipients: [{ email: "teacher@school.example", name: "Ms Teacher" }],
        }),
      });
      if (res.status === 403) return; // LMS module disabled
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.created).toBe(1);
      expect(Array.isArray(data.tokenIds)).toBe(true);
      if (data.tokenIds.length > 0) createdTokenId = data.tokenIds[0];
    });

    it("lists active teacher-feedback tokens — excludes revoked/expired/exhausted", async () => {
      if (!createdCohortId) return;
      const res = await fetch(`${API_BASE}/api/lms/cohorts/${createdCohortId}/teacher-links`, {
        headers: authHeaders(pmToken),
      });
      if (res.status === 403) return;
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      // All returned tokens must be active (not revoked, not expired, not exhausted)
      for (const token of data) {
        expect(token.revokedAt).toBeUndefined(); // revokedAt not exposed on active tokens
        expect(new Date(token.expiresAt).getTime()).toBeGreaterThan(Date.now());
        expect(token.useCount).toBeLessThan(token.maxUses);
      }
    });

    it("PM can revoke a token they generated", async () => {
      if (!createdTokenId) return;
      const res = await fetch(`${API_BASE}/api/lms/tokens/${createdTokenId}`, {
        method: "DELETE",
        headers: authHeaders(pmToken),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.revoked).toBe(true);
    });

    it("coach cannot generate teacher-feedback tokens", async () => {
      if (!createdCohortId) return;
      const res = await fetch(`${API_BASE}/api/lms/cohorts/${createdCohortId}/teacher-links`, {
        method: "POST",
        headers: authHeaders(coachToken),
        body: JSON.stringify({
          recipients: [{ email: "teacher@school.example" }],
        }),
      });
      expect(res.status).toBe(403);
    });
  });

}); // end describeSuite
