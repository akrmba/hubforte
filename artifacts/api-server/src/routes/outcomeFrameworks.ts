import { Router, type IRouter } from "express";
import { db, outcomeFrameworksTable, programmesTable } from "@workspace/db";
import { eq, and, desc, count, or, isNull } from "drizzle-orm";
import { authMiddleware, requireRole, denyDevRoles } from "../lib/auth";
import { generateId } from "../lib/id";
import { sanitiseInput } from "../lib/sanitise";
import { checkModuleEnabled } from "../lib/featureFlags";
const oft = outcomeFrameworksTable as any;

const router: IRouter = Router();

// GET /outcome-frameworks?programmeId=xxx&status=xxx&platformDefault=xxx&page=1&limit=20
router.get("/", authMiddleware, denyDevRoles, checkModuleEnabled("outcomes"), async (req, res): Promise<void> => {
  const { programmeId, status, platformDefault, page = "1", limit = "20" } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(100, parseInt(limit, 10));
  const offset = (pageNum - 1) * limitNum;
  const tenantId = req.user!.tenantId;

  const conditions = [];
  if (tenantId) conditions.push(eq(oft.tenantId, tenantId));
  if (programmeId) conditions.push(eq(oft.programmeId, programmeId));
  if (status) conditions.push(eq(oft.status, status as any));
  if (platformDefault !== undefined) {
    conditions.push(eq(oft.isPlatformDefault, platformDefault === "true"));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [frameworks, totalResult] = await Promise.all([
    db.select().from(oft).where(where).limit(limitNum).offset(offset).orderBy(desc(oft.createdAt)),
    db.select({ count: count() }).from(oft).where(where),
  ]);

  const total = totalResult[0]?.count ?? 0;
  res.json({ data: frameworks, total, page: pageNum, totalPages: Math.ceil(total / limitNum) });
});

// GET /outcome-frameworks/:id
router.get("/:id", authMiddleware, denyDevRoles, checkModuleEnabled("outcomes"), async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const tenantId = req.user!.tenantId;

  const [framework] = await db.select().from(oft)
    .where(and(eq(oft.id, rawId), tenantId ? eq(oft.tenantId, tenantId) : undefined));

  if (!framework) { res.status(404).json({ error: "Outcome framework not found" }); return; }
  res.json(framework);
});

// POST /outcome-frameworks
router.post("/", authMiddleware, denyDevRoles, checkModuleEnabled("outcomes"), requireRole("ADMIN", "MANAGER"), async (req, res): Promise<void> => {
  const user = req.user!;
  const raw = sanitiseInput(req.body as Record<string, unknown>) as any;

  // Validate required fields
  if (!raw.name || !raw.scoringMethod) {
    res.status(400).json({ error: "Missing required fields: name, scoringMethod" });
    return;
  }

  const frameworkId = generateId("ofrm");
  const newFramework = {
    id: frameworkId,
    tenantId: user.tenantId,
    name: raw.name,
    description: raw.description,
    programmeId: raw.programmeId,
    isPlatformDefault: raw.isPlatformDefault ?? false,
    dimensions: raw.dimensions ?? [],
    metrics: raw.metrics ?? [],
    scoringMethod: raw.scoringMethod,
    status: raw.status ?? "DRAFT",
    metadata: raw.metadata ?? {},
    createdBy: user.id,
  };

  try {
    const [inserted] = (await db.insert(oft).values(newFramework).returning()) as any[];
    res.status(201).json(inserted);
  } catch (error) {
    console.error("Error creating outcome framework:", error);
    res.status(500).json({ error: "Failed to create outcome framework" });
  }
});

// PUT /outcome-frameworks/:id
router.put("/:id", authMiddleware, denyDevRoles, checkModuleEnabled("outcomes"), requireRole("ADMIN", "MANAGER"), async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const user = req.user!;
  const raw = sanitiseInput(req.body as Record<string, unknown>) as any;

  // Check if framework exists and belongs to tenant
  const [existing] = await db.select().from(oft)
    .where(and(eq(oft.id, rawId), eq(oft.tenantId, user.tenantId)));

  if (!existing) { res.status(404).json({ error: "Outcome framework not found" }); return; }

  // Don't allow changing platform default flag via update
  const { isPlatformDefault, ...updateData } = raw;
  
  const update = {
    ...updateData,
    updatedAt: new Date(),
  };

  try {
    const [updated] = await db.update(oft)
      .set(update)
      .where(and(eq(oft.id, rawId), eq(oft.tenantId, user.tenantId)))
      .returning();
    res.json(updated);
  } catch (error) {
    console.error("Error updating outcome framework:", error);
    res.status(500).json({ error: "Failed to update outcome framework" });
  }
});

// DELETE /outcome-frameworks/:id (archive, not hard delete)
router.delete("/:id", authMiddleware, denyDevRoles, checkModuleEnabled("outcomes"), requireRole("ADMIN"), async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const user = req.user!;

  // Check if framework exists and belongs to tenant
  const [existing] = await db.select().from(oft)
    .where(and(eq(oft.id, rawId), eq(oft.tenantId, user.tenantId)));

  if (!existing) { res.status(404).json({ error: "Outcome framework not found" }); return; }

  // Don't allow deleting platform default frameworks
  if (existing.isPlatformDefault) {
    res.status(400).json({ error: "Cannot delete platform default outcome frameworks" });
    return;
  }

  try {
    // Archive instead of hard delete
    const [archived] = await db.update(oft)
      .set({ status: "ARCHIVED", updatedAt: new Date() })
      .where(and(eq(oft.id, rawId), eq(oft.tenantId, user.tenantId)))
      .returning();
    res.json({ message: "Outcome framework archived", framework: archived });
  } catch (error) {
    console.error("Error archiving outcome framework:", error);
    res.status(500).json({ error: "Failed to archive outcome framework" });
  }
});

// GET /outcome-frameworks/platform/defaults
router.get("/platform/defaults", authMiddleware, denyDevRoles, checkModuleEnabled("outcomes"), async (req, res): Promise<void> => {
  const tenantId = req.user!.tenantId;

  // Get platform default frameworks (tenantId is null for platform defaults)
  const frameworks = await db.select().from(oft)
    .where(and(
      eq(oft.isPlatformDefault, true),
      eq(oft.status, "ACTIVE"),
      or(
        eq(oft.tenantId, tenantId),
        isNull(oft.tenantId)
      )
    ))
    .orderBy(desc(oft.createdAt));

  res.json({ data: frameworks });
});

export default router;