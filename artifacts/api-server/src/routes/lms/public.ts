/**
 * LMS Public Endpoints — Phase 3
 *
 * No JWT required. Access is via:
 *   1. POST /api/lms/public/exchange       — invite token → session cookie
 *   2. POST /api/lms/public/exchange-code  — personal access code → session cookie
 *
 * All subsequent public endpoints require the `lms_session` httpOnly cookie.
 *
 * Session scope enforcement:
 *   - teacher_feedback session → /teacher endpoints only
 *   - student_survey / parent_survey session → /survey endpoints only
 *   - student_report session → /report endpoints only
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import fs from "fs";
import path from "path";
import { db, lmsAccessTokensTable, lmsPublicSessionsTable, studentsTable, programmeCohortsTable, lmsStudentSurveysTable, lmsTeacherFeedbackTable, lmsParentSurveysTable, consentRecordsTable, lmsReportsTable } from "@workspace/db";
import { eq, and, sql, isNull, gt, desc, inArray } from "drizzle-orm";
import { createHash, randomBytes } from "crypto";
import { z } from "zod";
import { generateId } from "../../lib/id";
import { checkModuleEnabled } from "../../lib/featureFlags";
import { writeAuditLog } from "../../lib/audit";

const router = Router();

// ─── Rate limiting (using rate-limiter-flexible already in package.json) ────────

import { RateLimiterMemory } from "rate-limiter-flexible";

const exchangeRateLimiter = new RateLimiterMemory({ points: 10, duration: 60 });
const submitRateLimiter = new RateLimiterMemory({ points: 5, duration: 60 });
const reportRateLimiter = new RateLimiterMemory({ points: 20, duration: 60 });

async function rateLimit(limiter: RateLimiterMemory, key: string, res: Response): Promise<boolean> {
  try {
    await limiter.consume(key);
    return true;
  } catch {
    res.status(429).json({ error: "Too many requests — please try again shortly" });
    return false;
  }
}

// ─── Session middleware ──────────────────────────────────────────────────────────

export interface LmsPublicSession {
  id: string;
  tenantId: string;
  tokenId: string;
  tokenType: string;
  scopeType: string;
  scopeId: string;
  expiresAt: Date;
}

declare global {
  namespace Express {
    interface Request {
      lmsSession?: LmsPublicSession;
    }
  }
}

async function lmsSessionMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const sessionId = req.cookies?.lms_session as string | undefined;
  if (!sessionId) {
    res.status(401).json({ error: "No session — please use your link to access this page" });
    return;
  }

  const now = new Date();
  const [session] = await db
    .select()
    .from(lmsPublicSessionsTable)
    // @ts-ignore -- Drizzle and() overload
    .where(and(
      // @ts-ignore
      eq(lmsPublicSessionsTable.id, sessionId),
      // @ts-ignore
      gt(lmsPublicSessionsTable.expiresAt, now),
    ) as any);

  if (!session) {
    res.status(401).json({ error: "Session expired — please use your link again to start a new session" });
    return;
  }

  req.lmsSession = session as LmsPublicSession;
  next();
}

function requireSessionType(...types: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.lmsSession || !types.includes(req.lmsSession.tokenType)) {
      res.status(403).json({ error: "This session does not have access to this resource" });
      return;
    }
    next();
  };
}

// ─── Session activity audit middleware ───────────────────────────────────────────
// Part 2 requirement: all session-authenticated activity must be audit-logged
// with session id, route/action, timestamp, IP, and user-agent.

function lmsSessionActivityLog(req: Request, _res: Response, next: NextFunction): void {
  const session = req.lmsSession;
  if (!session) { next(); return; }

  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
    || req.ip
    || req.socket.remoteAddress
    || "unknown";

  const ua = req.headers["user-agent"] as string | undefined;

  // Fire-and-forget — must never block the response
  writeAuditLog({
    userId: session.id,           // session ID as actor identifier
    userRole: "PUBLIC_SESSION",   // synthetic role for public sessions
    tenantId: session.tenantId,
    action: req.method === "GET" ? "VIEW" : "SUBMIT",
    entityType: "lms_public_session",
    entityId: session.scopeId,    // student or organisation ID
    route: req.originalUrl,
    method: req.method,
    ipAddress: ip,
    userAgent: ua,
  });

  next();
}

// ─── Consent gate ────────────────────────────────────────────────────────────────

async function assertConsent(studentId: string, tenantId: string, res: Response): Promise<boolean> {
  const [record] = await db
    .select({ status: consentRecordsTable.status })
    .from(consentRecordsTable)
    // @ts-ignore -- Drizzle and() overload
    .where(and(
      // @ts-ignore
      eq(consentRecordsTable.studentId, studentId),
      // @ts-ignore
      eq(consentRecordsTable.tenantId, tenantId),
    ) as any);

  if (!record || record.status !== "OBTAINED") {
    res.status(403).json({ error: "Access restricted — please contact your Programme Manager." });
    return false;
  }
  return true;
}

// ─── Token exchange helpers ──────────────────────────────────────────────────────

async function validateAndConsumeToken(
  rawToken: string,
  tenantId: string | null,
): Promise<typeof lmsAccessTokensTable.$inferSelect | null> {
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const now = new Date();

  const rows = await db
    .select()
    .from(lmsAccessTokensTable)
    .where(
      // @ts-ignore -- Drizzle and() overload
      and(
        // @ts-ignore
        eq(lmsAccessTokensTable.tokenHash, tokenHash),
        // @ts-ignore
        isNull(lmsAccessTokensTable.revokedAt),
        // @ts-ignore
        gt(lmsAccessTokensTable.expiresAt, now),
        // @ts-ignore
        ...(tenantId ? [eq(lmsAccessTokensTable.tenantId, tenantId)] : []),
      ) as any,
    );

  const token = rows[0] ?? null;
  if (!token) return null;

  // Check max uses
  if (token.useCount >= token.maxUses) return null;

  // Increment use count + update lastUsedAt
  await db
    .update(lmsAccessTokensTable)
    .set({ useCount: token.useCount + 1, lastUsedAt: now } as any)
    // @ts-ignore
    .where(eq(lmsAccessTokensTable.id, token.id));

  return token;
}

// ─── Session ID generation ────────────────────────────────────────────────────────
// Part 2 spec: LMS public session id must be an opaque 32-byte value.
// We use 32 random bytes encoded as base64url, prefixed with "lpu_".

function generatePublicSessionId(): string {
  return `lpu_${randomBytes(32).toString("base64url")}`;
}

async function createPublicSession(
  token: typeof lmsAccessTokensTable.$inferSelect,
  req: Request,
): Promise<string> {
  const sessionId = generatePublicSessionId();
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours
  const ipAddress = (req.ip ?? req.socket.remoteAddress ?? null) as string | null;
  const userAgent = (req.headers["user-agent"] ?? null) as string | null;

  await db.insert(lmsPublicSessionsTable).values({
    id: sessionId,
    tenantId: token.tenantId,
    tokenId: token.id,
    tokenType: token.tokenType,
    scopeType: token.scopeType,
    scopeId: token.scopeId,
    ipAddress,
    userAgent,
    expiresAt,
    createdAt: new Date(),
  } as any);

  return sessionId;
}

function setSessionCookie(res: Response, sessionId: string): void {
  res.cookie("lms_session", sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 2 * 60 * 60 * 1000, // 2 hours
  });
}

function redirectTarget(tokenType: string): string {
  switch (tokenType) {
    case "teacher_feedback": return "/teacher";
    case "student_survey": return "/survey";
    case "parent_survey": return "/survey";
    case "student_report": return "/report";
    default: return "/";
  }
}

// ─── POST /api/lms/public/exchange ───────────────────────────────────────────────

const exchangeSchema = z.object({ token: z.string().min(1) });

router.post("/public/exchange", checkModuleEnabled("lms"), async (req, res): Promise<void> => {
  const ip = (req.ip ?? req.socket.remoteAddress ?? "unknown");
  if (!await rateLimit(exchangeRateLimiter, ip, res)) return;

  const parsed = exchangeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  try {
    const token = await validateAndConsumeToken(parsed.data.token, null);
    if (!token) {
      res.status(401).json({ error: "This link has expired or is no longer valid — ask your Programme Manager for a new one" });
      return;
    }

    const sessionId = await createPublicSession(token, req);
    setSessionCookie(res, sessionId);

    res.json({ redirectTo: redirectTarget(token.tokenType) });
  } catch (err) {
    console.error("[lms/public/exchange POST]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /api/lms/public/exchange-code ──────────────────────────────────────────
// Personal access code is the student's own entrypoint — no pre-existing token required.
// The code itself authenticates the student and issues a student_survey session directly.

const exchangeCodeSchema = z.object({ code: z.string().min(1) });

router.post("/public/exchange-code", checkModuleEnabled("lms"), async (req, res): Promise<void> => {
  const ip = (req.ip ?? req.socket.remoteAddress ?? "unknown");
  if (!await rateLimit(exchangeRateLimiter, ip, res)) return;

  const parsed = exchangeCodeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  try {
    // Look up student by personal access code (case-insensitive, tenant-agnostic at lookup)
    const [student] = await db
      .select({ id: studentsTable.id, tenantId: studentsTable.tenantId, cohortId: studentsTable.cohortId })
      .from(studentsTable)
      // @ts-ignore -- Drizzle eq() overload
      .where(eq(studentsTable.personalAccessCode, parsed.data.code.toUpperCase()));

    if (!student || !student.tenantId) {
      res.status(401).json({ error: "Code not recognised — please check and try again" });
      return;
    }

    // Issue a session directly — personal access code IS the credential, no token row needed
    const sessionId = generatePublicSessionId();
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours
    const ipAddress = (req.ip ?? req.socket.remoteAddress ?? null) as string | null;
    const userAgent = (req.headers["user-agent"] ?? null) as string | null;

    await db.insert(lmsPublicSessionsTable).values({
      id: sessionId,
      tenantId: student.tenantId,
      tokenId: null,          // no backing token — code-based session
      tokenType: "student_survey",
      scopeType: "student",
      scopeId: student.id,
      ipAddress,
      userAgent,
      expiresAt,
      createdAt: new Date(),
    } as any);

    setSessionCookie(res, sessionId);
    res.json({ redirectTo: "/survey" });
  } catch (err) {
    console.error("[lms/public/exchange-code POST]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /api/lms/public/survey ──────────────────────────────────────────────────

router.get("/public/survey", checkModuleEnabled("lms"), lmsSessionMiddleware, requireSessionType("student_survey", "parent_survey"), lmsSessionActivityLog, async (req, res): Promise<void> => {
  const session = req.lmsSession!;
  const ip = (req.ip ?? req.socket.remoteAddress ?? "unknown");
  if (!await rateLimit(reportRateLimiter, session.id, res)) return;

  try {
    const studentId = session.scopeId;
    if (!await assertConsent(studentId, session.tenantId, res)) return;
    const [student] = await db
      .select({
        id: studentsTable.id,
        firstName: studentsTable.firstName,
        cohortId: studentsTable.cohortId,
      })
      .from(studentsTable)
      // @ts-ignore
      .where(and(
        // @ts-ignore
        eq(studentsTable.id, studentId),
        // @ts-ignore
        eq(studentsTable.tenantId, session.tenantId),
      ) as any);

    if (!student) {
      res.status(404).json({ error: "Student not found" });
      return;
    }

    // Get cohort programme type for question set resolution
    let programmeType = "rising_futures";
    if (student.cohortId) {
      const [cohort] = await db
        .select({ programmeType: programmeCohortsTable.programmeType })
        .from(programmeCohortsTable)
        // @ts-ignore
        .where(eq(programmeCohortsTable.id, student.cohortId));
      if (cohort?.programmeType) programmeType = cohort.programmeType;
    }

    // Check for existing submission (409 if already submitted for this timepoint)
    const timePoint = (req.query.timePoint as string) || "end";
    const [existing] = await db
      .select({ id: lmsStudentSurveysTable.id })
      .from(lmsStudentSurveysTable)
      // @ts-ignore
      .where(and(
        // @ts-ignore
        eq(lmsStudentSurveysTable.studentId, studentId),
        // @ts-ignore
        eq(lmsStudentSurveysTable.timePoint, timePoint),
      ) as any);

    res.json({
      studentFirstName: student.firstName,
      programmeType,
      timePoint,
      alreadySubmitted: !!existing,
      tokenType: session.tokenType,
    });
  } catch (err) {
    console.error("[lms/public/survey GET]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /api/lms/public/survey/submit ──────────────────────────────────────────

const submitStudentSurveySchema = z.object({
  timePoint: z.enum(["pre", "end", "forward_to_future"]),
  enjoyedProgramme: z.string().optional(),
  preparedFuture: z.string().optional(),
  motivatedSchool: z.string().optional(),
  shownSkills: z.string().optional(),
  betterFutureIdeas: z.string().optional(),
  positiveDifference: z.string().optional(),
  threeWords: z.string().optional(),
  favouriteThing: z.string().optional(),
  whyFavourite: z.string().optional(),
  changeOneThing: z.string().optional(),
  otherComments: z.string().optional(),
  submissionChannel: z.enum(["coach_handover", "qr_code", "url_code", "email_link", "sms_link"]),
});

const submitParentSurveySchema = z.object({
  positiveDifferenceChild: z.string().optional(),
  childMorePrepared: z.boolean().optional(),
  childMoreMotivated: z.boolean().optional(),
  biggestChanges: z.string().optional(),
  submissionChannel: z.enum(["coach_handover", "qr_code", "url_code", "email_link", "sms_link"]),
});

router.post("/public/survey/submit", checkModuleEnabled("lms"), lmsSessionMiddleware, requireSessionType("student_survey", "parent_survey"), lmsSessionActivityLog, async (req, res): Promise<void> => {
  const session = req.lmsSession!;
  if (!await rateLimit(submitRateLimiter, session.id, res)) return;

  try {
    const studentId = session.scopeId;

    if (session.tokenType === "parent_survey") {
      const parsed = submitParentSurveySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
        return;
      }

      // Duplicate check — one parent survey per student
      const [existing] = await db
        .select({ id: lmsParentSurveysTable.id })
        .from(lmsParentSurveysTable)
        // @ts-ignore
        .where(and(
          // @ts-ignore
          eq(lmsParentSurveysTable.studentId, studentId),
          // @ts-ignore
          eq(lmsParentSurveysTable.tenantId, session.tenantId),
        ) as any);

      if (existing) {
        res.status(409).json({ error: "You've already submitted this survey" });
        return;
      }

      const id = generateId("lps");
      await db.insert(lmsParentSurveysTable).values({
        id,
        tenantId: session.tenantId,
        studentId,
        positiveDifferenceChild: parsed.data.positiveDifferenceChild ?? null,
        childMorePrepared: parsed.data.childMorePrepared ?? null,
        childMoreMotivated: parsed.data.childMoreMotivated ?? null,
        biggestChanges: parsed.data.biggestChanges ?? null,
        submissionChannel: parsed.data.submissionChannel,
        submittedViaToken: session.tokenId,
      } as any);

      res.status(201).json({ id, submitted: true });
      return;
    }

    // student_survey path
    const parsed = submitStudentSurveySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
      return;
    }

    // Duplicate check — UNIQUE constraint on (studentId, timePoint)
    const [existing] = await db
      .select({ id: lmsStudentSurveysTable.id })
      .from(lmsStudentSurveysTable)
      // @ts-ignore
      .where(and(
        // @ts-ignore
        eq(lmsStudentSurveysTable.studentId, studentId),
        // @ts-ignore
        eq(lmsStudentSurveysTable.timePoint, parsed.data.timePoint),
      ) as any);

    if (existing) {
      res.status(409).json({ error: "You've already submitted this survey" });
      return;
    }

    const id = generateId("lss");
    await db.insert(lmsStudentSurveysTable).values({
      id,
      tenantId: session.tenantId,
      studentId,
      timePoint: parsed.data.timePoint,
      enjoyedProgramme: parsed.data.enjoyedProgramme ?? null,
      preparedFuture: parsed.data.preparedFuture ?? null,
      motivatedSchool: parsed.data.motivatedSchool ?? null,
      shownSkills: parsed.data.shownSkills ?? null,
      betterFutureIdeas: parsed.data.betterFutureIdeas ?? null,
      positiveDifference: parsed.data.positiveDifference ?? null,
      threeWords: parsed.data.threeWords ?? null,
      favouriteThing: parsed.data.favouriteThing ?? null,
      whyFavourite: parsed.data.whyFavourite ?? null,
      changeOneThing: parsed.data.changeOneThing ?? null,
      otherComments: parsed.data.otherComments ?? null,
      submissionChannel: parsed.data.submissionChannel,
      submittedViaToken: session.tokenId,
    } as any);

    res.status(201).json({ id, submitted: true });
  } catch (err) {
    console.error("[lms/public/survey/submit POST]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /api/lms/public/teacher ─────────────────────────────────────────────────

router.get("/public/teacher", checkModuleEnabled("lms"), lmsSessionMiddleware, requireSessionType("teacher_feedback"), lmsSessionActivityLog, async (req, res): Promise<void> => {
  const session = req.lmsSession!;
  if (!await rateLimit(reportRateLimiter, session.id, res)) return;

  try {
    // scopeId = organisationId for teacher_feedback tokens
    const organisationId = session.scopeId;

    // Get all students in cohorts belonging to this organisation
    const students = await db
      .select({
        id: studentsTable.id,
        firstName: studentsTable.firstName,
        lastName: studentsTable.lastName,
        cohortId: studentsTable.cohortId,
      })
      .from(studentsTable)
      // @ts-ignore
      .where(and(
        // @ts-ignore
        eq(studentsTable.tenantId, session.tenantId),
        // @ts-ignore
        sql`${studentsTable.cohortId} IN (
          SELECT id FROM programme_cohorts
          WHERE tenant_id = ${session.tenantId}
          AND (SELECT organization_id FROM programmes WHERE id = programme_cohorts.programme_id LIMIT 1) = ${organisationId}
        )`,
      ) as any);

    // Get existing feedback for these students
    const studentIds = students.map((s) => s.id);
    const feedback = studentIds.length > 0
      ? await db
          .select({ studentId: lmsTeacherFeedbackTable.studentId, isComplete: lmsTeacherFeedbackTable.isComplete })
          .from(lmsTeacherFeedbackTable)
          // @ts-ignore
          .where(eq(lmsTeacherFeedbackTable.tenantId, session.tenantId))
      : [];

    const result = students.map((s) => ({
      id: s.id,
      firstName: s.firstName,
      lastName: s.lastName,
      cohortId: s.cohortId,
      feedbackSubmitted: feedback.find((f) => f.studentId === s.id)?.isComplete ?? false,
    }));

    res.json({ students: result });
  } catch (err) {
    console.error("[lms/public/teacher GET]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /api/lms/public/teacher/submit ─────────────────────────────────────────

const submitTeacherFeedbackSchema = z.object({
  studentId: z.string().min(1),
  aspirationChange: z.boolean().optional(),
  attendanceChange: z.boolean().optional(),
  behaviourChange: z.boolean().optional(),
  academicProgressChange: z.boolean().optional(),
  freeTextReflection: z.string().optional(),
});

router.post("/public/teacher/submit", checkModuleEnabled("lms"), lmsSessionMiddleware, requireSessionType("teacher_feedback"), lmsSessionActivityLog, async (req, res): Promise<void> => {
  const session = req.lmsSession!;
  if (!await rateLimit(submitRateLimiter, session.id, res)) return;

  const parsed = submitTeacherFeedbackSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    return;
  }

  try {
    const { studentId, ...fields } = parsed.data;

    // Verify student belongs to this organisation scope
    const [student] = await db
      .select({ id: studentsTable.id, cohortId: studentsTable.cohortId })
      .from(studentsTable)
      // @ts-ignore
      .where(and(
        // @ts-ignore
        eq(studentsTable.id, studentId),
        // @ts-ignore
        eq(studentsTable.tenantId, session.tenantId),
        // @ts-ignore
        sql`${studentsTable.cohortId} IN (
          SELECT id FROM programme_cohorts
          WHERE tenant_id = ${session.tenantId}
          AND (SELECT organization_id FROM programmes WHERE id = programme_cohorts.programme_id LIMIT 1) = ${session.scopeId}
        )`,
      ) as any);

    if (!student) {
      res.status(403).json({ error: "Student not found in your school" });
      return;
    }

    const isComplete = !!(fields.freeTextReflection);

    // Upsert teacher feedback
    const [existing] = await db
      .select({ id: lmsTeacherFeedbackTable.id })
      .from(lmsTeacherFeedbackTable)
      // @ts-ignore
      .where(and(
        // @ts-ignore
        eq(lmsTeacherFeedbackTable.studentId, studentId),
        // @ts-ignore
        eq(lmsTeacherFeedbackTable.tenantId, session.tenantId),
      ) as any);

    if (existing) {
      await db
        .update(lmsTeacherFeedbackTable)
        .set({
          ...fields,
          isComplete,
          submittedViaToken: session.tokenId,
          updatedAt: new Date(),
        } as any)
        // @ts-ignore
        .where(eq(lmsTeacherFeedbackTable.id, existing.id));
      res.json({ id: existing.id, isComplete });
    } else {
      const id = generateId("ltf");
      await db.insert(lmsTeacherFeedbackTable).values({
        id,
        tenantId: session.tenantId,
        studentId,
        ...fields,
        isComplete,
        submittedViaToken: session.tokenId,
      } as any);
      res.status(201).json({ id, isComplete });
    }
  } catch (err) {
    console.error("[lms/public/teacher/submit POST]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /api/lms/public/report ──────────────────────────────────────────────────

router.get("/public/report", checkModuleEnabled("lms"), lmsSessionMiddleware, requireSessionType("student_report"), lmsSessionActivityLog, async (req, res): Promise<void> => {
  const session = req.lmsSession!;
  if (!await rateLimit(reportRateLimiter, session.id, res)) return;

  try {
    const studentId = session.scopeId;
    if (!await assertConsent(studentId, session.tenantId, res)) return;
    const [student] = await db
      .select({
        id: studentsTable.id,
        firstName: studentsTable.firstName,
        lastName: studentsTable.lastName,
        cohortId: studentsTable.cohortId,
      })
      .from(studentsTable)
      // @ts-ignore
      .where(and(
        // @ts-ignore
        eq(studentsTable.id, studentId),
        // @ts-ignore
        eq(studentsTable.tenantId, session.tenantId),
      ) as any);

    if (!student) {
      res.status(404).json({ error: "Report not found" });
      return;
    }

    // Look up the latest ready student_personal report for this student
    const [readyReport] = await db
      .select({ id: lmsReportsTable.id, status: lmsReportsTable.status, fileReference: lmsReportsTable.fileReference, createdAt: lmsReportsTable.createdAt })
      .from(lmsReportsTable)
      // @ts-ignore
      .where(and(
        eq(lmsReportsTable.studentId, student.id),
        eq(lmsReportsTable.tenantId, session.tenantId),
        eq(lmsReportsTable.reportType, "student_personal"),
        inArray(lmsReportsTable.status, ["ready", "sent"]),
      ))
      .orderBy(desc(lmsReportsTable.createdAt))
      .limit(1);

    res.json({
      studentId: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      cohortId: student.cohortId,
      reportAvailable: !!readyReport && (readyReport.status === "ready" || readyReport.status === "sent"),
      reportId: readyReport?.id ?? null,
      reportStatus: readyReport?.status ?? null,
    });
  } catch (err) {
    console.error("[lms/public/report GET]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /api/lms/public/report/pdf ──────────────────────────────────────────────

router.get("/public/report/pdf", checkModuleEnabled("lms"), lmsSessionMiddleware, requireSessionType("student_report"), lmsSessionActivityLog, async (req, res): Promise<void> => {
  const session = req.lmsSession!;
  if (!await rateLimit(reportRateLimiter, session.id, res)) return;

  if (!await assertConsent(session.scopeId, session.tenantId, res)) return;

  try {
    const studentId = session.scopeId;

    // Find the latest ready student_personal report for this student
    const [readyReport] = await db
      .select({ id: lmsReportsTable.id, status: lmsReportsTable.status, fileReference: lmsReportsTable.fileReference })
      .from(lmsReportsTable)
      // @ts-ignore
      .where(and(
        eq(lmsReportsTable.studentId, studentId),
        eq(lmsReportsTable.tenantId, session.tenantId),
        eq(lmsReportsTable.reportType, "student_personal"),
        inArray(lmsReportsTable.status, ["ready", "sent"]),
      ))
      .orderBy(desc(lmsReportsTable.createdAt))
      .limit(1);

    if (!readyReport || (readyReport.status !== "ready" && readyReport.status !== "sent") || !readyReport.fileReference) {
      res.status(404).json({ error: "Report not available yet" });
      return;
    }

    const outputDir = process.env.LMS_PDF_OUTPUT_DIR ?? path.join(process.cwd(), "tmp/lms-reports");
    // fileReference is stored as "lms-reports/filename.pdf" — extract just the filename
    const filename = path.basename(readyReport.fileReference);
    const filePath = path.join(outputDir, filename);

    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: "Report file not found" });
      return;
    }

    // Detect whether this is a real PDF or an HTML fallback
    const content = fs.readFileSync(filePath);
    const isPdfPending = content.toString("utf-8", 0, 12).startsWith("PDF_PENDING:");

    if (isPdfPending) {
      // Serve the HTML fallback
      const htmlPath = content.toString("utf-8").replace("PDF_PENDING:", "").trim();
      if (!fs.existsSync(htmlPath)) {
        res.status(404).json({ error: "Report file not found" });
        return;
      }
      res.setHeader("Content-Type", "text/html");
      res.setHeader("Content-Disposition", `inline; filename="impact-report.html"`);
      fs.createReadStream(htmlPath).pipe(res);
    } else {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="impact-report.pdf"`);
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (err) {
    console.error("[lms/public/report/pdf GET]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /api/lms/public/logout ─────────────────────────────────────────────
// Clears the lms_session cookie. No auth required — clearing a cookie is always safe.
// Called by the coach after handing the device back from a student survey session.

router.post("/public/logout", checkModuleEnabled("lms"), (req, res) => {
  res.clearCookie("lms_session", { path: "/" });
  res.json({ ok: true });
});

export default router;
