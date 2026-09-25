import { Router, Request, Response } from "express";
import { db, fundersTable, funderContactsTable, fundingOpportunitiesTable, activitiesTable, contactsTable, usersTable, insertFunderSchema } from "@workspace/db";
import { eq, and, ilike, sql, desc, count, inArray } from "drizzle-orm";
import { authMiddleware, requireRole, denyDevRoles } from "../lib/auth";
import { generateId } from "../lib/id";
import { sanitiseInput } from "../lib/sanitise";
import { logger } from "../lib/logger";

const router = Router();

// GET /funders — list with search, type filter, status filter, page/limit. 
// Include opportunity count and linked contact count.
router.get("/", authMiddleware, denyDevRoles, async (req: Request, res: Response): Promise<void> => {
  try {
    const { search, type, status, organizationId, page = "1", limit: rawLimit = "25" } = req.query;
    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(100, Math.max(1, Number(rawLimit)));
    const offset = (pageNum - 1) * limitNum;
    const tenantId = req.user!.tenantId;

    // If organizationId filter: find funders linked via funder_contacts → contacts → organization
    if (organizationId) {
      const linkedFunders = await db
        .selectDistinct({ id: fundersTable.id, name: fundersTable.name, type: fundersTable.type, status: fundersTable.status })
        .from(fundersTable)
        .innerJoin(funderContactsTable, eq(funderContactsTable.funderId, fundersTable.id))
        .innerJoin(contactsTable, eq(contactsTable.id, funderContactsTable.contactId))
        .where(
          and(
            eq(contactsTable.organizationId, String(organizationId)),
            tenantId ? eq(fundersTable.tenantId, tenantId) : undefined,
            tenantId ? eq(funderContactsTable.tenantId, tenantId) : undefined,
            tenantId ? eq(contactsTable.tenantId, tenantId) : undefined
          )
        );
      res.json(linkedFunders);
      return;
    }

    const where = [];
    if (tenantId) {
      where.push(eq(fundersTable.tenantId, tenantId));
    }
    if (search) {
      where.push(ilike(fundersTable.name, `%${search}%`));
    }
    if (type) {
      where.push(eq(fundersTable.type, type as any));
    }
    if (status) {
      where.push(eq(fundersTable.status, status as any));
    }

    const funders = await db
      .select({
        id: fundersTable.id,
        name: fundersTable.name,
        type: fundersTable.type,
        status: fundersTable.status,
        fundingAreas: fundersTable.fundingAreas,
        typicalGrantMin: fundersTable.typicalGrantMin,
        typicalGrantMax: fundersTable.typicalGrantMax,
        relationshipOwnerId: fundersTable.relationshipOwnerId,
        ownerName: usersTable.name,
        opportunityCount: sql<number>`(SELECT count(*) FROM ${fundingOpportunitiesTable} WHERE ${fundingOpportunitiesTable.funderId} = ${fundersTable.id} ${tenantId ? sql`AND ${fundingOpportunitiesTable.tenantId} = ${tenantId}` : sql``})`.mapWith(Number),
        contactCount: sql<number>`(SELECT count(*) FROM ${funderContactsTable} WHERE ${funderContactsTable.funderId} = ${fundersTable.id} ${tenantId ? sql`AND ${funderContactsTable.tenantId} = ${tenantId}` : sql``})`.mapWith(Number),
      })
      .from(fundersTable)
      .leftJoin(usersTable, eq(fundersTable.relationshipOwnerId, usersTable.id))
      .where(where.length > 0 ? and(...where) : undefined)
      .orderBy(desc(fundersTable.createdAt))
      .limit(limitNum)
      .offset(offset);

    const [totalCountResult] = await db
      .select({ count: count() })
      .from(fundersTable)
      .where(where.length > 0 ? and(...where) : undefined);

    res.json({
      data: funders,
      total: totalCountResult.count,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(totalCountResult.count / limitNum) || 1,
    });
  } catch (error) {
    logger.error({ error }, "Error fetching funders");
    res.status(500).json({ error: "Failed to fetch funders" });
  }
});

// POST /funders — create, required: name, type, relationshipOwnerId
router.post("/", authMiddleware, denyDevRoles, requireRole("ADMIN", "MANAGER", "OPERATOR"), async (req: Request, res: Response): Promise<void> => {
  try {
    const body = sanitiseInput(req.body as any);
    const validated = insertFunderSchema.safeParse({
      ...body,
      id: generateId("funder"),
      tenantId: req.user!.tenantId,
    });

    if (!validated.success) {
      res.status(400).json({ error: "Invalid input", details: validated.error.format() });
      return;
    }

    const [funder] = await db.insert(fundersTable).values(validated.data).returning();
    res.status(201).json(funder);
  } catch (error) {
    logger.error({ error }, "Error creating funder");
    res.status(500).json({ error: "Failed to create funder" });
  }
});

// GET /funders/:id — full detail with linked contacts, opportunities, recent activities
router.get("/:id", authMiddleware, denyDevRoles, async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const tenantId = req.user!.tenantId;

    const [funder] = await db
      .select({
        id: fundersTable.id,
        name: fundersTable.name,
        type: fundersTable.type,
        status: fundersTable.status,
        fundingAreas: fundersTable.fundingAreas,
        typicalGrantMin: fundersTable.typicalGrantMin,
        typicalGrantMax: fundersTable.typicalGrantMax,
        applicationDeadlines: fundersTable.applicationDeadlines,
        website: fundersTable.website,
        notes: fundersTable.notes,
        relationshipOwnerId: fundersTable.relationshipOwnerId,
        ownerName: usersTable.name,
      })
      .from(fundersTable)
      .leftJoin(usersTable, eq(fundersTable.relationshipOwnerId, usersTable.id))
      .where(and(eq(fundersTable.id, id), tenantId ? eq(fundersTable.tenantId, tenantId) : undefined));

    if (!funder) {
      res.status(404).json({ error: "Funder not found" });
      return;
    }

    const linkedContacts = await db
      .select({
        id: contactsTable.id,
        firstName: contactsTable.firstName,
        lastName: contactsTable.lastName,
        email: contactsTable.email,
        role: contactsTable.role,
      })
      .from(funderContactsTable)
      .innerJoin(contactsTable, eq(funderContactsTable.contactId, contactsTable.id))
      .where(
        and(
          eq(funderContactsTable.funderId, id),
          tenantId ? eq(funderContactsTable.tenantId, tenantId) : undefined,
          tenantId ? eq(contactsTable.tenantId, tenantId) : undefined
        )
      );

    const opportunities = await db
      .select()
      .from(fundingOpportunitiesTable)
      .where(and(eq(fundingOpportunitiesTable.funderId, id), tenantId ? eq(fundingOpportunitiesTable.tenantId, tenantId) : undefined))
      .orderBy(desc(fundingOpportunitiesTable.createdAt));

    const opportunityIds = opportunities.map(o => o.id);
    
    let recentActivities: any[] = [];
    if (opportunityIds.length > 0) {
      recentActivities = await db
        .select({
          id: activitiesTable.id,
          type: activitiesTable.type,
          summary: activitiesTable.summary,
          date: activitiesTable.date,
          opportunityId: activitiesTable.opportunityId,
          userName: usersTable.name,
        })
        .from(activitiesTable)
        .leftJoin(usersTable, eq(activitiesTable.userId, usersTable.id))
        .where(and(inArray(activitiesTable.opportunityId, opportunityIds), tenantId ? eq(activitiesTable.tenantId, tenantId) : undefined))
        .orderBy(desc(activitiesTable.date))
        .limit(10);
    }

    res.json({
      ...funder,
      contacts: linkedContacts,
      opportunities,
      recentActivities,
    });
  } catch (error) {
    logger.error({ error }, "Error fetching funder detail");
    res.status(500).json({ error: "Failed to fetch funder detail" });
  }
});

// PATCH /funders/:id — update any field
router.patch("/:id", authMiddleware, denyDevRoles, requireRole("ADMIN", "MANAGER", "OPERATOR"), async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const body = sanitiseInput(req.body as any);
    const tenantId = req.user!.tenantId;

    const [updated] = await db
      .update(fundersTable)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(fundersTable.id, id), tenantId ? eq(fundersTable.tenantId, tenantId) : undefined))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Funder not found" });
      return;
    }

    res.json(updated);
  } catch (error) {
    logger.error({ error }, "Error updating funder");
    res.status(500).json({ error: "Failed to update funder" });
  }
});

// DELETE /funders/:id — soft delete: set status = INACTIVE
router.delete("/:id", authMiddleware, denyDevRoles, requireRole("ADMIN", "MANAGER"), async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const tenantId = req.user!.tenantId;

    const [updated] = await db
      .update(fundersTable)
      .set({ status: "INACTIVE", updatedAt: new Date() })
      .where(and(eq(fundersTable.id, id), tenantId ? eq(fundersTable.tenantId, tenantId) : undefined))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Funder not found" });
      return;
    }

    res.json({ message: "Funder deactivated", funder: updated });
  } catch (error) {
    logger.error({ error }, "Error deleting funder");
    res.status(500).json({ error: "Failed to delete funder" });
  }
});

// POST /funders/:id/contacts — link contact to funder, body: { contactId }, creates funder_contacts record
router.post("/:id/contacts", authMiddleware, denyDevRoles, requireRole("ADMIN", "MANAGER", "OPERATOR"), async (req: Request, res: Response): Promise<void> => {
  try {
    const funderId = req.params.id as string;
    const { contactId } = req.body;
    const tenantId = req.user!.tenantId;

    if (!contactId || typeof contactId !== "string") {
      res.status(400).json({ error: "contactId is required and must be a string" });
      return;
    }

    const [existing] = await db
      .select()
      .from(funderContactsTable)
      .where(
        and(
          eq(funderContactsTable.funderId, funderId),
          eq(funderContactsTable.contactId, contactId),
          tenantId ? eq(funderContactsTable.tenantId, tenantId) : undefined
        )
      );

    if (existing) {
      res.status(409).json({ error: "Contact already linked to this funder" });
      return;
    }

    const [linked] = await db
      .insert(funderContactsTable)
      .values({
        id: generateId("fc"),
        tenantId: req.user!.tenantId,
        funderId,
        contactId,
      })
      .returning();

    res.status(201).json(linked);
  } catch (error) {
    logger.error({ error }, "Error linking contact to funder");
    res.status(500).json({ error: "Failed to link contact" });
  }
});

// DELETE /funders/:id/contacts/:contactId — unlink contact from funder
router.delete("/:id/contacts/:contactId", authMiddleware, denyDevRoles, requireRole("ADMIN", "MANAGER"), async (req: Request, res: Response): Promise<void> => {
  try {
    const funderId = req.params.id as string;
    const contactId = req.params.contactId as string;
    const tenantId = req.user!.tenantId;

    const [deleted] = await db
      .delete(funderContactsTable)
      .where(
        and(
          eq(funderContactsTable.funderId, funderId),
          eq(funderContactsTable.contactId, contactId),
          tenantId ? eq(funderContactsTable.tenantId, tenantId) : undefined
        )
      )
      .returning();

    if (!deleted) {
      res.status(404).json({ error: "Link not found" });
      return;
    }

    res.json({ message: "Contact unlinked successfully" });
  } catch (error) {
    logger.error({ error }, "Error unlinking contact from funder");
    res.status(500).json({ error: "Failed to unlink contact" });
  }
});

export default router;
