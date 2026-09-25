import { Router, type IRouter } from "express";
import { db, parentGuardiansTable, studentsTable } from "@workspace/db";
import { eq, and, desc, count, ne } from "drizzle-orm";
import { authMiddleware, requireRole, denyDevRoles } from "../lib/auth";
import { generateId } from "../lib/id";
import { sanitiseInput } from "../lib/sanitise";
import { checkModuleEnabled } from "../lib/featureFlags";

const router: IRouter = Router();

// GET /parent-guardians?studentId=xxx&isPrimaryContact=xxx&isEmergencyContact=xxx&page=1&limit=20
router.get("/", authMiddleware, denyDevRoles, checkModuleEnabled("consent"), async (req, res): Promise<void> => {
  const { 
    studentId, isPrimaryContact, isEmergencyContact, page = "1", limit = "20" 
  } = req.query as Record<string, string>;
  
  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(100, parseInt(limit, 10));
  const offset = (pageNum - 1) * limitNum;
  const tenantId = req.user!.tenantId;

  const conditions = [];
  if (tenantId) conditions.push(eq(parentGuardiansTable.tenantId, tenantId));
  if (studentId) conditions.push(eq(parentGuardiansTable.studentId, studentId));
  if (isPrimaryContact !== undefined) conditions.push(eq(parentGuardiansTable.isPrimaryContact, isPrimaryContact === "true"));
  if (isEmergencyContact !== undefined) conditions.push(eq(parentGuardiansTable.isEmergencyContact, isEmergencyContact === "true"));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [records, totalResult] = await Promise.all([
    db.select().from(parentGuardiansTable).where(where).limit(limitNum).offset(offset).orderBy(desc(parentGuardiansTable.isPrimaryContact), desc(parentGuardiansTable.createdAt)),
    db.select({ count: count() }).from(parentGuardiansTable).where(where),
  ]);

  const total = totalResult[0]?.count ?? 0;
  res.json({ data: records, total, page: pageNum, totalPages: Math.ceil(total / limitNum) });
});

// GET /parent-guardians/:id
router.get("/:id", authMiddleware, denyDevRoles, checkModuleEnabled("consent"), async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const tenantId = req.user!.tenantId;

  const [record] = await db.select().from(parentGuardiansTable)
    .where(and(eq(parentGuardiansTable.id, rawId), tenantId ? eq(parentGuardiansTable.tenantId, tenantId) : undefined));

  if (!record) { res.status(404).json({ error: "Parent/guardian not found" }); return; }
  res.json(record);
});

// POST /parent-guardians
router.post("/", authMiddleware, denyDevRoles, checkModuleEnabled("consent"), requireRole("OPERATOR", "MANAGER", "ADMIN"), async (req, res): Promise<void> => {
  const user = req.user!;
  const raw = sanitiseInput(req.body as Record<string, unknown>) as any;

  // Validate required fields
  if (!raw.studentId || !raw.firstName || !raw.lastName || !raw.relationship) {
    res.status(400).json({ error: "Missing required fields: studentId, firstName, lastName, relationship" });
    return;
  }

  // Verify student exists and belongs to tenant
  const [student] = await db.select().from(studentsTable)
    .where(and(eq(studentsTable.id, raw.studentId), user.tenantId ? eq(studentsTable.tenantId, user.tenantId) : undefined));

  if (!student) {
    res.status(404).json({ error: "Student not found" });
    return;
  }

  const recordId = generateId("pgrd");
  const newRecord = {
    id: recordId,
    tenantId: user.tenantId,
    studentId: raw.studentId,
    firstName: raw.firstName,
    lastName: raw.lastName,
    relationship: raw.relationship,
    isPrimaryContact: raw.isPrimaryContact ?? false,
    isEmergencyContact: raw.isEmergencyContact ?? false,
    email: raw.email,
    phoneMobile: raw.phoneMobile,
    phoneHome: raw.phoneHome,
    phoneWork: raw.phoneWork,
    addressLine1: raw.addressLine1,
    addressLine2: raw.addressLine2,
    city: raw.city,
    postcode: raw.postcode,
    preferredContactMethod: raw.preferredContactMethod,
    preferredContactTime: raw.preferredContactTime,
    communicationPreferences: raw.communicationPreferences ?? {},
    notes: raw.notes,
    metadata: raw.metadata ?? {},
    createdBy: user.id,
  };

  // If this is being set as primary contact, ensure only one primary contact per student
  if (newRecord.isPrimaryContact) {
    const existingPrimary = await db.select().from(parentGuardiansTable)
      .where(and(
        user.tenantId ? eq(parentGuardiansTable.tenantId, user.tenantId) : undefined,
        eq(parentGuardiansTable.studentId, raw.studentId),
        eq(parentGuardiansTable.isPrimaryContact, true)
      ));

    if (existingPrimary.length > 0) {
      // Update existing primary contacts to non-primary
      await db.update(parentGuardiansTable)
        .set({ isPrimaryContact: false })
        .where(and(
          user.tenantId ? eq(parentGuardiansTable.tenantId, user.tenantId) : undefined,
          eq(parentGuardiansTable.studentId, raw.studentId),
          eq(parentGuardiansTable.isPrimaryContact, true)
        ));
    }
  }

  try {
    const [inserted] = await db.insert(parentGuardiansTable).values(newRecord).returning();
    res.status(201).json(inserted);
   } catch (error) {
    console.error("Error creating parent/guardian:", error);
    res.status(500).json({ error: "Failed to create parent/guardian" });
  }
});

// PUT /parent-guardians/:id
router.put("/:id", authMiddleware, denyDevRoles, checkModuleEnabled("consent"), requireRole("OPERATOR", "MANAGER", "ADMIN"), async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const user = req.user!;
  const raw = sanitiseInput(req.body as Record<string, unknown>) as any;

  // Check if record exists and belongs to tenant
  const [existing] = await db.select().from(parentGuardiansTable)
    .where(and(eq(parentGuardiansTable.id, rawId), user.tenantId ? eq(parentGuardiansTable.tenantId, user.tenantId) : undefined));

  if (!existing) { res.status(404).json({ error: "Parent/guardian not found" }); return; }

  // Don't allow changing certain fields
  const { id, tenantId, studentId, createdBy, createdAt, ...updateData } = raw;
  
  const update: any = {
    ...updateData,
    updatedAt: new Date(),
  };

  // Handle primary contact logic
  if (updateData.isPrimaryContact === true && !existing.isPrimaryContact) {
    // Update existing primary contacts to non-primary for this student
      await db.update(parentGuardiansTable)
        .set({ isPrimaryContact: false })
        .where(and(
          user.tenantId ? eq(parentGuardiansTable.tenantId, user.tenantId) : undefined,
          eq(parentGuardiansTable.studentId, existing.studentId),
          eq(parentGuardiansTable.isPrimaryContact, true)
        ));
  }

   try {
    const [updated] = await db.update(parentGuardiansTable)
      .set(update)
      .where(and(eq(parentGuardiansTable.id, rawId), user.tenantId ? eq(parentGuardiansTable.tenantId, user.tenantId) : undefined))
      .returning();
    res.json(updated);
   } catch (error) {
    console.error("Error updating parent/guardian:", error);
    res.status(500).json({ error: "Failed to update parent/guardian" });
  }
});

// DELETE /parent-guardians/:id
router.delete("/:id", authMiddleware, denyDevRoles, checkModuleEnabled("consent"), requireRole("ADMIN"), async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const user = req.user!;

  // Check if record exists and belongs to tenant
  const [existing] = await db.select().from(parentGuardiansTable)
    .where(and(eq(parentGuardiansTable.id, rawId), user.tenantId ? eq(parentGuardiansTable.tenantId, user.tenantId) : undefined));

  if (!existing) { res.status(404).json({ error: "Parent/guardian not found" }); return; }

  // Don't allow deletion if this is the only primary contact (at least warn)
  if (existing.isPrimaryContact) {
    const otherContacts = await db.select().from(parentGuardiansTable)
      .where(and(
        user.tenantId ? eq(parentGuardiansTable.tenantId, user.tenantId) : undefined,
        eq(parentGuardiansTable.studentId, existing.studentId),
        eq(parentGuardiansTable.isPrimaryContact, true),
        ne(parentGuardiansTable.id, rawId)
      ));

    if (otherContacts.length === 0) {
      // Warning but allow deletion
      console.warn(`Deleting only primary contact for student ${existing.studentId}`);
    }
  }

   try {
    await db.delete(parentGuardiansTable)
      .where(and(eq(parentGuardiansTable.id, rawId), user.tenantId ? eq(parentGuardiansTable.tenantId, user.tenantId) : undefined));
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting parent/guardian:", error);
    res.status(500).json({ error: "Failed to delete parent/guardian" });
  }
});

// GET /parent-guardians/student/:studentId/summary
router.get("/student/:studentId/summary", authMiddleware, denyDevRoles, checkModuleEnabled("consent"), async (req, res): Promise<void> => {
  const studentId = Array.isArray(req.params.studentId) ? req.params.studentId[0] : req.params.studentId;
  const tenantId = req.user!.tenantId;

  const records = await db.select().from(parentGuardiansTable)
    .where(and(
      eq(parentGuardiansTable.studentId, studentId),
      tenantId ? eq(parentGuardiansTable.tenantId, tenantId) : undefined
    ))
    .orderBy(desc(parentGuardiansTable.isPrimaryContact), desc(parentGuardiansTable.isEmergencyContact));

  const primaryContact = records.find(r => r.isPrimaryContact);
  const emergencyContacts = records.filter(r => r.isEmergencyContact);
  const allContacts = records;

  res.json({
    studentId,
    total: records.length,
    primaryContact,
    emergencyContacts,
    allContacts,
    byRelationship: records.reduce((acc: Record<string, number>, record) => {
      acc[record.relationship] = (acc[record.relationship] || 0) + 1;
      return acc;
    }, {}),
  });
});

export default router;