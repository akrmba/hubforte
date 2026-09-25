import { Router } from "express";
import { db, lmsTeacherFeedbackTable, lmsAccessTokensTable, studentsTable, programmeCohortsTable } from "@workspace/db";
import { eq, and, sql, isNull, gt } from "drizzle-orm";
import { authMiddleware, requireRole } from "../../lib/auth";
import { generateId } from "../../lib/id";
import { z } from "zod";

const router = Router();

// GET /api/lms/cohorts/:cohortId/teacher-feedback
router.get("/cohorts/:cohortId/teacher-feedback", authMiddleware, requireRole("MANAGER", "ADMIN", "SUPER_ADMIN"), async (req, res): Promise<void> => {
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

    // Get all students in cohort, join teacher feedback
    const students = await db
      .select({ id: studentsTable.id, firstName: studentsTable.firstName, lastName: studentsTable.lastName })
      .from(studentsTable)
      // @ts-ignore -- Drizzle and() overload
      .where(and(eq(studentsTable.cohortId, cohortId), eq(studentsTable.tenantId, tenantId)));

    const feedback = await db
      .select()
      .from(lmsTeacherFeedbackTable)
      .where(eq(lmsTeacherFeedbackTable.tenantId, tenantId));

    const result = students.map((s) => ({
      student: s,
      feedback: feedback.find((f) => f.studentId === s.id) ?? null,
    }));

    res.json(result);
  } catch (err) {
    console.error("[lms/cohorts/:cohortId/teacher-feedback GET]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/lms/cohorts/:cohortId/teacher-links
router.get("/cohorts/:cohortId/teacher-links", authMiddleware, requireRole("MANAGER", "ADMIN", "SUPER_ADMIN"), async (req, res): Promise<void> => {
  try {
    const user = req.user!;
    const tenantId = user.tenantId!;
    const cohortId = req.params.cohortId as string;

    const [cohort] = await db
      .select({
        id: programmeCohortsTable.id,
        programmeManagerId: programmeCohortsTable.programmeManagerId,
        organizationId: sql<string>`(SELECT organization_id FROM programmes WHERE id = ${programmeCohortsTable.programmeId} LIMIT 1)`,
      })
      .from(programmeCohortsTable)
      // @ts-ignore -- Drizzle and() overload
      .where(and(eq(programmeCohortsTable.id, cohortId), eq(programmeCohortsTable.tenantId, tenantId)));
    if (!cohort) { res.status(404).json({ error: "Cohort not found" }); return; }
    if (user.role === "MANAGER" && cohort.programmeManagerId !== user.id) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    // Teacher tokens are organisation-scoped (spec: scopeType="organisation", scopeId=organisation id)
    // Organisation id is derived from the cohort's programme
    const organisationId = cohort.organizationId;
    const now = new Date();
    const tokens = await db
      .select({
        id: lmsAccessTokensTable.id,
        tokenType: lmsAccessTokensTable.tokenType,
        scopeType: lmsAccessTokensTable.scopeType,
        scopeId: lmsAccessTokensTable.scopeId,
        expiresAt: lmsAccessTokensTable.expiresAt,
        useCount: lmsAccessTokensTable.useCount,
        maxUses: lmsAccessTokensTable.maxUses,
        createdAt: lmsAccessTokensTable.createdAt,
      })
      .from(lmsAccessTokensTable)
      // @ts-ignore -- Drizzle and() overload
      .where(and(
        // @ts-ignore -- Drizzle eq() overload
        eq(lmsAccessTokensTable.tenantId, tenantId),
        // @ts-ignore -- Drizzle eq() overload
        eq(lmsAccessTokensTable.tokenType, "teacher_feedback"),
        // @ts-ignore -- Drizzle eq() overload
        eq(lmsAccessTokensTable.scopeId, organisationId),
        // @ts-ignore -- Drizzle isNull() overload
        isNull(lmsAccessTokensTable.revokedAt),
        // @ts-ignore -- Drizzle gt() overload
        gt(lmsAccessTokensTable.expiresAt, now),
        // @ts-ignore -- Drizzle sql overload
        sql`${lmsAccessTokensTable.useCount} < ${lmsAccessTokensTable.maxUses}`,
      ) as any);

    res.json(tokens);
  } catch (err) {
    console.error("[lms/cohorts/:cohortId/teacher-links GET]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

const generateTeacherLinksSchema = z.object({
  recipients: z.array(z.object({
    email: z.string().email(),
    name: z.string().optional(),
  })).min(1).max(10),
});

// POST /api/lms/cohorts/:cohortId/teacher-links
// Generates token records (email sending is a Phase 3 worker job)
router.post("/cohorts/:cohortId/teacher-links", authMiddleware, requireRole("MANAGER", "ADMIN", "SUPER_ADMIN"), async (req, res): Promise<void> => {
  try {
    const user = req.user!;
    const tenantId = user.tenantId!;
    const cohortId = req.params.cohortId as string;

    const [cohort] = await db
      .select({
        id: programmeCohortsTable.id,
        programmeManagerId: programmeCohortsTable.programmeManagerId,
        organizationId: sql<string>`(SELECT organization_id FROM programmes WHERE id = ${programmeCohortsTable.programmeId} LIMIT 1)`,
      })
      .from(programmeCohortsTable)
      // @ts-ignore -- Drizzle and() overload
      .where(and(eq(programmeCohortsTable.id, cohortId), eq(programmeCohortsTable.tenantId, tenantId)));
    if (!cohort) { res.status(404).json({ error: "Cohort not found" }); return; }
    if (user.role === "MANAGER" && cohort.programmeManagerId !== user.id) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    const parsed = generateTeacherLinksSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
      return;
    }
    const { recipients } = parsed.data;
    const organisationId = cohort.organizationId;

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // 14 days
    const created: string[] = [];

    for (const recipient of recipients) {
      const { randomBytes, createHash } = await import("crypto");
      const inviteToken = randomBytes(32).toString("hex");
      const tokenHash = createHash("sha256").update(inviteToken).digest("hex");
      const tokenId = generateId("ltk");

      await db.insert(lmsAccessTokensTable).values({
        id: tokenId,
        tenantId,
        tokenHash,
        tokenType: "teacher_feedback",
        scopeType: "organisation",
        scopeId: organisationId,
        expiresAt,
        createdBy: user.id,
        maxUses: 10,
        useCount: 0,
        createdAt: now,
      } as any);

      created.push(tokenId);
      // Note: email delivery is handled by lms_send_survey_email worker job (Phase 3)
    }

    res.status(201).json({ created: created.length, tokenIds: created });
  } catch (err) {
    console.error("[lms/cohorts/:cohortId/teacher-links POST]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/lms/tokens/:tokenId — revoke a token
router.delete("/tokens/:tokenId", authMiddleware, requireRole("MANAGER", "ADMIN", "SUPER_ADMIN"), async (req, res): Promise<void> => {
  try {
    const user = req.user!;
    const tenantId = user.tenantId!;
    const tokenId = req.params.tokenId as string;

    const [token] = await db
      .select({
        id: lmsAccessTokensTable.id,
        createdBy: lmsAccessTokensTable.createdBy,
        scopeType: lmsAccessTokensTable.scopeType,
        scopeId: lmsAccessTokensTable.scopeId,
      })
      .from(lmsAccessTokensTable)
      // @ts-ignore -- Drizzle and() overload
      .where(and(eq(lmsAccessTokensTable.id, tokenId), eq(lmsAccessTokensTable.tenantId, tenantId)));
    if (!token) { res.status(404).json({ error: "Token not found" }); return; }

    // PM scoping: MANAGER may only revoke tokens scoped to organisations they manage
    if (user.role === "MANAGER") {
      // Derive cohorts owned by this manager and check the token's scopeId matches one of their organisations
      const ownedCohorts = await db
        .select({
          organizationId: sql<string>`(SELECT organization_id FROM programmes WHERE id = ${programmeCohortsTable.programmeId} LIMIT 1)`,
        })
        .from(programmeCohortsTable)
        // @ts-ignore -- Drizzle and() overload
        .where(and(
          // @ts-ignore
          eq(programmeCohortsTable.tenantId, tenantId),
          // @ts-ignore
          eq(programmeCohortsTable.programmeManagerId, user.id),
        ) as any);
      const ownedOrgIds = ownedCohorts.map((c) => c.organizationId).filter(Boolean);
      if (!ownedOrgIds.includes(token.scopeId)) {
        res.status(403).json({ error: "Forbidden" }); return;
      }
    }

    await db
      .update(lmsAccessTokensTable)
      .set({ revokedAt: new Date() } as any)
      // @ts-ignore -- chain broken by as any cast
      .where(eq(lmsAccessTokensTable.id, tokenId));

    res.json({ id: tokenId, revoked: true });
  } catch (err) {
    console.error("[lms/tokens/:tokenId DELETE]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
