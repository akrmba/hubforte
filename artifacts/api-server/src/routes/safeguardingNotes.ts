import { Router, type IRouter } from "express";
import { db, safeguardingNotesTable, safeguardingAccessLogTable, studentsTable, usersTable } from "@workspace/db";
import { eq, and, desc, count, or, like } from "drizzle-orm";
import { authMiddleware, requireSafeguardingPermission , denyDevRoles } from "../lib/auth";
import { generateId } from "../lib/id";
import { sanitiseInput } from "../lib/sanitise";
import { checkModuleEnabled } from "../lib/featureFlags";
import { encrypt, decrypt } from "../lib/encrypt";
// Helper function to get client IP from request
function getClientIp(req?: any): string {
  if (!req) return "0.0.0.0";
  // Try common proxy headers
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return ips.split(',')[0].trim();
  }
  // Fall back to connection remote address
  return req.ip || req.connection?.remoteAddress || "0.0.0.0";
}

// Helper function to get user agent from request
function getUserAgent(req?: any): string {
  if (!req) return "API";
  return req.headers['user-agent'] || "API";
}

const router: IRouter = Router();

// Helper function to log access to safeguarding notes
// Throws error if logging fails - callers should handle this
async function logSafeguardingAccess(
  req: any,
  noteId: string, 
  userId: string, 
  tenantId: string,
  accessType: "VIEW" | "CREATE" | "UPDATE" | "DELETE" | "EXPORT",
  accessedFields: string[] = [],
  reasonForAccess?: string
) {
  // Reason for access is required for all safeguarding operations
  if (!reasonForAccess || reasonForAccess.trim() === "") {
    throw new Error("Reason for access is required for safeguarding operations");
  }

  const logId = generateId("sgal");
  await db.insert(safeguardingAccessLogTable).values({
    id: logId,
    tenantId,
    safeguardingNoteId: noteId,
    userId,
    accessType,
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
    accessedFields,
    reasonForAccess,
  });
}

// GET /safeguarding-notes?studentId=xxx&category=xxx&status=xxx&severity=xxx&page=1&limit=20
router.get("/", authMiddleware, denyDevRoles, checkModuleEnabled("safeguarding"), requireSafeguardingPermission("view"), async (req, res): Promise<void> => {
  const { 
    studentId, category, status, severity, confidentialityLevel,
    assignedToUserId, startDate, endDate, search, page = "1", limit = "20" 
  } = req.query as Record<string, string>;
  
  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(50, parseInt(limit, 10)); // Lower limit for sensitive data
  const offset = (pageNum - 1) * limitNum;
  const user = req.user!;
  const tenantId = user.tenantId ?? null;

  if (!tenantId && user.role !== "SUPER_ADMIN") {
    res.status(403).json({ error: "No tenant assigned to this user" });
    return;
  }

  const conditions = [];
  if (tenantId) conditions.push(eq(safeguardingNotesTable.tenantId, tenantId));
  
  // Apply confidentiality level filtering
  if (user.role === "ADMIN") {
    // ADMIN can see STANDARD and RESTRICTED
    conditions.push(
      or(
        eq(safeguardingNotesTable.confidentialityLevel, "STANDARD"),
        eq(safeguardingNotesTable.confidentialityLevel, "RESTRICTED")
      )
    );
  } else if (user.role === "MANAGER") {
    // MANAGER can only see STANDARD
    conditions.push(eq(safeguardingNotesTable.confidentialityLevel, "STANDARD"));
  }
  // SUPER_ADMIN can see all (no filter)
  
  if (studentId) conditions.push(eq(safeguardingNotesTable.studentId, studentId));
  if (category) conditions.push(eq(safeguardingNotesTable.category, category as any));
  if (status) conditions.push(eq(safeguardingNotesTable.status, status as any));
  if (severity) conditions.push(eq(safeguardingNotesTable.severity, severity as any));
  if (confidentialityLevel) conditions.push(eq(safeguardingNotesTable.confidentialityLevel, confidentialityLevel as any));
  if (assignedToUserId) conditions.push(eq(safeguardingNotesTable.assignedToUserId, assignedToUserId));
  
  // Date range filtering
  if (startDate) conditions.push(like(safeguardingNotesTable.reportedDate, `${startDate}%`));
  if (endDate) conditions.push(like(safeguardingNotesTable.reportedDate, `${endDate}%`));
  
  // Search in title only — content is encrypted at rest and cannot be searched via LIKE.
  // Full-text search of note content requires decryption at the application layer (Phase 2).
  if (search) {
    conditions.push(like(safeguardingNotesTable.title, `%${search}%`));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [notes, totalResult] = await Promise.all([
    db.select().from(safeguardingNotesTable).where(where).limit(limitNum).offset(offset).orderBy(desc(safeguardingNotesTable.reportedDate), desc(safeguardingNotesTable.createdAt)),
    db.select({ count: count() }).from(safeguardingNotesTable).where(where),
  ]);

  const total = totalResult[0]?.count ?? 0;
  
  // Log access to each note - reason is required
  const reason = req.query.reason as string;
  if (!reason || reason.trim() === "") {
    res.status(400).json({ error: "Reason for access is required for safeguarding operations" });
    return;
  }
  
  try {
    await Promise.all(
      notes.map(note =>
        logSafeguardingAccess(
          req, note.id, user.id,
          note.tenantId ?? tenantId!,
          "VIEW",
          Object.keys(note).filter(k => k !== "content"),
          reason
        )
      )
    );
  } catch (error) {
    console.error("Failed to log safeguarding access:", error);
    res.status(500).json({ error: "Failed to log safeguarding access" });
    return;
  }

  res.json({ data: notes.map(n => ({ ...n, content: decrypt(n.content) })), total, page: pageNum, totalPages: Math.ceil(total / limitNum) });
});

// GET /safeguarding-notes/:id
router.get("/:id", authMiddleware, denyDevRoles, checkModuleEnabled("safeguarding"), requireSafeguardingPermission("view"), async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const user = req.user!;
  const tenantId = user.tenantId ?? null;
  const reason = req.query.reason as string;

  if (!tenantId && user.role !== "SUPER_ADMIN") {
    res.status(403).json({ error: "No tenant assigned to this user" });
    return;
  }

  // Reason for access is required for all safeguarding operations
  if (!reason || reason.trim() === "") {
    res.status(400).json({ error: "Reason for access is required for safeguarding operations" });
    return;
  }

  const noteCondition = tenantId
    ? and(eq(safeguardingNotesTable.id, rawId), eq(safeguardingNotesTable.tenantId, tenantId))
    : eq(safeguardingNotesTable.id, rawId);

  const [note] = await db.select().from(safeguardingNotesTable).where(noteCondition);

  if (!note) { res.status(404).json({ error: "Safeguarding note not found" }); return; }

  const effectiveTenantId: string = tenantId ?? note.tenantId!;

  // Check confidentiality level
  if (user.role === "MANAGER" && note.confidentialityLevel !== "STANDARD") {
    res.status(403).json({ error: "Forbidden: Insufficient clearance level" });
    return;
  }
  if (user.role === "ADMIN" && note.confidentialityLevel === "HIGHLY_RESTRICTED") {
    res.status(403).json({ error: "Forbidden: Insufficient clearance level" });
    return;
  }

  // Log detailed access — fail-closed
  const accessedFields = Object.keys(note).filter(key => key !== 'content');
  try {
    await logSafeguardingAccess(req, note.id, user.id, effectiveTenantId, "VIEW", accessedFields, reason);
  } catch (error) {
    console.error("Failed to log safeguarding access:", error);
    res.status(500).json({ error: "Failed to log safeguarding access" });
    return;
  }

  res.json({ ...note, content: decrypt(note.content) });
});

// POST /safeguarding-notes
router.post("/", authMiddleware, denyDevRoles, checkModuleEnabled("safeguarding"), requireSafeguardingPermission("create"), async (req, res): Promise<void> => {
  const user = req.user!;
  const tenantId = user.tenantId ?? null;

  // SUPER_ADMIN must supply a tenantId in the body when creating notes
  if (!tenantId && user.role !== "SUPER_ADMIN") {
    res.status(403).json({ error: "No tenant assigned to this user" });
    return;
  }

  const raw = sanitiseInput(req.body as Record<string, unknown>) as any;
  const reason = req.body.reason as string;
  const effectiveTenantId: string = tenantId ?? raw.tenantId;

  if (!effectiveTenantId) {
    res.status(400).json({ error: "tenantId is required for SUPER_ADMIN when creating safeguarding notes" });
    return;
  }

  // Reason for access is required
  if (!reason || reason.trim() === "") {
    res.status(400).json({ error: "Reason for access is required for safeguarding operations" });
    return;
  }

  // Validate required fields
  if (!raw.studentId || !raw.title || !raw.content || !raw.category || !raw.reportedDate) {
    res.status(400).json({ error: "Missing required fields: studentId, title, content, category, reportedDate" });
    return;
  }

  // Block HIGHLY_RESTRICTED notes for non-SUPER_ADMIN users
  if (raw.confidentialityLevel === "HIGHLY_RESTRICTED" && user.role !== "SUPER_ADMIN") {
    res.status(403).json({ error: "Only SUPER_ADMIN can create HIGHLY_RESTRICTED safeguarding notes" });
    return;
  }

  // Verify student exists and belongs to tenant
  const [student] = await db.select().from(studentsTable)
    .where(and(eq(studentsTable.id, raw.studentId), eq(studentsTable.tenantId, effectiveTenantId)));

  if (!student) {
    res.status(404).json({ error: "Student not found or not accessible" });
    return;
  }

  const noteId = generateId("sfgn");
  const newNote = {
    id: noteId,
    tenantId: effectiveTenantId,
    studentId: raw.studentId,
    title: raw.title,
    content: encrypt(raw.content), // AES-256-GCM at rest — decrypt on read
    category: raw.category,
    severity: raw.severity || "MEDIUM",
    status: raw.status || "OPEN",
    confidentialityLevel: raw.confidentialityLevel || "STANDARD",
    reportedDate: raw.reportedDate,
    reportedByUserId: raw.reportedByUserId || user.id,
    assignedToUserId: raw.assignedToUserId,
    nextReviewDate: raw.nextReviewDate,
    relatedEntities: raw.relatedEntities || [],
    attachments: raw.attachments || [],
    metadata: raw.metadata || {},
    createdBy: user.id,
  };

  try {
    // Write audit record FIRST — fail-closed before any data is committed
    await logSafeguardingAccess(req, noteId, user.id, effectiveTenantId, "CREATE", Object.keys(newNote), reason);
  } catch (error) {
    console.error("Failed to write audit log before CREATE:", error);
    res.status(500).json({ error: "Audit log write failed — safeguarding note not created" });
    return;
  }

  try {
    const [inserted] = await db.insert(safeguardingNotesTable).values(newNote).returning();
    res.status(201).json(inserted);
  } catch (error) {
    console.error("Error creating safeguarding note:", error);
    res.status(500).json({ error: "Failed to create safeguarding note" });
  }
});

// PUT /safeguarding-notes/:id
router.put("/:id", authMiddleware, denyDevRoles, checkModuleEnabled("safeguarding"), requireSafeguardingPermission("update"), async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const user = req.user!;
  const tenantId = user.tenantId ?? null;

  if (!tenantId && user.role !== "SUPER_ADMIN") {
    res.status(403).json({ error: "No tenant assigned to this user" });
    return;
  }

  const raw = sanitiseInput(req.body as Record<string, unknown>) as any;
  const reason = req.body.reason as string;

  // Reason for access is required
  if (!reason || reason.trim() === "") {
    res.status(400).json({ error: "Reason for access is required for safeguarding operations" });
    return;
  }

  // For SUPER_ADMIN with no tenant, look up the note first to get its tenantId
  const noteCondition = tenantId
    ? and(eq(safeguardingNotesTable.id, rawId), eq(safeguardingNotesTable.tenantId, tenantId))
    : eq(safeguardingNotesTable.id, rawId);

  const [existing] = await db.select().from(safeguardingNotesTable).where(noteCondition);

  if (!existing) { res.status(404).json({ error: "Safeguarding note not found" }); return; }

  const effectiveTenantId: string = tenantId ?? existing.tenantId!;

  // Check confidentiality level
  if (user.role === "MANAGER" && existing.confidentialityLevel !== "STANDARD") {
    res.status(403).json({ error: "Forbidden: Insufficient clearance level" });
    return;
  }
  if (user.role === "ADMIN" && existing.confidentialityLevel === "HIGHLY_RESTRICTED") {
    res.status(403).json({ error: "Forbidden: Insufficient clearance level" });
    return;
  }

  // Don't allow changing certain fields
  const { id, tenantId: _, studentId, createdBy, createdAt, ...updateData } = raw;

  // Prevent non-SUPER_ADMIN from changing to HIGHLY_RESTRICTED
  if (updateData.confidentialityLevel === "HIGHLY_RESTRICTED" && user.role !== "SUPER_ADMIN") {
    res.status(403).json({ error: "Only SUPER_ADMIN can set confidentiality level to HIGHLY_RESTRICTED" });
    return;
  }

  const update = {
    ...updateData,
    // Encrypt content if it is being updated
    ...(updateData.content !== undefined ? { content: encrypt(updateData.content) } : {}),
    updatedAt: new Date(),
  };

  // If status is changing to RESOLVED or CLOSED, set resolution date
  if ((updateData.status === "RESOLVED" || updateData.status === "CLOSED") && existing.status !== updateData.status) {
    update.resolutionDate = new Date().toISOString().split('T')[0];
  }

  // Write audit record FIRST — fail-closed before any data is committed
  const updatedFields = Object.keys(updateData);
  try {
    await logSafeguardingAccess(req, rawId, user.id, effectiveTenantId, "UPDATE", updatedFields, reason);
  } catch (error) {
    console.error("Failed to write audit log before UPDATE:", error);
    res.status(500).json({ error: "Audit log write failed — safeguarding note not updated" });
    return;
  }

  try {
    const [updated] = await db.update(safeguardingNotesTable)
      .set(update)
      .where(and(eq(safeguardingNotesTable.id, rawId), eq(safeguardingNotesTable.tenantId, effectiveTenantId)))
      .returning();

    res.json(updated);
  } catch (error) {
    console.error("Error updating safeguarding note:", error);
    res.status(500).json({ error: "Failed to update safeguarding note" });
  }
});

// DELETE /safeguarding-notes/:id (restricted - only for SUPER_ADMIN with delete_safeguarding permission)
router.delete("/:id", authMiddleware, denyDevRoles, checkModuleEnabled("safeguarding"), requireSafeguardingPermission("delete"), async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const user = req.user!;
  const tenantId = user.tenantId ?? null;
  const reason = req.body.reason as string;

  if (!tenantId && user.role !== "SUPER_ADMIN") {
    res.status(403).json({ error: "No tenant assigned to this user" });
    return;
  }

  // Reason for access is required
  if (!reason || reason.trim() === "") {
    res.status(400).json({ error: "Reason for access is required for safeguarding operations" });
    return;
  }

  const noteCondition = tenantId
    ? and(eq(safeguardingNotesTable.id, rawId), eq(safeguardingNotesTable.tenantId, tenantId))
    : eq(safeguardingNotesTable.id, rawId);

  const [existing] = await db.select().from(safeguardingNotesTable).where(noteCondition);

  if (!existing) { res.status(404).json({ error: "Safeguarding note not found" }); return; }

  // Additional restrictions for deleting safeguarding notes
  if (existing.status !== "CLOSED") {
    res.status(400).json({ error: "Cannot delete safeguarding note that is not CLOSED" });
    return;
  }

  // Check if note is older than retention period (e.g., 7 years)
  const noteDate = new Date(existing.reportedDate);
  const sevenYearsAgo = new Date();
  sevenYearsAgo.setFullYear(sevenYearsAgo.getFullYear() - 7);
  
  if (noteDate > sevenYearsAgo) {
    res.status(400).json({ error: "Cannot delete safeguarding note within retention period (7 years)" });
    return;
  }

  const effectiveDeleteTenantId: string = tenantId ?? existing.tenantId!;

  try {
    // Write audit record FIRST — fail-closed before deletion
    try {
      await logSafeguardingAccess(req, rawId, user.id, effectiveDeleteTenantId, "DELETE", ["ALL"], reason);
    } catch (error) {
      console.error("Failed to write audit log before DELETE:", error);
      res.status(500).json({ error: "Audit log write failed — safeguarding note not deleted" });
      return;
    }

    await db.delete(safeguardingNotesTable)
      .where(and(eq(safeguardingNotesTable.id, rawId), eq(safeguardingNotesTable.tenantId, effectiveDeleteTenantId)));
    
    res.json({ message: "Safeguarding note deleted" });
  } catch (error) {
    console.error("Error deleting safeguarding note:", error);
    res.status(500).json({ error: "Failed to delete safeguarding note" });
  }
});

export default router;