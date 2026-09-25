import { Router, type IRouter } from "express";
import { db, programmeCohortsTable, programmesTable } from "@workspace/db";
import { eq, and, desc, count, ilike } from "drizzle-orm";
import { authMiddleware, requireRole, denyDevRoles } from "../lib/auth";
import { generateId } from "../lib/id";
import { sanitiseInput } from "../lib/sanitise";

const router: IRouter = Router();

// GET /programme-cohorts?programmeId=xxx&status=xxx&page=1&limit=20
router.get("/", authMiddleware, denyDevRoles, async (req, res): Promise<void> => {
  const { programmeId, status, page = "1", limit = "20" } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(100, parseInt(limit, 10));
  const offset = (pageNum - 1) * limitNum;
  const tenantId = req.user!.tenantId;

  const conditions = [];
  if (tenantId) conditions.push(eq(programmeCohortsTable.tenantId, tenantId));
  if (programmeId) conditions.push(eq(programmeCohortsTable.programmeId, programmeId));
  if (status) conditions.push(eq(programmeCohortsTable.status, status as any));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [cohorts, totalResult] = await Promise.all([
    db.select().from(programmeCohortsTable).where(where).limit(limitNum).offset(offset).orderBy(desc(programmeCohortsTable.createdAt)),
    db.select({ count: count() }).from(programmeCohortsTable).where(where),
  ]);

  const total = totalResult[0]?.count ?? 0;
  res.json({ data: cohorts, total, page: pageNum, totalPages: Math.ceil(total / limitNum) });
});

// GET /programme-cohorts/:id
router.get("/:id", authMiddleware, denyDevRoles, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const tenantId = req.user!.tenantId;

  const [cohort] = await db.select().from(programmeCohortsTable)
    .where(and(eq(programmeCohortsTable.id, rawId), tenantId ? eq(programmeCohortsTable.tenantId, tenantId) : undefined));

  if (!cohort) { res.status(404).json({ error: "Cohort not found" }); return; }
  res.json(cohort);
});

// POST /programme-cohorts
router.post("/", authMiddleware, denyDevRoles, requireRole("ADMIN", "MANAGER", "OPERATOR"), async (req, res): Promise<void> => {
  const user = req.user!;
  const raw = sanitiseInput(req.body as Record<string, unknown>) as any;

  if (!raw.programmeId || !raw.cohortName) {
    res.status(400).json({ error: "programmeId and cohortName are required" }); return;
  }

  const id = generateId("coh");
  const [cohort] = await db.insert(programmeCohortsTable).values({
    id,
    tenantId: user.tenantId,
    programmeId: raw.programmeId,
    cohortName: raw.cohortName,
    startDate: raw.startDate || null,
    endDate: raw.endDate || null,
    capacity: raw.capacity ? parseInt(raw.capacity, 10) : null,
    enrolledCount: 0,
    status: raw.status || "PLANNED",
    notes: raw.notes || null,
    createdBy: user.id,
  }).returning();

  res.status(201).json(cohort);
});

// PATCH /programme-cohorts/:id
router.patch("/:id", authMiddleware, denyDevRoles, requireRole("ADMIN", "MANAGER", "OPERATOR"), async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const tenantId = req.user!.tenantId;
  const raw = sanitiseInput(req.body as Record<string, unknown>) as any;

  const updates: Record<string, any> = {};
  if (raw.cohortName !== undefined) updates.cohortName = raw.cohortName;
  if (raw.startDate !== undefined) updates.startDate = raw.startDate;
  if (raw.endDate !== undefined) updates.endDate = raw.endDate;
  if (raw.capacity !== undefined) updates.capacity = parseInt(raw.capacity, 10) || null;
  if (raw.enrolledCount !== undefined) updates.enrolledCount = parseInt(raw.enrolledCount, 10) || 0;
  if (raw.status !== undefined) updates.status = raw.status;
  if (raw.notes !== undefined) updates.notes = raw.notes;

  const [cohort] = await db.update(programmeCohortsTable).set(updates)
    .where(and(eq(programmeCohortsTable.id, rawId), tenantId ? eq(programmeCohortsTable.tenantId, tenantId) : undefined))
    .returning();

  if (!cohort) { res.status(404).json({ error: "Not found" }); return; }
  res.json(cohort);
});

// DELETE /programme-cohorts/:id
router.delete("/:id", authMiddleware, denyDevRoles, requireRole("ADMIN"), async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const tenantId = req.user!.tenantId;

  await db.update(programmeCohortsTable).set({ status: "CANCELLED" })
    .where(and(eq(programmeCohortsTable.id, rawId), tenantId ? eq(programmeCohortsTable.tenantId, tenantId) : undefined));

  res.json({ success: true });
});

export default router;
