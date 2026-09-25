import { Router } from "express";
import { db, volunteersTable, contactsTable, organizationsTable } from "@workspace/db";
import { eq, and, or, ilike, count } from "drizzle-orm";
import { authMiddleware, requireRole, denyDevRoles } from "../lib/auth";
import { generateId } from "../lib/id";
import { sanitiseInput } from "../lib/sanitise";
import { logger } from "../lib/logger";

const router = Router();

// Helper to compute compliance status
const getComplianceStatus = (dbsStatus: string, dbsExpiresAt: Date | null) => {
  if (dbsStatus !== "CLEAR") return "NON_COMPLIANT";
  if (!dbsExpiresAt) return "NON_COMPLIANT";
  
  const today = new Date();
  const expiryDate = new Date(dbsExpiresAt);
  
  if (expiryDate <= today) return "NON_COMPLIANT";
  
  const sixtyDaysFromNow = new Date();
  sixtyDaysFromNow.setDate(today.getDate() + 60);
  
  if (expiryDate <= sixtyDaysFromNow) return "EXPIRING_SOON";
  
  return "COMPLIANT";
};

// GET /volunteers — list with filters
router.get("/", authMiddleware, denyDevRoles, async (req, res): Promise<void> => {
  try {
    const { dbsStatus, search, compliance, page = "1", limit: rawLimit = "25" } = req.query;
    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(100, Math.max(1, Number(rawLimit)));
    const offset = (pageNum - 1) * limitNum;
    const tenantId = req.user!.tenantId;

    let query = db
      .select({
        id: volunteersTable.id,
        contactId: volunteersTable.contactId,
        dbsStatus: volunteersTable.dbsStatus,
        dbsCheckedAt: volunteersTable.dbsCheckedAt,
        dbsExpiresAt: volunteersTable.dbsExpiresAt,
        availability: volunteersTable.availability,
        skills: volunteersTable.skills,
        firstName: contactsTable.firstName,
        lastName: contactsTable.lastName,
        organizationId: contactsTable.organizationId,
        organizationName: organizationsTable.name,
      })
      .from(volunteersTable)
      .innerJoin(contactsTable, eq(volunteersTable.contactId, contactsTable.id))
      .leftJoin(organizationsTable, eq(contactsTable.organizationId, organizationsTable.id))
      .$dynamic();

    const filters = [];
    if (tenantId) {
      filters.push(eq(volunteersTable.tenantId, tenantId));
      filters.push(eq(contactsTable.tenantId, tenantId));
    }

    if (dbsStatus) {
      filters.push(eq(volunteersTable.dbsStatus, dbsStatus as any));
    }

    if (search) {
      const searchPattern = `%${search}%`;
      filters.push(
        or(
          ilike(contactsTable.firstName, searchPattern),
          ilike(contactsTable.lastName, searchPattern),
          ilike(organizationsTable.name, searchPattern)
        )
      );
    }

    if (filters.length > 0) {
      query = query.where(and(...filters));
    }

    const results = await query.limit(limitNum).offset(offset);

    // Count total
    let countQuery = db
      .select({ count: count() })
      .from(volunteersTable)
      .innerJoin(contactsTable, eq(volunteersTable.contactId, contactsTable.id))
      .leftJoin(organizationsTable, eq(contactsTable.organizationId, organizationsTable.id))
      .$dynamic();

    if (filters.length > 0) {
      countQuery = countQuery.where(and(...filters));
    }

    const [totalResult] = await countQuery;
    let total = totalResult.count;

    // Filter by compliance if requested (since it's a computed field)
    const formattedResults = results.map((v) => ({
      ...v,
      complianceStatus: getComplianceStatus(v.dbsStatus, v.dbsExpiresAt),
    }));

    if (compliance) {
      const filtered = formattedResults.filter((v) => v.complianceStatus === compliance);
      res.json({ data: filtered, total: filtered.length, page: pageNum, limit: limitNum, totalPages: Math.ceil(filtered.length / limitNum) || 1 });
    } else {
      res.json({ data: formattedResults, total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) || 1 });
    }
  } catch (error) {
    logger.error({ error }, "Error fetching volunteers");
    res.status(500).json({ error: "Failed to fetch volunteers" });
  }
});

// POST /volunteers — create
router.post("/", authMiddleware, denyDevRoles, requireRole("ADMIN", "MANAGER", "OPERATOR"), async (req, res): Promise<void> => {
  try {
    const body = sanitiseInput(req.body);
    const { contactId } = body;
    const tenantId = req.user!.tenantId;

    if (!contactId) {
      res.status(400).json({ error: "contactId is required" });
      return;
    }

    // Check uniqueness
    const [existing] = await db
      .select()
      .from(volunteersTable)
      .where(and(eq(volunteersTable.contactId, contactId as string), tenantId ? eq(volunteersTable.tenantId, tenantId) : undefined))
      .limit(1);

    if (existing) {
      res.status(409).json({ error: "Volunteer already exists for this contact" });
      return;
    }

    const id = generateId("vol");
    const newVolunteer = {
      ...body,
      id,
      tenantId: req.user!.tenantId,
    } as any;

    await db.insert(volunteersTable).values(newVolunteer);

    const [created] = await db
      .select()
      .from(volunteersTable)
      .where(and(eq(volunteersTable.id, id), tenantId ? eq(volunteersTable.tenantId, tenantId) : undefined))
      .limit(1);

    res.status(201).json(created);
  } catch (error) {
    logger.error({ error }, "Error creating volunteer");
    res.status(500).json({ error: "Failed to create volunteer" });
  }
});

// GET /volunteers/:id — full detail
router.get("/:id", authMiddleware, denyDevRoles, async (req, res): Promise<void> => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;

    const [volunteer] = await db
      .select({
        id: volunteersTable.id,
        contactId: volunteersTable.contactId,
        dbsStatus: volunteersTable.dbsStatus,
        dbsCheckedAt: volunteersTable.dbsCheckedAt,
        dbsExpiresAt: volunteersTable.dbsExpiresAt,
        availability: volunteersTable.availability,
        skills: volunteersTable.skills,
        references: volunteersTable.references,
        internalNotes: volunteersTable.internalNotes,
        createdAt: volunteersTable.createdAt,
        updatedAt: volunteersTable.updatedAt,
        contact: {
          id: contactsTable.id,
          firstName: contactsTable.firstName,
          lastName: contactsTable.lastName,
          email: contactsTable.email,
          phone: contactsTable.phone,
          organizationId: contactsTable.organizationId,
        },
        organization: {
          id: organizationsTable.id,
          name: organizationsTable.name,
        },
      })
      .from(volunteersTable)
      .innerJoin(contactsTable, eq(volunteersTable.contactId, contactsTable.id))
      .leftJoin(organizationsTable, eq(contactsTable.organizationId, organizationsTable.id))
      .where(
        and(
          eq(volunteersTable.id, id as string),
          tenantId ? eq(volunteersTable.tenantId, tenantId) : undefined,
          tenantId ? eq(contactsTable.tenantId, tenantId) : undefined
        )
      )
      .limit(1);

    if (!volunteer) {
      res.status(404).json({ error: "Volunteer not found" });
      return;
    }

    res.json({
      ...volunteer,
      complianceStatus: getComplianceStatus(volunteer.dbsStatus, volunteer.dbsExpiresAt),
    });
  } catch (error) {
    logger.error({ error }, "Error fetching volunteer detail");
    res.status(500).json({ error: "Failed to fetch volunteer" });
  }
});

// PATCH /volunteers/:id — update
router.patch("/:id", authMiddleware, denyDevRoles, requireRole("ADMIN", "MANAGER", "OPERATOR"), async (req, res): Promise<void> => {
  try {
    const { id } = req.params;
    const body = sanitiseInput(req.body);
    const tenantId = req.user!.tenantId;

    const [existing] = await db
      .select()
      .from(volunteersTable)
      .where(and(eq(volunteersTable.id, id as string), tenantId ? eq(volunteersTable.tenantId, tenantId) : undefined))
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: "Volunteer not found" });
      return;
    }

    const updateData: any = { ...body };

    // logic: if dbsStatus changes to CLEAR and no dbsExpiresAt provided, set to 3 years from today
    if (body.dbsStatus === "CLEAR" && existing.dbsStatus !== "CLEAR" && !body.dbsExpiresAt) {
      const threeYearsFromNow = new Date();
      threeYearsFromNow.setFullYear(threeYearsFromNow.getFullYear() + 3);
      updateData.dbsExpiresAt = threeYearsFromNow;
    }

    await db
      .update(volunteersTable)
      .set(updateData)
      .where(and(eq(volunteersTable.id, id as string), tenantId ? eq(volunteersTable.tenantId, tenantId) : undefined));

    const [updated] = await db
      .select()
      .from(volunteersTable)
      .where(and(eq(volunteersTable.id, id as string), tenantId ? eq(volunteersTable.tenantId, tenantId) : undefined))
      .limit(1);

    res.json(updated);
  } catch (error) {
    logger.error({ error }, "Error updating volunteer");
    res.status(500).json({ error: "Failed to update volunteer" });
  }
});

// DELETE /volunteers/:id — delete
router.delete("/:id", authMiddleware, denyDevRoles, requireRole("ADMIN", "MANAGER", "OPERATOR"), async (req, res): Promise<void> => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;

    const [existing] = await db
      .select()
      .from(volunteersTable)
      .where(and(eq(volunteersTable.id, id as string), tenantId ? eq(volunteersTable.tenantId, tenantId) : undefined))
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: "Volunteer not found" });
      return;
    }

    await db
      .delete(volunteersTable)
      .where(and(eq(volunteersTable.id, id as string), tenantId ? eq(volunteersTable.tenantId, tenantId) : undefined));

    res.json({ success: true });
  } catch (error) {
    logger.error({ error }, "Error deleting volunteer");
    res.status(500).json({ error: "Failed to delete volunteer" });
  }
});


export default router;

