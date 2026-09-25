import { Router, type IRouter } from "express";
import { db, consentRecordsTable, studentsTable, parentGuardiansTable, programmesTable, usersTable } from "@workspace/db";
import { eq, and, desc, count, sql } from "drizzle-orm";
import { authMiddleware, requireRole, denyDevRoles } from "../lib/auth";
import { generateId } from "../lib/id";
import { sanitiseInput } from "../lib/sanitise";
import { checkModuleEnabled } from "../lib/featureFlags";

const router: IRouter = Router();

// GET /consent-records?studentId=xxx&parentGuardianId=xxx&programmeId=xxx&consentType=xxx&status=xxx&expiringSoon=xxx&page=1&limit=20
router.get("/", authMiddleware, denyDevRoles, checkModuleEnabled("consent"), async (req, res): Promise<void> => {
  const { 
    studentId, parentGuardianId, programmeId, consentType, status, 
    expiringSoon, page = "1", limit = "20" 
  } = req.query as Record<string, string>;
  
  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(100, parseInt(limit, 10));
  const offset = (pageNum - 1) * limitNum;
  const tenantId = req.user!.tenantId;

  const conditions = [];
  if (tenantId) conditions.push(eq(consentRecordsTable.tenantId, tenantId));
  if (studentId) conditions.push(eq(consentRecordsTable.studentId, studentId));
  if (parentGuardianId) conditions.push(eq(consentRecordsTable.parentGuardianId, parentGuardianId));
  if (programmeId) conditions.push(eq(consentRecordsTable.programmeId, programmeId));
  if (consentType) conditions.push(eq(consentRecordsTable.consentType, consentType as any));
  if (status) conditions.push(eq(consentRecordsTable.status, status as any));
  
  // Filter for expiring consents (within 30 days)
  if (expiringSoon === "true") {
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    conditions.push(sql`${consentRecordsTable.expiryDate} IS NOT NULL`);
    conditions.push(sql`${consentRecordsTable.expiryDate} <= ${thirtyDaysFromNow.toISOString().split('T')[0]}`);
    conditions.push(sql`${consentRecordsTable.expiryDate} > ${new Date().toISOString().split('T')[0]}`);
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [records, totalResult] = await Promise.all([
    db.select().from(consentRecordsTable).where(where).limit(limitNum).offset(offset).orderBy(desc(consentRecordsTable.obtainedDate), desc(consentRecordsTable.createdAt)),
    db.select({ count: count() }).from(consentRecordsTable).where(where),
  ]);

  const total = totalResult[0]?.count ?? 0;
  res.json({ data: records, total, page: pageNum, totalPages: Math.ceil(total / limitNum) });
});

// GET /consent-records/:id
router.get("/:id", authMiddleware, denyDevRoles, checkModuleEnabled("consent"), async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const tenantId = req.user!.tenantId;

  const [record] = await db.select().from(consentRecordsTable)
    .where(and(eq(consentRecordsTable.id, rawId), tenantId ? eq(consentRecordsTable.tenantId, tenantId) : undefined));

  if (!record) { res.status(404).json({ error: "Consent record not found" }); return; }
  res.json(record);
});

// POST /consent-records
router.post("/", authMiddleware, denyDevRoles, checkModuleEnabled("consent"), requireRole("OPERATOR", "MANAGER", "ADMIN"), async (req, res): Promise<void> => {
  const user = req.user!;
  const raw = sanitiseInput(req.body as Record<string, unknown>) as any;

  // Validate required fields
  if (!raw.studentId || !raw.consentType || !raw.consentScope) {
    res.status(400).json({ error: "Missing required fields: studentId, consentType, consentScope" });
    return;
  }

  // Verify student exists and belongs to tenant
  const [student] = await db.select().from(studentsTable)
    .where(and(eq(studentsTable.id, raw.studentId), user.tenantId ? eq(studentsTable.tenantId, user.tenantId) : undefined));

  if (!student) {
    res.status(404).json({ error: "Student not found" });
    return;
  }

  // Verify parent/guardian exists and belongs to tenant if provided
  if (raw.parentGuardianId) {
    const [parentGuardian] = await db.select().from(parentGuardiansTable)
      .where(and(
        eq(parentGuardiansTable.id, raw.parentGuardianId),
        user.tenantId ? eq(parentGuardiansTable.tenantId, user.tenantId) : undefined,
        eq(parentGuardiansTable.studentId, raw.studentId)
      ));

    if (!parentGuardian) {
      res.status(404).json({ error: "Parent/guardian not found or does not belong to this student" });
      return;
    }
  }

  // Verify programme exists and belongs to tenant if provided
  if (raw.programmeId) {
    const [programme] = await db.select().from(programmesTable)
      .where(and(eq(programmesTable.id, raw.programmeId), user.tenantId ? eq(programmesTable.tenantId, user.tenantId) : undefined));

    if (!programme) {
      res.status(404).json({ error: "Programme not found" });
      return;
    }
  }

  const recordId = generateId("cons");
  const newRecord = {
    id: recordId,
    tenantId: user.tenantId,
    studentId: raw.studentId,
    parentGuardianId: raw.parentGuardianId,
    consentType: raw.consentType,
    consentScope: raw.consentScope,
    programmeId: raw.programmeId,
    status: raw.status ?? "PENDING",
    obtainedDate: raw.obtainedDate,
    obtainedByUserId: raw.obtainedByUserId ?? user.id,
    obtainedMethod: raw.obtainedMethod,
    expiryDate: raw.expiryDate,
    withdrawnDate: raw.withdrawnDate,
    withdrawnReason: raw.withdrawnReason,
    documentUrl: raw.documentUrl,
    notes: raw.notes,
    metadata: raw.metadata ?? {},
    createdBy: user.id,
  };

  try {
    const [inserted] = await db.insert(consentRecordsTable).values(newRecord).returning();
    res.status(201).json(inserted);
  } catch (error) {
    console.error("Error creating consent record:", error);
    res.status(500).json({ error: "Failed to create consent record" });
  }
});

// PUT /consent-records/:id
router.put("/:id", authMiddleware, denyDevRoles, checkModuleEnabled("consent"), requireRole("OPERATOR", "MANAGER", "ADMIN"), async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const user = req.user!;
  const raw = sanitiseInput(req.body as Record<string, unknown>) as any;

  // Check if record exists and belongs to tenant
  const [existing] = await db.select().from(consentRecordsTable)
    .where(and(eq(consentRecordsTable.id, rawId), user.tenantId ? eq(consentRecordsTable.tenantId, user.tenantId) : undefined));

  if (!existing) { res.status(404).json({ error: "Consent record not found" }); return; }

  // Don't allow changing certain fields
  const { id, tenantId, studentId, createdBy, createdAt, ...updateData } = raw;
  
  // Handle status transitions
  const update: any = {
    ...updateData,
    updatedAt: new Date(),
  };

  // If status is changing to OBTAINED, set obtainedDate if not already set
  if (updateData.status === "OBTAINED" && existing.status !== "OBTAINED") {
    update.obtainedDate = updateData.obtainedDate || new Date().toISOString().split('T')[0];
    update.obtainedByUserId = updateData.obtainedByUserId || user.id;
    update.obtainedMethod = updateData.obtainedMethod || "DIGITAL_FORM";
  }

  // If status is changing to WITHDRAWN or REVOKED, set withdrawnDate
  if ((updateData.status === "WITHDRAWN" || updateData.status === "REVOKED") && 
      existing.status !== "WITHDRAWN" && existing.status !== "REVOKED") {
    update.withdrawnDate = updateData.withdrawnDate || new Date().toISOString().split('T')[0];
    update.withdrawnReason = updateData.withdrawnReason || "Withdrawn by user";
  }

   try {
    const [updated] = await db.update(consentRecordsTable)
      .set(update)
      .where(and(eq(consentRecordsTable.id, rawId), user.tenantId ? eq(consentRecordsTable.tenantId, user.tenantId) : undefined))
      .returning();
    res.json(updated);
  } catch (error) {
    console.error("Error updating consent record:", error);
    res.status(500).json({ error: "Failed to update consent record" });
  }
});

// DELETE /consent-records/:id
router.delete("/:id", authMiddleware, denyDevRoles, checkModuleEnabled("consent"), requireRole("ADMIN"), async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const user = req.user!;

  // Check if record exists and belongs to tenant
  const [existing] = await db.select().from(consentRecordsTable)
    .where(and(eq(consentRecordsTable.id, rawId), user.tenantId ? eq(consentRecordsTable.tenantId, user.tenantId) : undefined));

  if (!existing) { res.status(404).json({ error: "Consent record not found" }); return; }

  // Don't allow deletion of obtained consents unless they're expired
  if (existing.status === "OBTAINED" && existing.expiryDate && new Date(existing.expiryDate) > new Date()) {
    res.status(400).json({ error: "Cannot delete active obtained consent. Revoke it first." });
    return;
  }

   try {
    await db.delete(consentRecordsTable)
      .where(and(eq(consentRecordsTable.id, rawId), user.tenantId ? eq(consentRecordsTable.tenantId, user.tenantId) : undefined));
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting consent record:", error);
    res.status(500).json({ error: "Failed to delete consent record" });
  }
});

// GET /consent-records/student/:studentId/summary
router.get("/student/:studentId/summary", authMiddleware, denyDevRoles, checkModuleEnabled("consent"), async (req, res): Promise<void> => {
  const studentId = Array.isArray(req.params.studentId) ? req.params.studentId[0] : req.params.studentId;
  const tenantId = req.user!.tenantId;

  const records = await db.select().from(consentRecordsTable)
    .where(and(
      eq(consentRecordsTable.studentId, studentId),
      tenantId ? eq(consentRecordsTable.tenantId, tenantId) : undefined
    ))
    .orderBy(desc(consentRecordsTable.obtainedDate));

  // Group by consent type and status
  const summary: Record<string, any> = {};
  records.forEach(record => {
    if (!summary[record.consentType]) {
      summary[record.consentType] = {
        total: 0,
        byStatus: {},
        latest: null,
      };
    }
    summary[record.consentType].total++;
    summary[record.consentType].byStatus[record.status] = (summary[record.consentType].byStatus[record.status] || 0) + 1;
    
    // Keep track of latest record for each type
    if (!summary[record.consentType].latest || 
        (record.obtainedDate && (!summary[record.consentType].latest.obtainedDate || 
         record.obtainedDate > summary[record.consentType].latest.obtainedDate))) {
      summary[record.consentType].latest = record;
    }
  });

  res.json({ studentId, summary });
});

// GET /consent-records/dashboard/status
router.get("/dashboard/status", authMiddleware, denyDevRoles, checkModuleEnabled("consent"), async (req, res): Promise<void> => {
  const tenantId = req.user!.tenantId;

  const records = await db.select().from(consentRecordsTable)
    .where(tenantId ? eq(consentRecordsTable.tenantId, tenantId) : undefined);

  // Calculate dashboard metrics
  const total = records.length;
  const byStatus = records.reduce((acc: Record<string, number>, record) => {
    acc[record.status] = (acc[record.status] || 0) + 1;
    return acc;
  }, {});

  // Find expiring consents (within 30 days)
  const today = new Date().toISOString().split('T')[0];
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
  const thirtyDaysFromNowStr = thirtyDaysFromNow.toISOString().split('T')[0];

  const expiringSoon = records.filter(record => 
    record.status === "OBTAINED" && 
    record.expiryDate && 
    record.expiryDate >= today && 
    record.expiryDate <= thirtyDaysFromNowStr
  ).length;

  // Find expired consents
  const expired = records.filter(record => 
    record.status === "OBTAINED" && 
    record.expiryDate && 
    record.expiryDate < today
  ).length;

  // Find pending consents
  const pending = records.filter(record => record.status === "PENDING").length;

  res.json({
    total,
    byStatus,
    expiringSoon,
    expired,
    pending,
    byConsentType: records.reduce((acc: Record<string, number>, record) => {
      acc[record.consentType] = (acc[record.consentType] || 0) + 1;
      return acc;
    }, {}),
  });
});

// POST /consent-records/:id/withdraw
router.post("/:id/withdraw", authMiddleware, denyDevRoles, checkModuleEnabled("consent"), requireRole("OPERATOR", "MANAGER", "ADMIN"), async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const user = req.user!;
  const { reason } = req.body as { reason?: string };

  // Check if record exists and belongs to tenant
  const [existing] = await db.select().from(consentRecordsTable)
    .where(and(eq(consentRecordsTable.id, rawId), user.tenantId ? eq(consentRecordsTable.tenantId, user.tenantId) : undefined));

  if (!existing) { res.status(404).json({ error: "Consent record not found" }); return; }

  // Only allow withdrawal of obtained consents
  if (existing.status !== "OBTAINED") {
    res.status(400).json({ error: "Only obtained consents can be withdrawn" });
    return;
  }

  try {
    const [updated] = await db.update(consentRecordsTable)
      .set({
        status: "WITHDRAWN",
        withdrawnDate: new Date().toISOString().split('T')[0],
        withdrawnReason: reason || "Withdrawn by user",
        updatedAt: new Date(),
      })
       .where(and(eq(consentRecordsTable.id, rawId), user.tenantId ? eq(consentRecordsTable.tenantId, user.tenantId) : undefined))
      .returning();
    
    // TODO: Trigger notification to programme manager
    // TODO: Potentially pause student in programme if consent is critical
    
    res.json(updated);
  } catch (error) {
    console.error("Error withdrawing consent:", error);
    res.status(500).json({ error: "Failed to withdraw consent" });
  }
});

export default router;