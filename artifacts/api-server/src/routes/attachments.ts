import { Router, type IRouter } from "express";
import { db, attachmentsTable, usersTable } from "@workspace/db";
import { eq, and, desc, count } from "drizzle-orm";
import { authMiddleware, requireRole, denyDevRoles } from "../lib/auth";
import { generateId } from "../lib/id";
import { sanitiseInput } from "../lib/sanitise";
import { checkModuleEnabled } from "../lib/featureFlags";
import multer from "multer";
import path from "path";
import fs from "fs";

const router: IRouter = Router();

// Configure multer for file uploads
const upload = multer({ dest: "uploads/" });

// GET /attachments?entityType=xxx&entityId=xxx&category=xxx&uploadedBy=xxx&page=1&limit=20
router.get("/", authMiddleware, denyDevRoles, checkModuleEnabled("attachments"), async (req, res): Promise<void> => {
  const { 
    entityType, entityId, category, uploadedBy, page = "1", limit = "20" 
  } = req.query as Record<string, string>;
  
  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(100, parseInt(limit, 10));
  const offset = (pageNum - 1) * limitNum;
  const tenantId = req.user!.tenantId;

  const conditions = [];
  if (tenantId) conditions.push(eq(attachmentsTable.tenantId, tenantId));
  if (entityType) conditions.push(eq(attachmentsTable.entityType, entityType));
  if (entityId) conditions.push(eq(attachmentsTable.entityId, entityId));
  if (category) conditions.push(eq(attachmentsTable.category, category as any));
  if (uploadedBy) conditions.push(eq(attachmentsTable.uploadedByUserId, uploadedBy));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [attachments, totalResult] = await Promise.all([
    db.select().from(attachmentsTable).where(where).limit(limitNum).offset(offset).orderBy(desc(attachmentsTable.uploadedAt)),
    db.select({ count: count() }).from(attachmentsTable).where(where),
  ]);

  const total = totalResult[0]?.count ?? 0;
  res.json({ data: attachments, total, page: pageNum, totalPages: Math.ceil(total / limitNum) });
});

// GET /attachments/:id
router.get("/:id", authMiddleware, denyDevRoles, checkModuleEnabled("attachments"), async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const tenantId = req.user!.tenantId;

  const [attachment] = await db.select().from(attachmentsTable)
    .where(and(eq(attachmentsTable.id, rawId), tenantId ? eq(attachmentsTable.tenantId, tenantId) : undefined));

  if (!attachment) { res.status(404).json({ error: "Attachment not found" }); return; }
  res.json(attachment);
});

// POST /attachments — Direct upload endpoint
router.post("/", authMiddleware, denyDevRoles, checkModuleEnabled("attachments"), upload.single("file"), async (req, res): Promise<void> => {
  const user = req.user!;
  const raw = sanitiseInput(req.body as Record<string, unknown>) as any;

  // Validate required fields
  if (!raw.entityType || !raw.entityId || !req.file) {
    res.status(400).json({ error: "Missing required fields: entityType, entityId, or file" });
    return;
  }

  // Validate file size (10MB limit)
  const maxSize = 10 * 1024 * 1024; // 10MB
  if (req.file.size > maxSize) {
    fs.unlinkSync(req.file.path); // Clean up uploaded file
    res.status(400).json({ error: "File size exceeds 10MB limit" });
    return;
  }

  // Generate unique filename and move to permanent storage
  const ext = path.extname(req.file.originalname);
  const filename = `${generateId("atch")}${ext}`;
  const storagePath = `attachments/${filename}`;
  const fullPath = path.join("public", storagePath);

  // Create attachments directory if it doesn't exist
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Move file from temp to permanent location
  fs.renameSync(req.file.path, fullPath);

  const attachmentId = generateId("atch");
  const newAttachment = {
    id: attachmentId,
    tenantId: user.tenantId,
    entityType: raw.entityType,
    entityId: raw.entityId,
    fileName: req.file.originalname,
    fileType: req.file.mimetype,
    fileSize: req.file.size,
    storagePath: storagePath,
    storageProvider: raw.storageProvider || "LOCAL",
    category: raw.category || "DOCUMENT",
    description: raw.description,
    uploadedByUserId: user.id,
    isPublic: raw.isPublic === "true" || false,
    accessControl: raw.accessControl ? JSON.parse(raw.accessControl) : {},
    metadata: raw.metadata ? JSON.parse(raw.metadata) : {},
    createdBy: user.id,
  };

  try {
    const [inserted] = await db.insert(attachmentsTable).values(newAttachment).returning();
    res.status(201).json(inserted);
  } catch (error) {
    console.error("Error creating attachment:", error);
    // Clean up file if database insert fails
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
    res.status(500).json({ error: "Failed to create attachment" });
  }
});

// DELETE /attachments/:id
router.delete("/:id", authMiddleware, denyDevRoles, checkModuleEnabled("attachments"), requireRole("OPERATOR", "MANAGER", "ADMIN"), async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const user = req.user!;

  // Check if attachment exists and belongs to tenant
  const [existing] = await db.select().from(attachmentsTable)
    .where(and(eq(attachmentsTable.id, rawId), user.tenantId ? eq(attachmentsTable.tenantId, user.tenantId) : undefined));

  if (!existing) { res.status(404).json({ error: "Attachment not found" }); return; }

  try {
    // Delete file from storage if it's local
    if (existing.storageProvider === "LOCAL" && existing.storagePath) {
      const fullPath = path.join("public", existing.storagePath);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    }

    await db.delete(attachmentsTable)
      .where(and(eq(attachmentsTable.id, rawId), user.tenantId ? eq(attachmentsTable.tenantId, user.tenantId) : undefined));
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting attachment:", error);
    res.status(500).json({ error: "Failed to delete attachment" });
  }
});

// GET /attachments/:id/download — Download file endpoint
router.get("/:id/download", authMiddleware, denyDevRoles, checkModuleEnabled("attachments"), async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const tenantId = req.user!.tenantId;

  const [attachment] = await db.select().from(attachmentsTable)
    .where(and(eq(attachmentsTable.id, rawId), tenantId ? eq(attachmentsTable.tenantId, tenantId) : undefined));

  if (!attachment) { res.status(404).json({ error: "Attachment not found" }); return; }

  // Check access control
  if (!attachment.isPublic) {
    // For private attachments, check if user has access
    // TODO: Implement more sophisticated access control logic
    if (attachment.uploadedByUserId !== req.user!.id && req.user!.role !== "ADMIN") {
      res.status(403).json({ error: "Access denied" });
      return;
    }
  }

  try {
    if (attachment.storageProvider === "LOCAL") {
      const fullPath = path.join("public", attachment.storagePath);
      if (fs.existsSync(fullPath)) {
        res.download(fullPath, attachment.fileName);
      } else {
        res.status(404).json({ error: "File not found in storage" });
      }
    } else {
      // For non-local storage providers, return a redirect or signed URL
      // TODO: Implement cloud storage providers
      res.status(501).json({ error: "Cloud storage not yet implemented" });
    }
  } catch (error) {
    console.error("Error downloading attachment:", error);
    res.status(500).json({ error: "Failed to download attachment" });
  }
});

// GET /attachments/entity/:entityType/:entityId — Get attachments for specific entity
router.get("/entity/:entityType/:entityId", authMiddleware, denyDevRoles, checkModuleEnabled("attachments"), async (req, res): Promise<void> => {
  const entityType = Array.isArray(req.params.entityType) ? req.params.entityType[0] : req.params.entityType;
  const entityId = Array.isArray(req.params.entityId) ? req.params.entityId[0] : req.params.entityId;
  const tenantId = req.user!.tenantId;

  const attachments = await db.select().from(attachmentsTable)
    .where(and(
      eq(attachmentsTable.entityType, entityType),
      eq(attachmentsTable.entityId, entityId),
      tenantId ? eq(attachmentsTable.tenantId, tenantId) : undefined
    ))
    .orderBy(desc(attachmentsTable.uploadedAt));

  res.json({ data: attachments, entityType, entityId });
});

// POST /attachments/:id/update-metadata — Update attachment metadata
router.post("/:id/update-metadata", authMiddleware, denyDevRoles, checkModuleEnabled("attachments"), requireRole("OPERATOR", "MANAGER", "ADMIN"), async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const user = req.user!;
  const raw = sanitiseInput(req.body as Record<string, unknown>) as any;

  // Check if attachment exists and belongs to tenant
  const [existing] = await db.select().from(attachmentsTable)
    .where(and(eq(attachmentsTable.id, rawId), user.tenantId ? eq(attachmentsTable.tenantId, user.tenantId) : undefined));

  if (!existing) { res.status(404).json({ error: "Attachment not found" }); return; }

  const update: any = {
    updatedAt: new Date(),
  };

  if (raw.description !== undefined) update.description = raw.description;
  if (raw.isPublic !== undefined) update.isPublic = raw.isPublic;
  if (raw.category !== undefined) update.category = raw.category;
  if (raw.accessControl !== undefined) update.accessControl = raw.accessControl;
  if (raw.metadata !== undefined) update.metadata = raw.metadata;

  try {
    const [updated] = await db.update(attachmentsTable)
      .set(update)
      .where(and(eq(attachmentsTable.id, rawId), user.tenantId ? eq(attachmentsTable.tenantId, user.tenantId) : undefined))
      .returning();
    res.json(updated);
  } catch (error) {
    console.error("Error updating attachment metadata:", error);
    res.status(500).json({ error: "Failed to update attachment metadata" });
  }
});

// GET /attachments/dashboard/stats — Get attachment statistics
router.get("/dashboard/stats", authMiddleware, denyDevRoles, checkModuleEnabled("attachments"), async (req, res): Promise<void> => {
  const tenantId = req.user!.tenantId;

  const attachments = await db.select().from(attachmentsTable)
    .where(tenantId ? eq(attachmentsTable.tenantId, tenantId) : undefined);

  // Calculate statistics
  const total = attachments.length;
  const totalSize = attachments.reduce((sum, att) => sum + (att.fileSize || 0), 0);

  const byCategory = attachments.reduce((acc: Record<string, number>, att) => {
    acc[att.category] = (acc[att.category] || 0) + 1;
    return acc;
  }, {});

  const byEntityType = attachments.reduce((acc: Record<string, number>, att) => {
    acc[att.entityType] = (acc[att.entityType] || 0) + 1;
    return acc;
  }, {});

  res.json({
    total,
    totalSize,
    totalSizeMB: Math.round(totalSize / 1024 / 1024),
    byCategory,
    byEntityType,
    byStorageProvider: attachments.reduce((acc: Record<string, number>, att) => {
      acc[att.storageProvider] = (acc[att.storageProvider] || 0) + 1;
      return acc;
    }, {}),
  });
});

export default router;