import { Router } from "express";
import { db, fundingOpportunitiesTable, fundersTable, organizationsTable, usersTable, activitiesTable } from "@workspace/db";
// Cast to any to handle schema field mismatches from pre-Phase-4 route code
const fot = fundingOpportunitiesTable as any;
import { eq, and, or, ilike, desc, count } from "drizzle-orm";
import { authMiddleware, requireRole, denyDevRoles } from "../lib/auth";
import { generateId } from "../lib/id";
import { sanitiseInput } from "../lib/sanitise";
import { logger } from "../lib/logger";
import { dispatch } from "../lib/webhookDelivery";

const router = Router();

// GET /opportunities — list with filters: stage, funderId, organizationId, ownerId, search.
// Include funder name, org name, owner name.
router.get("/", authMiddleware, denyDevRoles, async (req, res): Promise<void> => {
  try {
    const { stage, funderId, organizationId, ownerId, search, page = "1", limit: rawLimit = "25" } = req.query;
    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(100, Math.max(1, Number(rawLimit)));
    const offset = (pageNum - 1) * limitNum;
    const tenantId = req.user!.tenantId;

    const query = db
      .select({
        id: fot.id,
        name: fot.name,
        value: fot.value,
        stage: fot.stage,
        funderId: fot.funderId,
        funderName: fundersTable.name,
        organizationId: fot.organizationId,
        organizationName: organizationsTable.name,
        ownerId: fot.ownerId,
        ownerName: usersTable.name,
        expectedCloseDate: fot.expectedCloseDate,
        actualCloseDate: fot.actualCloseDate,
        createdAt: fot.createdAt,
      })
      .from(fot)
      .leftJoin(fundersTable, eq(fot.funderId, fundersTable.id))
      .leftJoin(organizationsTable, eq(fot.organizationId, organizationsTable.id))
      .leftJoin(usersTable, eq(fot.ownerId, usersTable.id));

    const filters = [];
    if (tenantId) filters.push(eq(fot.tenantId, tenantId));
    if (stage) filters.push(eq(fot.stage, stage as any));
    if (funderId) filters.push(eq(fot.funderId, funderId as string));
    if (organizationId) filters.push(eq(fot.organizationId, organizationId as string));
    if (ownerId) filters.push(eq(fot.ownerId, ownerId as string));
    if (search) filters.push(ilike(fot.name, `%${search}%`));

    const results = await query
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(desc(fot.createdAt))
      .limit(limitNum)
      .offset(offset);

    const [totalResult] = await db
      .select({ count: count() })
      .from(fot)
      .where(filters.length > 0 ? and(...filters) : undefined);

    res.json({ data: results, total: totalResult.count, page: pageNum, limit: limitNum, totalPages: Math.ceil(totalResult.count / limitNum) || 1 });
    return;
  } catch (error) {
    logger.error({ error }, "Failed to fetch opportunities");
    res.status(500).json({ error: "Failed to fetch opportunities" });
    return;
  }
});

// POST /opportunities — create, required: name, stage, ownerId.
// Auto-set actualCloseDate when stage is AWARDED/DECLINED/LOST.
router.post("/", authMiddleware, denyDevRoles, requireRole("ADMIN", "MANAGER", "OPERATOR"), async (req, res): Promise<void> => {
  try {
    const body = sanitiseInput(req.body);
    const { name, stage, ownerId, value, funderId, organizationId, expectedCloseDate, description, notes } = body;

    if (!name || !stage || !ownerId) {
      res.status(400).json({ error: "Name, stage, and ownerId are required" });
      return;
    }

    const id = generateId("opp");
    let actualCloseDate = null;
    if (["AWARDED", "DECLINED", "LOST"].includes(stage)) {
      actualCloseDate = new Date();
    }

    const [opportunity] = (await db
      .insert(fot)
      .values({
        id,
        tenantId: req.user!.tenantId,
        name,
        stage,
        ownerId,
        value: value ? String(value) : null,
        funderId,
        organizationId,
        expectedCloseDate: expectedCloseDate ? new Date(expectedCloseDate) : null,
        actualCloseDate,
        description,
        notes,
      })
      .returning()) as any[];

    res.status(201).json(opportunity);
    if (req.user!.tenantId) dispatch(req.user!.tenantId, "opportunity.created", { id: opportunity?.id }).catch(() => {});
    return;
  } catch (error) {
    logger.error({ error }, "Failed to create opportunity");
    res.status(500).json({ error: "Failed to create opportunity" });
    return;
  }
});

// GET /opportunities/:id — full detail with funder, org, activities (via opportunityActivitiesTable), owner
router.get("/:id", authMiddleware, denyDevRoles, async (req, res): Promise<void> => {
  try {
    const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const tenantId = req.user!.tenantId;

    const [opportunity] = await db
      .select({
        id: fot.id,
        name: fot.name,
        value: fot.value,
        stage: fot.stage,
        funderId: fot.funderId,
        funderName: fundersTable.name,
        organizationId: fot.organizationId,
        organizationName: organizationsTable.name,
        ownerId: fot.ownerId,
        ownerName: usersTable.name,
        expectedCloseDate: fot.expectedCloseDate,
        actualCloseDate: fot.actualCloseDate,
        description: fot.description,
        notes: fot.notes,
        createdAt: fot.createdAt,
        updatedAt: fot.updatedAt,
      })
      .from(fot)
      .leftJoin(fundersTable, eq(fot.funderId, fundersTable.id))
      .leftJoin(organizationsTable, eq(fot.organizationId, organizationsTable.id))
      .leftJoin(usersTable, eq(fot.ownerId, usersTable.id))
      .where(and(eq(fot.id, rawId), tenantId ? eq(fot.tenantId, tenantId) : undefined));

    if (!opportunity) {
      res.status(404).json({ error: "Opportunity not found" });
      return;
    }

    const activities = await db
      .select({
        id: activitiesTable.id,
        type: activitiesTable.type,
        summary: activitiesTable.summary,
        date: activitiesTable.date,
        userId: activitiesTable.userId,
        userName: usersTable.name,
      })
      .from(activitiesTable)
      .leftJoin(usersTable, eq(activitiesTable.userId, usersTable.id))
      .where(and(eq(activitiesTable.opportunityId, rawId), tenantId ? eq(activitiesTable.tenantId, tenantId) : undefined))
      .orderBy(desc(activitiesTable.date));

    res.json({ ...opportunity, activities });
    return;
  } catch (error) {
    logger.error({ error }, "Failed to fetch opportunity detail");
    res.status(500).json({ error: "Failed to fetch opportunity detail" });
    return;
  }
});

// PATCH /opportunities/:id — update any field. Set actualCloseDate when stage becomes terminal.
router.patch("/:id", authMiddleware, denyDevRoles, requireRole("ADMIN", "MANAGER", "OPERATOR"), async (req, res): Promise<void> => {
  try {
    const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const body = sanitiseInput(req.body);
    const tenantId = req.user!.tenantId;

    const [existing] = await db
      .select()
      .from(fot)
      .where(and(eq(fot.id, rawId), tenantId ? eq(fot.tenantId, tenantId) : undefined));

    if (!existing) {
      res.status(404).json({ error: "Opportunity not found" });
      return;
    }

    const updateData: any = { ...body };

    if (body.value) {
      updateData.value = String(body.value);
    }
    if (body.expectedCloseDate) {
      updateData.expectedCloseDate = new Date(body.expectedCloseDate);
    }

    // Set actualCloseDate when stage becomes terminal
    if (body.stage && body.stage !== existing.stage) {
      if (["AWARDED", "DECLINED", "LOST"].includes(body.stage)) {
        updateData.actualCloseDate = new Date();
      } else {
        updateData.actualCloseDate = null;
      }
    }

    const [updated] = await db
      .update(fot)
      .set(updateData)
      .where(and(eq(fot.id, rawId), tenantId ? eq(fot.tenantId, tenantId) : undefined))
      .returning();

    // Log activity note when stage changes
    if (body.stage && body.stage !== existing.stage && existing.organizationId) {
      await db.insert(activitiesTable).values({
        id: generateId("activity"),
        tenantId: req.user!.tenantId,
        type: "NOTE" as const,
        summary: `Stage changed to ${body.stage} on opportunity: ${existing.name}`,
        organizationId: existing.organizationId,
        opportunityId: rawId,
        userId: req.user!.id,
      });
    }

    res.json(updated);
    return;
  } catch (error) {
    logger.error({ error }, "Failed to update opportunity");
    res.status(500).json({ error: "Failed to update opportunity" });
    return;
  }
});

// DELETE /opportunities/:id — delete
router.delete("/:id", authMiddleware, denyDevRoles, requireRole("ADMIN", "MANAGER", "OPERATOR"), async (req, res): Promise<void> => {
  try {
    const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const tenantId = req.user!.tenantId;

    const [deleted] = (await db
      .delete(fot)
      .where(and(eq(fot.id, rawId), tenantId ? eq(fot.tenantId, tenantId) : undefined))
      .returning()) as any[];

    if (!deleted) {
      res.status(404).json({ error: "Opportunity not found" });
      return;
    }

    res.json({ message: "Opportunity deleted successfully" });
    return;
  } catch (error) {
    logger.error({ error }, "Failed to delete opportunity");
    res.status(500).json({ error: "Failed to delete opportunity" });
    return;
  }
});

export default router;
