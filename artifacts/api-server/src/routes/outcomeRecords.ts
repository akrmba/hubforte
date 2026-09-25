import { Router, type IRouter } from "express";
import { db, outcomeRecordsTable, outcomeFrameworksTable, studentsTable, programmesTable, programmeCohortsTable, programmeSessionsTable, usersTable } from "@workspace/db";
import { eq, and, desc, count, inArray, sql } from "drizzle-orm";
import { authMiddleware, requireRole, denyDevRoles } from "../lib/auth";
import { generateId } from "../lib/id";
import { sanitiseInput } from "../lib/sanitise";
import { checkModuleEnabled } from "../lib/featureFlags";
const ort = outcomeRecordsTable as any;
const ofw = outcomeFrameworksTable as any;

const router: IRouter = Router();

// GET /outcome-records?studentId=xxx&programmeId=xxx&cohortId=xxx&frameworkId=xxx&assessmentType=xxx&status=xxx&page=1&limit=20
router.get("/", authMiddleware, denyDevRoles, checkModuleEnabled("outcomes"), async (req, res): Promise<void> => {
  const { 
    studentId, programmeId, cohortId, sessionId, frameworkId, 
    assessmentType, status, startDate, endDate, page = "1", limit = "20" 
  } = req.query as Record<string, string>;
  
  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(100, parseInt(limit, 10));
  const offset = (pageNum - 1) * limitNum;
  const tenantId = req.user!.tenantId;

  const conditions = [];
  if (tenantId) conditions.push(eq(ort.tenantId, tenantId));
  if (studentId) conditions.push(eq(ort.studentId, studentId));
  if (programmeId) conditions.push(eq(ort.programmeId, programmeId));
  if (cohortId) conditions.push(eq(ort.cohortId, cohortId));
  if (sessionId) conditions.push(eq(ort.sessionId, sessionId));
  if (frameworkId) conditions.push(eq(ort.outcomeFrameworkId, frameworkId));
  if (assessmentType) conditions.push(eq(ort.assessmentType, assessmentType as any));
  if (status) conditions.push(eq(ort.status, status as any));
  
  // Date range filtering
  if (startDate) conditions.push(sql`${ort.assessmentDate} >= ${startDate}`);
  if (endDate) conditions.push(sql`${ort.assessmentDate} <= ${endDate}`);

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [records, totalResult] = await Promise.all([
    db.select().from(ort).where(where).limit(limitNum).offset(offset).orderBy(desc(ort.assessmentDate), desc(ort.createdAt)),
    db.select({ count: count() }).from(ort).where(where),
  ]);

  const total = totalResult[0]?.count ?? 0;
  res.json({ data: records, total, page: pageNum, totalPages: Math.ceil(total / limitNum) });
});

// GET /outcome-records/:id
router.get("/:id", authMiddleware, denyDevRoles, checkModuleEnabled("outcomes"), async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const tenantId = req.user!.tenantId;

  const [record] = await db.select().from(ort)
    .where(and(eq(ort.id, rawId), tenantId ? eq(ort.tenantId, tenantId) : undefined));

  if (!record) { res.status(404).json({ error: "Outcome record not found" }); return; }
  res.json(record);
});

// POST /outcome-records
router.post("/", authMiddleware, denyDevRoles, checkModuleEnabled("outcomes"), requireRole("OPERATOR", "MANAGER", "ADMIN"), async (req, res): Promise<void> => {
  const user = req.user!;
  const raw = sanitiseInput(req.body as Record<string, unknown>) as any;

  // Validate required fields
  if (!raw.outcomeFrameworkId || !raw.studentId || !raw.assessmentDate || !raw.assessmentType) {
    res.status(400).json({ error: "Missing required fields: outcomeFrameworkId, studentId, assessmentDate, assessmentType" });
    return;
  }

  // Verify framework exists and belongs to tenant
  const [framework] = await db.select().from(outcomeFrameworksTable)
    .where(and(
      eq(outcomeFrameworksTable.id, raw.outcomeFrameworkId),
      eq(outcomeFrameworksTable.tenantId, user.tenantId!),
      eq(outcomeFrameworksTable.status, "ACTIVE")
    ));

  if (!framework) {
    res.status(404).json({ error: "Active outcome framework not found" });
    return;
  }

  const recordId = generateId("orec");
  const newRecord = {
    id: recordId,
    tenantId: user.tenantId,
    outcomeFrameworkId: raw.outcomeFrameworkId,
    studentId: raw.studentId,
    programmeId: raw.programmeId,
    cohortId: raw.cohortId,
    sessionId: raw.sessionId,
    assessmentDate: raw.assessmentDate,
    assessorUserId: raw.assessorUserId ?? user.id,
    assessmentType: raw.assessmentType,
    scores: raw.scores ?? {},
    notes: raw.notes,
    evidenceUrl: raw.evidenceUrl,
    status: raw.status ?? "DRAFT",
    metadata: raw.metadata ?? {},
    createdBy: user.id,
  };

  try {
    const [inserted] = (await db.insert(ort).values(newRecord).returning()) as any[];
    res.status(201).json(inserted);
  } catch (error) {
    console.error("Error creating outcome record:", error);
    res.status(500).json({ error: "Failed to create outcome record" });
  }
});

// PUT /outcome-records/:id
router.put("/:id", authMiddleware, denyDevRoles, checkModuleEnabled("outcomes"), requireRole("OPERATOR", "MANAGER", "ADMIN"), async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const user = req.user!;
  const raw = sanitiseInput(req.body as Record<string, unknown>) as any;

  // Check if record exists and belongs to tenant
  const [existing] = await db.select().from(ort)
    .where(and(eq(ort.id, rawId), eq(ort.tenantId, user.tenantId)));

  if (!existing) { res.status(404).json({ error: "Outcome record not found" }); return; }

  // If record is already VERIFIED, only ADMIN can modify
  if (existing.status === "VERIFIED" && !user.role.includes("ADMIN")) {
    res.status(403).json({ error: "Only ADMIN can modify verified outcome records" });
    return;
  }

  // Don't allow changing certain fields
  const { id, tenantId, outcomeFrameworkId, studentId, createdBy, createdAt, ...updateData } = raw;
  
  const update = {
    ...updateData,
    updatedAt: new Date(),
  };

  // If status is changing to VERIFIED, set verifiedBy and verifiedAt
  if (updateData.status === "VERIFIED" && existing.status !== "VERIFIED") {
    update.verifiedByUserId = user.id;
    update.verifiedAt = new Date();
  }

  try {
    const [updated] = await db.update(ort)
      .set(update)
      .where(and(eq(ort.id, rawId), eq(ort.tenantId, user.tenantId)))
      .returning();
    res.json(updated);
  } catch (error) {
    console.error("Error updating outcome record:", error);
    res.status(500).json({ error: "Failed to update outcome record" });
  }
});

// POST /outcome-records/batch
router.post("/batch", authMiddleware, denyDevRoles, checkModuleEnabled("outcomes"), requireRole("OPERATOR", "MANAGER", "ADMIN"), async (req, res): Promise<void> => {
  const user = req.user!;
  const { records, frameworkId, programmeId, cohortId, sessionId, assessmentDate, assessmentType } = req.body as any;

  if (!records || !Array.isArray(records) || records.length === 0) {
    res.status(400).json({ error: "Missing or empty records array" });
    return;
  }

  if (!frameworkId || !assessmentDate || !assessmentType) {
    res.status(400).json({ error: "Missing required fields: frameworkId, assessmentDate, assessmentType" });
    return;
  }

  // Verify framework exists and belongs to tenant
  const [framework] = await db.select().from(outcomeFrameworksTable)
    .where(and(
      eq(outcomeFrameworksTable.id, frameworkId),
      eq(outcomeFrameworksTable.tenantId, user.tenantId!),
      eq(outcomeFrameworksTable.status, "ACTIVE")
    ));

  if (!framework) {
    res.status(404).json({ error: "Active outcome framework not found" });
    return;
  }

  const batchRecords = records.map((record: any) => ({
    id: generateId("orec"),
    tenantId: user.tenantId,
    outcomeFrameworkId: frameworkId,
    studentId: record.studentId,
    programmeId: programmeId,
    cohortId: cohortId,
    sessionId: sessionId,
    assessmentDate: assessmentDate,
    assessorUserId: user.id,
    assessmentType: assessmentType,
    scores: record.scores ?? {},
    notes: record.notes,
    evidenceUrl: record.evidenceUrl,
    status: "DRAFT",
    metadata: record.metadata ?? {},
    createdBy: user.id,
  }));

  try {
    const inserted = await db.insert(ort).values(batchRecords).returning() as any[];
    res.status(201).json({ message: `Created ${inserted.length} outcome records`, records: inserted });
  } catch (error) {
    console.error("Error creating batch outcome records:", error);
    res.status(500).json({ error: "Failed to create batch outcome records" });
  }
});

// GET /outcome-records/summary/:studentId
router.get("/summary/:studentId", authMiddleware, denyDevRoles, checkModuleEnabled("outcomes"), async (req, res): Promise<void> => {
  const studentId = Array.isArray(req.params.studentId) ? req.params.studentId[0] : req.params.studentId;
  const tenantId = req.user!.tenantId;

  const records = await db.select().from(ort)
    .where(and(
      eq(ort.studentId, studentId),
      eq(ort.tenantId, tenantId),
      eq(ort.status, "VERIFIED")
    ))
    .orderBy(desc(ort.assessmentDate));

  // Group by framework and assessment type
  const summary: Record<string, any> = {};
  records.forEach(record => {
    if (!summary[record.outcomeFrameworkId]) {
      summary[record.outcomeFrameworkId] = {};
    }
    summary[record.outcomeFrameworkId][record.assessmentType] = record;
  });

  res.json({ studentId, summary });
});

// GET /outcome-records/comparison/:studentId?frameworkId=xxx
router.get("/comparison/:studentId", authMiddleware, denyDevRoles, checkModuleEnabled("outcomes"), async (req, res): Promise<void> => {
  const studentId = Array.isArray(req.params.studentId) ? req.params.studentId[0] : req.params.studentId;
  const { frameworkId } = req.query as Record<string, string>;
  const tenantId = req.user!.tenantId;

  const conditions = [
    eq(ort.studentId, studentId),
    eq(ort.tenantId, tenantId),
    eq(ort.status, "VERIFIED"),
  ];
  
  if (frameworkId) {
    conditions.push(eq(ort.outcomeFrameworkId, frameworkId));
  }

  const records = await db.select().from(ort)
    .where(and(...conditions))
    .orderBy(desc(ort.assessmentDate));

  // Find baseline and endline records for comparison
  const baseline = records.find(r => r.assessmentType === "BASELINE");
  const endline = records.find(r => r.assessmentType === "ENDLINE");
  const midline = records.find(r => r.assessmentType === "MIDLINE");
  const followUp = records.find(r => r.assessmentType === "FOLLOW_UP");

  // Calculate progress if both baseline and endline exist
  let progress = null;
  if (baseline && endline && baseline.scores && endline.scores) {
    const baselineScores = baseline.scores as Record<string, any>;
    const endlineScores = endline.scores as Record<string, any>;
    
    progress = Object.keys(baselineScores).reduce((acc: Record<string, any>, key) => {
      if (endlineScores[key] !== undefined) {
        const baselineVal = parseFloat(baselineScores[key]);
        const endlineVal = parseFloat(endlineScores[key]);
        if (!isNaN(baselineVal) && !isNaN(endlineVal)) {
          acc[key] = {
            baseline: baselineVal,
            endline: endlineVal,
            change: endlineVal - baselineVal,
            percentChange: baselineVal !== 0 ? ((endlineVal - baselineVal) / baselineVal) * 100 : null,
          };
        }
      }
      return acc;
    }, {});
  }

  res.json({
    studentId,
    frameworkId,
    baseline,
    midline,
    endline,
    followUp,
    progress,
    allRecords: records,
  });
});

export default router;