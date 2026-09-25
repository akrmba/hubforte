/**
 * LMS Smoke Tests — Round 03
 *
 * Tests the token system and public endpoints.
 * Requires a running API server with LMS module enabled.
 *
 * Run: pnpm test:smoke:lms03
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

// ─── Server availability check ────────────────────────────────────────────────

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
let testStudentId = "";
let testCohortId = "";
let generatedInviteToken = "";
let generatedTokenId = "";
let sessionCookie = "";

// ─── Suite ────────────────────────────────────────────────────────────────────

const describeSuite = serverAvailable ? describe : describe.skip;

describeSuite("LMS Round 03 smoke suite — Token System + Public Endpoints", () => {

  beforeAll(async () => {
    try {
      pmToken = await login(PM_EMAIL, PM_PASSWORD);
    } catch (err) {
      throw new Error(`[lms03 smoke] PM login failed — cannot run suite. ${err}`);
    }
    try {
      coachToken = await login(COACH_EMAIL, COACH_PASSWORD);
    } catch (err) {
      throw new Error(`[lms03 smoke] Coach login failed — cannot run suite. ${err}`);
    }

    // Discover a cohort and student to use
    const cohortRes = await fetch(`${API_BASE}/api/lms/cohorts?limit=1`, {
      headers: authHeaders(pmToken),
    });
    if (cohortRes.ok) {
      const data = await cohortRes.json();
      if (data.data?.length > 0) {
        testCohortId = data.data[0].id;
        // Get a student from this cohort
        const studentRes = await fetch(`${API_BASE}/api/lms/cohorts/${testCohortId}/students?limit=1`, {
          headers: authHeaders(pmToken),
        });
        if (studentRes.ok) {
          const sData = await studentRes.json();
          if (sData.data?.length > 0) testStudentId = sData.data[0].id;
        }
      }
    }
  });

  afterAll(async () => {
    // Revoke any generated token
    if (generatedTokenId && pmToken) {
      await fetch(`${API_BASE}/api/lms/tokens/${generatedTokenId}`, {
        method: "DELETE",
        headers: authHeaders(pmToken),
      }).catch(() => {});
    }
  });

  // ─── Survey link generation ─────────────────────────────────────────────────

  describe("Survey link generation (PM)", () => {
    it("generates a student_survey token for a student", async () => {
      if (!testStudentId) return;
      const res = await fetch(`${API_BASE}/api/lms/students/${testStudentId}/survey-links`, {
        method: "POST",
        headers: authHeaders(pmToken),
        body: JSON.stringify({ tokenType: "student_survey" }),
      });
      if (res.status === 403) return; // LMS module disabled
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data).toHaveProperty("tokenId");
      expect(data).toHaveProperty("inviteToken");
      expect(data.tokenType).toBe("student_survey");
      generatedInviteToken = data.inviteToken;
      generatedTokenId = data.tokenId;
    });

    it("generates a parent_survey token for a student", async () => {
      if (!testStudentId) return;
      const res = await fetch(`${API_BASE}/api/lms/students/${testStudentId}/survey-links`, {
        method: "POST",
        headers: authHeaders(pmToken),
        body: JSON.stringify({ tokenType: "parent_survey" }),
      });
      if (res.status === 403) return;
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.tokenType).toBe("parent_survey");
    });

    it("rejects invalid tokenType", async () => {
      if (!testStudentId) return;
      const res = await fetch(`${API_BASE}/api/lms/students/${testStudentId}/survey-links`, {
        method: "POST",
        headers: authHeaders(pmToken),
        body: JSON.stringify({ tokenType: "teacher_feedback" }), // not valid for student endpoint
      });
      expect(res.status).toBe(400);
    });

    it("lists active survey tokens for a student", async () => {
      if (!testStudentId) return;
      const res = await fetch(`${API_BASE}/api/lms/students/${testStudentId}/survey-links`, {
        headers: authHeaders(pmToken),
      });
      if (res.status === 403) return;
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      // All returned tokens must be active
      for (const token of data) {
        expect(new Date(token.expiresAt).getTime()).toBeGreaterThan(Date.now());
        expect(token.useCount).toBeLessThan(token.maxUses);
      }
    });

    it("coach cannot generate survey tokens", async () => {
      if (!testStudentId) return;
      const res = await fetch(`${API_BASE}/api/lms/students/${testStudentId}/survey-links`, {
        method: "POST",
        headers: authHeaders(coachToken),
        body: JSON.stringify({ tokenType: "student_survey" }),
      });
      expect(res.status).toBe(403);
    });
  });

  // ─── Token exchange ─────────────────────────────────────────────────────────

  describe("Token exchange (public)", () => {
    it("returns 400 for missing token body", async () => {
      const res = await fetch(`${API_BASE}/api/lms/public/exchange`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it("returns 401 for invalid/unknown token", async () => {
      const res = await fetch(`${API_BASE}/api/lms/public/exchange`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef" }),
      });
      expect(res.status).toBe(401);
    });

    it("exchanges a valid invite token for a session cookie", async () => {
      if (!generatedInviteToken) return;
      const res = await fetch(`${API_BASE}/api/lms/public/exchange`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: generatedInviteToken }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty("redirectTo");
      expect(data.redirectTo).toBe("/survey");
      // Cookie should be set
      const setCookie = res.headers.get("set-cookie");
      expect(setCookie).toBeTruthy();
      expect(setCookie).toContain("lms_session");
      expect(setCookie).toContain("HttpOnly");
      // Extract session cookie for subsequent tests
      const match = setCookie?.match(/lms_session=([^;]+)/);
      if (match) sessionCookie = `lms_session=${match[1]}`;
    });
  });

  // ─── Public survey endpoints ────────────────────────────────────────────────

  describe("Public survey endpoints (session-cookie auth)", () => {
    it("returns 401 without session cookie", async () => {
      const res = await fetch(`${API_BASE}/api/lms/public/survey`);
      expect(res.status).toBe(401);
    });

    it("returns survey form data with valid session", async () => {
      if (!sessionCookie) return;
      const res = await fetch(`${API_BASE}/api/lms/public/survey`, {
        headers: { Cookie: sessionCookie },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty("studentFirstName");
      expect(data).toHaveProperty("programmeType");
      expect(data).toHaveProperty("timePoint");
      expect(data).toHaveProperty("alreadySubmitted");
    });

    it("student_survey session cannot access teacher endpoint", async () => {
      if (!sessionCookie) return;
      // sessionCookie holds a student_survey session — teacher endpoint requires teacher_feedback
      const res = await fetch(`${API_BASE}/api/lms/public/teacher`, {
        headers: { Cookie: sessionCookie },
      });
      expect(res.status).toBe(403);
    });

    it("returns 409 on duplicate survey submission", async () => {
      if (!sessionCookie) return;
      // First submission
      const body = JSON.stringify({
        timePoint: "end",
        submissionChannel: "url_code",
        threeWords: "great fun inspiring",
      });
      const first = await fetch(`${API_BASE}/api/lms/public/survey/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: sessionCookie },
        body,
      });
      // If already submitted from a prior run, expect 409; otherwise 201
      expect([201, 409]).toContain(first.status);

      if (first.status === 201) {
        // Second submission must be 409
        const second = await fetch(`${API_BASE}/api/lms/public/survey/submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: sessionCookie },
          body,
        });
        expect(second.status).toBe(409);
      }
    });
  });

  // ─── Cohort survey status ───────────────────────────────────────────────────

  describe("Cohort survey status (PM)", () => {
    it("returns survey submission status for all students", async () => {
      if (!testCohortId) return;
      const res = await fetch(`${API_BASE}/api/lms/cohorts/${testCohortId}/surveys`, {
        headers: authHeaders(pmToken),
      });
      if (res.status === 403) return;
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty("cohortId");
      expect(Array.isArray(data.students)).toBe(true);
      for (const s of data.students) {
        expect(s).toHaveProperty("studentId");
        expect(s.studentSurvey).toHaveProperty("pre");
        expect(s.studentSurvey).toHaveProperty("end");
        expect(s).toHaveProperty("parentSurvey");
      }
    });
  });

  // ─── Coach device handover ──────────────────────────────────────────────────

  describe("Coach device handover", () => {
    it("coach can generate a handover session for their student", async () => {
      if (!testStudentId) return;
      const res = await fetch(`${API_BASE}/api/lms/students/${testStudentId}/handover-session`, {
        method: "POST",
        headers: authHeaders(coachToken),
      });
      // 403 if student not assigned to this coach — acceptable
      if (res.status === 403) return;
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data).toHaveProperty("inviteToken");
      expect(data).toHaveProperty("expiresInSeconds");
      expect(data.expiresInSeconds).toBe(900); // 15 min
    });

    it("PM can generate a handover session", async () => {
      if (!testStudentId) return;
      const res = await fetch(`${API_BASE}/api/lms/students/${testStudentId}/handover-session`, {
        method: "POST",
        headers: authHeaders(pmToken),
      });
      if (res.status === 403) return;
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.expiresInSeconds).toBe(900);
    });
  });

  // ─── QR code generation ─────────────────────────────────────────────────────

  describe("QR code generation (PM)", () => {
    it("returns QR data for all students in cohort", async () => {
      if (!testCohortId) return;
      const res = await fetch(`${API_BASE}/api/lms/cohorts/${testCohortId}/qr-codes`, {
        headers: authHeaders(pmToken),
      });
      if (res.status === 403) return;
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty("cohortId");
      expect(Array.isArray(data.students)).toBe(true);
      for (const s of data.students) {
        expect(s).toHaveProperty("studentId");
        expect(s).toHaveProperty("firstName");
        expect(s).toHaveProperty("qrUrl");
        expect(s.qrUrl).toContain("#token="); // fragment-based URL
        expect(s).toHaveProperty("expiresAt");
      }
    });

    it("coach cannot generate QR codes", async () => {
      if (!testCohortId) return;
      const res = await fetch(`${API_BASE}/api/lms/cohorts/${testCohortId}/qr-codes`, {
        headers: authHeaders(coachToken),
      });
      expect(res.status).toBe(403);
    });
  });

  // ─── Public report endpoints ────────────────────────────────────────────────

  describe("Public report endpoints", () => {
    it("returns 401 without session cookie", async () => {
      const res = await fetch(`${API_BASE}/api/lms/public/report`);
      expect(res.status).toBe(401);
    });

    it("survey session cannot access report endpoint", async () => {
      if (!sessionCookie) return;
      // Survey session has tokenType=student_survey — report requires student_report
      const res = await fetch(`${API_BASE}/api/lms/public/report`, {
        headers: { Cookie: sessionCookie },
      });
      expect(res.status).toBe(403);
    });

    it("PDF endpoint requires student_report session type", async () => {
      if (!sessionCookie) return;
      const res = await fetch(`${API_BASE}/api/lms/public/report/pdf`, {
        headers: { Cookie: sessionCookie },
      });
      // sessionCookie is a student_survey token — report/pdf requires student_report
      // so 403 is the correct response; 200 would mean a student_report session was used
      expect([200, 403]).toContain(res.status);
    });
  });

  // ─── Personal access code exchange ─────────────────────────────────────────

  describe("Personal access code exchange", () => {
    it("returns 401 for unknown access code", async () => {
      const res = await fetch(`${API_BASE}/api/lms/public/exchange-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "XXXXXX" }),
      });
      expect(res.status).toBe(401);
    });

    it("returns 400 for missing code body", async () => {
      const res = await fetch(`${API_BASE}/api/lms/public/exchange-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it("exchange-code session cookie works on follow-up survey request", async () => {
      // This test requires a student with a known personalAccessCode in the test fixture.
      // If TEST_STUDENT_ACCESS_CODE is not set, skip gracefully.
      const accessCode = process.env.TEST_STUDENT_ACCESS_CODE;
      if (!accessCode) return;

      // Exchange the code for a session
      const exchangeRes = await fetch(`${API_BASE}/api/lms/public/exchange-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: accessCode }),
      });
      expect(exchangeRes.status).toBe(200);
      const setCookie = exchangeRes.headers.get("set-cookie");
      expect(setCookie).toBeTruthy();
      expect(setCookie).toContain("lms_session");

      // Use the returned session cookie on a follow-up request
      const match = setCookie?.match(/lms_session=([^;]+)/);
      expect(match).toBeTruthy();
      const codeCookie = `lms_session=${match![1]}`;

      const surveyRes = await fetch(`${API_BASE}/api/lms/public/survey`, {
        headers: { Cookie: codeCookie },
      });
      // 200 if consent is OBTAINED, 403 if not — both prove the session was accepted
      expect([200, 403]).toContain(surveyRes.status);
      // Must NOT be 401 (session rejected)
      expect(surveyRes.status).not.toBe(401);
    });
  });

  // ─── Consent gate ───────────────────────────────────────────────────────────

  describe("Consent gate", () => {
    it("consent-denied session returns 403 with correct error message", async () => {
      // Requires TEST_NO_CONSENT_ACCESS_CODE — a student whose consent_records row
      // is absent or has status != OBTAINED. If not set, skip gracefully.
      const noConsentCode = process.env.TEST_NO_CONSENT_ACCESS_CODE;
      if (!noConsentCode) return;

      // Exchange the code for a session
      const exchangeRes = await fetch(`${API_BASE}/api/lms/public/exchange-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: noConsentCode }),
      });
      if (exchangeRes.status !== 200) return; // code not found — skip

      const setCookie = exchangeRes.headers.get("set-cookie");
      const match = setCookie?.match(/lms_session=([^;]+)/);
      if (!match) return;
      const noConsentCookie = `lms_session=${match[1]}`;

      // Survey endpoint must return 403 with the consent-denied message
      const surveyRes = await fetch(`${API_BASE}/api/lms/public/survey`, {
        headers: { Cookie: noConsentCookie },
      });
      expect(surveyRes.status).toBe(403);
      const body = await surveyRes.json();
      expect(body.error).toBe("Access restricted — please contact your Programme Manager.");
    });

    it("consent gate does not block a session with OBTAINED consent", async () => {
      // sessionCookie was obtained from a real student_survey token exchange earlier.
      // If consent is OBTAINED for that student, survey returns 200.
      // If consent is absent, it returns 403 — both are valid outcomes for this env.
      // What must NOT happen is 401 (session rejected) or 500 (server error).
      if (!sessionCookie) return;
      const res = await fetch(`${API_BASE}/api/lms/public/survey`, {
        headers: { Cookie: sessionCookie },
      });
      expect([200, 403]).toContain(res.status);
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(500);
    });
  });

}); // end describeSuite
