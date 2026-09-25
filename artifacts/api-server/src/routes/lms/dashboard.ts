import { Router } from "express";
import { db, programmeCohortsTable, studentsTable, programmeSessionsTable, sessionAttendanceTable, lmsCoachNarrativesTable, lmsStudentSurveysTable, lmsTalentScoresTable, organizationsTable } from "@workspace/db";
import { eq, and, count, sql } from "drizzle-orm";
import { authMiddleware, requireRole } from "../../lib/auth";

const router = Router();

// GET /api/lms/dashboard — cross-cohort overview
router.get("/", authMiddleware, requireRole("MANAGER", "ADMIN", "SUPER_ADMIN"), async (req, res): Promise<void> => {
  try {
    const user = req.user!;
    const tenantId = user.tenantId!;

    const cohortFilters: any[] = [eq(programmeCohortsTable.tenantId, tenantId)];
    if (user.role === "MANAGER") {
      cohortFilters.push(eq(programmeCohortsTable.programmeManagerId, user.id));
    }

    const cohorts = await db
      .select({
        id: programmeCohortsTable.id,
        cohortName: programmeCohortsTable.cohortName,
        programmeType: programmeCohortsTable.programmeType,
        lmsLifecycleStatus: programmeCohortsTable.lmsLifecycleStatus,
        status: programmeCohortsTable.status,
        startDate: programmeCohortsTable.startDate,
        endDate: programmeCohortsTable.endDate,
        leadTeacherName: programmeCohortsTable.leadTeacherName,
        minAttendanceSessions: programmeCohortsTable.minAttendanceSessions,
        programmeManagerId: programmeCohortsTable.programmeManagerId,
      })
      .from(programmeCohortsTable)
      // @ts-ignore -- Drizzle and() overload
      .where(and(...cohortFilters))
      .orderBy(programmeCohortsTable.createdAt);

    // For each cohort, get student count and quick stats
    const cohortIds = cohorts.map((c) => c.id);
    const allStudents = cohortIds.length > 0
      ? await db.select({ id: studentsTable.id, cohortId: studentsTable.cohortId, completionStatus: studentsTable.completionStatus })
          .from(studentsTable)
          .where(eq(studentsTable.tenantId, tenantId))
      : [];

    const cards = cohorts.map((cohort) => {
      const cohortStudents = allStudents.filter((s) => s.cohortId === cohort.id);
      const activeStudents = cohortStudents.filter((s) => s.completionStatus !== "WITHDRAWN");
      const withdrawnStudents = cohortStudents.filter((s) => s.completionStatus === "WITHDRAWN");
      return {
        ...cohort,
        totalStudents: cohortStudents.length,
        activeStudents: activeStudents.length,
        withdrawnStudents: withdrawnStudents.length,
      };
    });

    res.json({
      totalCohorts: cohorts.length,
      cohorts: cards,
    });
  } catch (err) {
    console.error("[lms/dashboard GET]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/lms/dashboard/school-comparison — Admin only
router.get("/school-comparison", authMiddleware, requireRole("ADMIN", "SUPER_ADMIN"), async (req, res): Promise<void> => {
  try {
    const user = req.user!;
    const tenantId = user.tenantId!;

    // Group cohorts by organisation (school)
    const cohorts = await db
      .select({
        id: programmeCohortsTable.id,
        cohortName: programmeCohortsTable.cohortName,
        programmeType: programmeCohortsTable.programmeType,
        lmsLifecycleStatus: programmeCohortsTable.lmsLifecycleStatus,
        programmeId: programmeCohortsTable.programmeId,
      })
      .from(programmeCohortsTable)
      .where(eq(programmeCohortsTable.tenantId, tenantId));

    const allStudents = await db
      .select({ cohortId: studentsTable.cohortId, completionStatus: studentsTable.completionStatus, organizationId: studentsTable.organizationId })
      .from(studentsTable)
      .where(eq(studentsTable.tenantId, tenantId));

    // Group by school (organizationId)
    const schoolMap: Record<string, { organizationId: string; cohortCount: number; studentCount: number; activeStudents: number }> = {};
    for (const student of allStudents) {
      const orgId = student.organizationId ?? "unknown";
      if (!schoolMap[orgId]) schoolMap[orgId] = { organizationId: orgId, cohortCount: 0, studentCount: 0, activeStudents: 0 };
      schoolMap[orgId].studentCount++;
      if (student.completionStatus !== "WITHDRAWN") schoolMap[orgId].activeStudents++;
    }
    for (const cohort of cohorts) {
      const cohortStudents = allStudents.filter((s) => s.cohortId === cohort.id);
      const orgId = cohortStudents[0]?.organizationId ?? "unknown";
      if (schoolMap[orgId]) schoolMap[orgId].cohortCount++;
    }

    res.json({ schools: Object.values(schoolMap) });
  } catch (err) {
    console.error("[lms/dashboard/school-comparison GET]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
