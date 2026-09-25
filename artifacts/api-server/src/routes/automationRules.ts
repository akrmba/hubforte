import { Router, type IRouter } from "express";
import { db, automationRulesTable, changeEventsTable, fieldHistoryTable } from "@workspace/db";
import { eq, and, desc, count } from "drizzle-orm";
import { authMiddleware, requireRole, denyDevRoles } from "../lib/auth";
import { generateId } from "../lib/id";
import { sanitiseInput } from "../lib/sanitise";
import { checkModuleEnabled } from "../lib/featureFlags";

const router: IRouter = Router();

// GET /automation-rules
router.get("/", authMiddleware, denyDevRoles, checkModuleEnabled("automation"), requireRole("MANAGER", "ADMIN"), async (req, res): Promise<void> => {
  const tenantId = req.user!.tenantId;
  if (!tenantId) { res.status(403).json({ error: "No tenant assigned" }); return; }
  const rules = await db.select().from(automationRulesTable)
    .where(eq(automationRulesTable.tenantId, tenantId))
    .orderBy(desc(automationRulesTable.createdAt));
  res.json({ data: rules });
});

// GET /automation-rules/change-events — must be before /:id to avoid shadowing
router.get("/change-events", authMiddleware, denyDevRoles, checkModuleEnabled("automation"), requireRole("MANAGER", "ADMIN"), async (req, res): Promise<void> => {
  const tenantId = req.user!.tenantId;
  if (!tenantId) { res.status(403).json({ error: "No tenant assigned" }); return; }
  const { entityType, entityId, page = "1", limit = "50" } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(100, parseInt(limit, 10));
  const offset = (pageNum - 1) * limitNum;
  const conditions: any[] = [eq(changeEventsTable.tenantId, tenantId)];
  if (entityType) conditions.push(eq(changeEventsTable.entityType, entityType));
  if (entityId) conditions.push(eq(changeEventsTable.entityId, entityId));
  const [events, totalResult] = await Promise.all([
    db.select().from(changeEventsTable).where(and(...conditions)).limit(limitNum).offset(offset).orderBy(desc(changeEventsTable.createdAt)),
    db.select({ count: count() }).from(changeEventsTable).where(and(...conditions)),
  ]);
  res.json({ data: events, total: totalResult[0]?.count ?? 0, page: pageNum });
});

// GET /automation-rules/field-history — must be before /:id to avoid shadowing
router.get("/field-history", authMiddleware, denyDevRoles, checkModuleEnabled("field_history"), requireRole("MANAGER", "ADMIN"), async (req, res): Promise<void> => {
  const tenantId = req.user!.tenantId;
  if (!tenantId) { res.status(403).json({ error: "No tenant assigned" }); return; }
  const { entityType, entityId, fieldName, page = "1", limit = "50" } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(100, parseInt(limit, 10));
  const offset = (pageNum - 1) * limitNum;
  const conditions: any[] = [eq(fieldHistoryTable.tenantId, tenantId)];
  if (entityType) conditions.push(eq(fieldHistoryTable.entityType, entityType));
  if (entityId) conditions.push(eq(fieldHistoryTable.entityId, entityId));
  if (fieldName) conditions.push(eq(fieldHistoryTable.fieldName, fieldName));
  const [history, totalResult] = await Promise.all([
    db.select().from(fieldHistoryTable).where(and(...conditions)).limit(limitNum).offset(offset).orderBy(desc(fieldHistoryTable.changedAt)),
    db.select({ count: count() }).from(fieldHistoryTable).where(and(...conditions)),
  ]);
  res.json({ data: history, total: totalResult[0]?.count ?? 0, page: pageNum });
});

// GET /automation-rules/:id
router.get("/:id", authMiddleware, denyDevRoles, checkModuleEnabled("automation"), requireRole("MANAGER", "ADMIN"), async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const tenantId = req.user!.tenantId;
  if (!tenantId) { res.status(403).json({ error: "No tenant assigned" }); return; }
  const [rule] = await db.select().from(automationRulesTable)
    .where(and(eq(automationRulesTable.id, rawId), eq(automationRulesTable.tenantId, tenantId)));
  if (!rule) { res.status(404).json({ error: "Automation rule not found" }); return; }
  res.json(rule);
});

// POST /automation-rules
router.post("/", authMiddleware, denyDevRoles, checkModuleEnabled("automation"), requireRole("ADMIN"), async (req, res): Promise<void> => {
  const user = req.user!;
  if (!user.tenantId) { res.status(403).json({ error: "No tenant assigned" }); return; }
  const raw = sanitiseInput(req.body as Record<string, unknown>) as any;
  if (!raw.name || !raw.entityType || !raw.triggerEvent) {
    res.status(400).json({ error: "name, entityType, triggerEvent are required" }); return;
  }
  const validTriggers = ["ON_CREATE", "ON_UPDATE", "ON_DELETE", "SCHEDULED"];
  if (!validTriggers.includes(raw.triggerEvent)) {
    res.status(400).json({ error: `triggerEvent must be one of: ${validTriggers.join(", ")}` }); return;
  }
  try {
    const [inserted] = await db.insert(automationRulesTable).values({
      id: generateId("ar"),
      tenantId: user.tenantId,
      name: raw.name,
      entityType: raw.entityType,
      triggerEvent: raw.triggerEvent,
      conditions: raw.conditions || [],
      actions: raw.actions || [],
      active: raw.active !== false,
      createdBy: user.id,
    }).returning();
    res.status(201).json(inserted);
  } catch (error) { console.error("Error creating automation rule:", error); res.status(500).json({ error: "Failed to create automation rule" }); }
});

// PUT /automation-rules/:id
router.put("/:id", authMiddleware, denyDevRoles, checkModuleEnabled("automation"), requireRole("ADMIN"), async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const user = req.user!;
  if (!user.tenantId) { res.status(403).json({ error: "No tenant assigned" }); return; }
  const raw = sanitiseInput(req.body as Record<string, unknown>) as any;
  const [existing] = await db.select().from(automationRulesTable)
    .where(and(eq(automationRulesTable.id, rawId), eq(automationRulesTable.tenantId, user.tenantId)));
  if (!existing) { res.status(404).json({ error: "Automation rule not found" }); return; }
  const { id, tenantId, createdBy, createdAt, runCount, lastRunAt, ...updateData } = raw;
  try {
    const [updated] = await db.update(automationRulesTable)
      .set({ ...updateData, updatedAt: new Date() })
      .where(and(eq(automationRulesTable.id, rawId), eq(automationRulesTable.tenantId, user.tenantId)))
      .returning();
    res.json(updated);
  } catch (error) { console.error("Error updating automation rule:", error); res.status(500).json({ error: "Failed to update automation rule" }); }
});

// DELETE /automation-rules/:id
router.delete("/:id", authMiddleware, denyDevRoles, checkModuleEnabled("automation"), requireRole("ADMIN"), async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const user = req.user!;
  if (!user.tenantId) { res.status(403).json({ error: "No tenant assigned" }); return; }
  const [existing] = await db.select().from(automationRulesTable)
    .where(and(eq(automationRulesTable.id, rawId), eq(automationRulesTable.tenantId, user.tenantId)));
  if (!existing) { res.status(404).json({ error: "Automation rule not found" }); return; }
  try {
    await db.delete(automationRulesTable)
      .where(and(eq(automationRulesTable.id, rawId), eq(automationRulesTable.tenantId, user.tenantId)));
    res.status(204).send();
  } catch (error) { console.error("Error deleting automation rule:", error); res.status(500).json({ error: "Failed to delete automation rule" }); }
});

// PATCH /automation-rules/:id/toggle
router.patch("/:id/toggle", authMiddleware, denyDevRoles, checkModuleEnabled("automation"), requireRole("ADMIN"), async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const user = req.user!;
  if (!user.tenantId) { res.status(403).json({ error: "No tenant assigned" }); return; }
  const [existing] = await db.select().from(automationRulesTable)
    .where(and(eq(automationRulesTable.id, rawId), eq(automationRulesTable.tenantId, user.tenantId)));
  if (!existing) { res.status(404).json({ error: "Automation rule not found" }); return; }
  const [updated] = await db.update(automationRulesTable)
    .set({ active: !existing.active, updatedAt: new Date() })
    .where(eq(automationRulesTable.id, rawId))
    .returning();
  res.json(updated);
});

// GET /automation-rules/change-events
router.get("/change-events", authMiddleware, denyDevRoles, checkModuleEnabled("automation"), requireRole("MANAGER", "ADMIN"), async (req, res): Promise<void> => {
  const tenantId = req.user!.tenantId;
  if (!tenantId) { res.status(403).json({ error: "No tenant assigned" }); return; }
  const { entityType, entityId, page = "1", limit = "50" } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(100, parseInt(limit, 10));
  const offset = (pageNum - 1) * limitNum;
  const conditions: any[] = [eq(changeEventsTable.tenantId, tenantId)];
  if (entityType) conditions.push(eq(changeEventsTable.entityType, entityType));
  if (entityId) conditions.push(eq(changeEventsTable.entityId, entityId));
  const [events, totalResult] = await Promise.all([
    db.select().from(changeEventsTable).where(and(...conditions)).limit(limitNum).offset(offset).orderBy(desc(changeEventsTable.createdAt)),
    db.select({ count: count() }).from(changeEventsTable).where(and(...conditions)),
  ]);
  res.json({ data: events, total: totalResult[0]?.count ?? 0, page: pageNum });
});

// GET /automation-rules/field-history
router.get("/field-history", authMiddleware, denyDevRoles, checkModuleEnabled("field_history"), requireRole("MANAGER", "ADMIN"), async (req, res): Promise<void> => {
  const tenantId = req.user!.tenantId;
  if (!tenantId) { res.status(403).json({ error: "No tenant assigned" }); return; }
  const { entityType, entityId, fieldName, page = "1", limit = "50" } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(100, parseInt(limit, 10));
  const offset = (pageNum - 1) * limitNum;
  const conditions: any[] = [eq(fieldHistoryTable.tenantId, tenantId)];
  if (entityType) conditions.push(eq(fieldHistoryTable.entityType, entityType));
  if (entityId) conditions.push(eq(fieldHistoryTable.entityId, entityId));
  if (fieldName) conditions.push(eq(fieldHistoryTable.fieldName, fieldName));
  const [history, totalResult] = await Promise.all([
    db.select().from(fieldHistoryTable).where(and(...conditions)).limit(limitNum).offset(offset).orderBy(desc(fieldHistoryTable.changedAt)),
    db.select({ count: count() }).from(fieldHistoryTable).where(and(...conditions)),
  ]);
  res.json({ data: history, total: totalResult[0]?.count ?? 0, page: pageNum });
});

export default router;
