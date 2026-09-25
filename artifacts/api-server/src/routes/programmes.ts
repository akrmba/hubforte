import { Router, type IRouter } from "express";
import { db, programmesTable } from "@workspace/db";
import { eq, and, desc, count, ilike } from "drizzle-orm";
import { authMiddleware, requireRole, denyDevRoles } from "../lib/auth";
import { generateId } from "../lib/id";
import { sanitiseInput } from "../lib/sanitise";

const router: IRouter = Router();

// GET /programmes?organizationId=xxx&status=xxx&page=1&limit=20
router.get("/", authMiddleware, denyDevRoles, async (req, res): Promise<void> => {
  const { organizationId, status, search, page = "1", limit = "20" } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(100, parseInt(limit, 10));
  const offset = (pageNum - 1) * limitNum;
  const tenantId = req.user!.tenantId;

  const conditions = [];
  if (tenantId) conditions.push(eq(programmesTable.tenantId, tenantId));
  if (organizationId) conditions.push(eq(programmesTable.organizationId, organizationId));
  if (status) conditions.push(eq(programmesTable.status, status as any));
  if (search) conditions.push(ilike(programmesTable.programmeName, `%${search}%`));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [programmes, totalResult] = await Promise.all([
    db.select().from(programmesTable).where(where).limit(limitNum).offset(offset).orderBy(desc(programmesTable.createdAt)),
    db.select({ count: count() }).from(programmesTable).where(where),
  ]);

  const total = totalResult[0]?.count ?? 0;
  res.json({ data: programmes, total, page: pageNum, totalPages: Math.ceil(total / limitNum) });
});

// GET /programmes/:id
router.get("/:id", authMiddleware, denyDevRoles, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const tenantId = req.user!.tenantId;

  const [programme] = await db.select().from(programmesTable)
    .where(and(eq(programmesTable.id, rawId), tenantId ? eq(programmesTable.tenantId, tenantId) : undefined));

  if (!programme) { res.status(404).json({ error: "Programme not found" }); return; }
  res.json(programme);
});

// POST /programmes
router.post("/", authMiddleware, denyDevRoles, requireRole("ADMIN", "MANAGER", "OPERATOR"), async (req, res): Promise<void> => {
  const user = req.user!;
  const raw = sanitiseInput(req.body as Record<string, unknown>) as any;

  if (!raw.organizationId || !raw.programmeName) {
    res.status(400).json({ error: "organizationId and programmeName are required" }); return;
  }

  const id = generateId("prg");
  const [programme] = await db.insert(programmesTable).values({
    id,
    tenantId: user.tenantId,
    organizationId: raw.organizationId,
    programmeName: raw.programmeName,
    programmeType: raw.programmeType || null,
    programmeCategory: raw.programmeCategory || null,
    academicYear: raw.academicYear || null,
    term: raw.term || null,
    deliveryModel: raw.deliveryModel || null,
    targetYearGroups: raw.targetYearGroups || null,
    targetStudentCount: raw.targetStudentCount ? parseInt(raw.targetStudentCount, 10) : null,
    startDate: raw.startDate || null,
    endDate: raw.endDate || null,
    status: raw.status || "PLANNED",
    notes: raw.notes || null,
    tags: raw.tags || null,
    createdBy: user.id,
  }).returning();

  res.status(201).json(programme);
});

// PATCH /programmes/:id
router.patch("/:id", authMiddleware, denyDevRoles, requireRole("ADMIN", "MANAGER", "OPERATOR"), async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const tenantId = req.user!.tenantId;
  const raw = sanitiseInput(req.body as Record<string, unknown>) as any;

  const updates: Record<string, any> = {};
  const fields = [
    "programmeName", "programmeType", "programmeCategory", "academicYear", "term",
    "deliveryModel", "targetYearGroups", "targetStudentCount", "actualStudentCount",
    "startDate", "endDate", "status", "notes", "tags", "impactSummary",
    "sessionCountPlanned", "sessionCountDelivered", "venue", "budget", "fundingStatus",
    "leadContactId", "safeguardingContactId", "programmeManagerId",
  ];
  for (const f of fields) {
    if (raw[f] !== undefined) updates[f] = raw[f];
  }

  const [programme] = await db.update(programmesTable).set(updates)
    .where(and(eq(programmesTable.id, rawId), tenantId ? eq(programmesTable.tenantId, tenantId) : undefined))
    .returning();

  if (!programme) { res.status(404).json({ error: "Not found" }); return; }
  res.json(programme);
});

// DELETE /programmes/:id
router.delete("/:id", authMiddleware, denyDevRoles, requireRole("ADMIN"), async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const tenantId = req.user!.tenantId;

  await db.update(programmesTable).set({ status: "CANCELLED" })
    .where(and(eq(programmesTable.id, rawId), tenantId ? eq(programmesTable.tenantId, tenantId) : undefined));

  res.json({ success: true });
});

export default router;
