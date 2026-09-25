import { Router, type IRouter } from "express";
import { db, organizationsTable, contactsTable, activitiesTable, tasksTable, usersTable, programmesTable } from "@workspace/db";
import { eq, ilike, and, or, count, desc, ne, inArray } from "drizzle-orm";
import { authMiddleware, requireRole, denyDevRoles } from "../lib/auth";
import { generateId } from "../lib/id";
import { sanitiseInput } from "../lib/sanitise";
import { logger } from "../lib/logger";
import { dispatch } from "../lib/webhookDelivery";

const router: IRouter = Router();

router.get("/organizations", authMiddleware, denyDevRoles, async (req, res): Promise<void> => {
  const { search, status, type, relationshipStatus, deliveryStatus, region, phase, parentOrgId, page = "1", limit = "20" } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(100, parseInt(limit, 10));
  const offset = (pageNum - 1) * limitNum;
  const tenantId = req.user!.tenantId;

  const conditions = [];
  if (tenantId) conditions.push(eq(organizationsTable.tenantId, tenantId));
  if (search) conditions.push(or(ilike(organizationsTable.name, `%${search}%`), ilike(organizationsTable.urn, `%${search}%`)));
  if (status) conditions.push(eq(organizationsTable.status, status as any));
  if (type) conditions.push(eq(organizationsTable.type, type as any));
  if (relationshipStatus) conditions.push(eq(organizationsTable.relationshipStatus, relationshipStatus));
  if (deliveryStatus) conditions.push(eq(organizationsTable.deliveryStatus, deliveryStatus));
  if (region) conditions.push(eq(organizationsTable.region, region));
  if (phase) conditions.push(eq(organizationsTable.phase, phase));
  if (parentOrgId) conditions.push(eq(organizationsTable.parentOrgId, parentOrgId));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [orgs, totalResult] = await Promise.all([
    db
      .select({
        id: organizationsTable.id,
        name: organizationsTable.name,
        type: organizationsTable.type,
        status: organizationsTable.status,
        location: organizationsTable.location,
        notes: organizationsTable.notes,
        ownerId: organizationsTable.ownerId,
        ownerName: usersTable.name,
        relationshipStatus: organizationsTable.relationshipStatus,
        deliveryStatus: organizationsTable.deliveryStatus,
        region: organizationsTable.region,
        phase: organizationsTable.phase,
        urn: organizationsTable.urn,
        parentOrgId: organizationsTable.parentOrgId,
        sector: organizationsTable.sector,
        engagementScore: organizationsTable.engagementScore,
        createdAt: organizationsTable.createdAt,
        updatedAt: organizationsTable.updatedAt,
      })
      .from(organizationsTable)
      .leftJoin(usersTable, eq(organizationsTable.ownerId, usersTable.id))
      .where(where)
      .limit(limitNum)
      .offset(offset)
      .orderBy(desc(organizationsTable.createdAt)),
    db.select({ count: count() }).from(organizationsTable).where(where),
  ]);

  const orgIds = orgs.map((o) => o.id);
  const contactCounts =
    orgIds.length > 0
      ? await db
          .select({ orgId: contactsTable.organizationId, cnt: count() })
          .from(contactsTable)
          .where(
            and(
              orgIds.length === 1
                ? eq(contactsTable.organizationId, orgIds[0])
                : inArray(contactsTable.organizationId, orgIds),
              tenantId ? eq(contactsTable.tenantId, tenantId) : undefined,
            )
          )
          .groupBy(contactsTable.organizationId)
      : [];

  const countMap = new Map(contactCounts.map((c) => [c.orgId, c.cnt]));
  const total = totalResult[0]?.count ?? 0;

  res.json({
    data: orgs.map((o) => ({ ...o, contactCount: countMap.get(o.id) ?? 0, lastActivityAt: null })),
    total,
    page: pageNum,
    totalPages: Math.ceil(total / limitNum),
  });
});

router.post("/organizations", authMiddleware, denyDevRoles, async (req, res): Promise<void> => {
  const user = req.user!;
  if (!["ADMIN", "MANAGER"].includes(user.role)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const raw = sanitiseInput(req.body as Record<string, unknown>) as any;
  const { name, type } = raw;
  if (!name || !type) {
    res.status(400).json({ error: "name and type are required" });
    return;
  }

  const id = generateId("org");
  const values: Record<string, any> = {
    id,
    tenantId: user.tenantId,
    name,
    type,
    status: raw.status || "PROSPECT",
    location: raw.location || null,
    notes: raw.notes || null,
    ownerId: raw.ownerId || user.id,
  };

  // Extended fields — all nullable, set if provided
  const extFields = [
    "website", "phone", "address", "postcode", "region", "email",
    "orgSubtype", "urn", "ukprn", "charityNumber", "companiesHouseNumber",
    "localAuthority", "country", "phase", "sixthFormType",
    "ofstedRating", "lastInspectionDate", "trustType",
    "ceo", "educationLead", "safeguardingLead", "sector", "csrPriority",
    "deliveryStatus", "priority", "headteacher", "dsl", "senco",
    "headOfSixthForm", "careersLead", "source", "needsSummary",
    "parentOrgId", "relationshipStatus",
  ];
  for (const f of extFields) {
    if (raw[f] !== undefined) values[f] = raw[f];
  }
  const intFields = ["ageRangeLow", "ageRangeHigh", "numberOnRoll", "numberOfSchools", "engagementScore"];
  for (const f of intFields) {
    if (raw[f] !== undefined) values[f] = parseInt(raw[f], 10) || null;
  }
  const floatFields = ["fsmPercent", "senSupportPercent", "ehcpPercent", "attendancePercent", "persistentAbsencePercent", "suspensionPercent", "permanentExclusionPercent", "distanceFromProjectSite"];
  for (const f of floatFields) {
    if (raw[f] !== undefined) values[f] = parseFloat(raw[f]) || null;
  }
  const boolFields = ["hasSixthForm", "resourcedProvisionFlag", "senUnitFlag", "alternativeProvisionFlag", "employeeVolunteeringInterest"];
  for (const f of boolFields) {
    if (raw[f] !== undefined) values[f] = raw[f] === true || raw[f] === "true";
  }
  if (raw.tags) values.tags = Array.isArray(raw.tags) ? raw.tags : [raw.tags];
  if (raw.metadata) values.metadata = raw.metadata;

  const [org] = await db.insert(organizationsTable).values(values as any).returning();
  if (user.tenantId) dispatch(user.tenantId, "organization.created", { id: org.id, name: org.name }).catch(() => {});
  res.status(201).json({ ...org, contactCount: 0, ownerName: user.name, lastActivityAt: null });
});

router.get("/organizations/:id", authMiddleware, denyDevRoles, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const tenantId = req.user!.tenantId;

  const [org] = await db
    .select()
    .from(organizationsTable)
    .where(and(eq(organizationsTable.id, rawId), tenantId ? eq(organizationsTable.tenantId, tenantId) : undefined));

  if (!org) {
    res.status(404).json({ error: "Organization not found" });
    return;
  }

  const [contacts, activities, tasks] = await Promise.all([
    db
      .select({
        id: contactsTable.id,
        firstName: contactsTable.firstName,
        lastName: contactsTable.lastName,
        role: contactsTable.role,
        email: contactsTable.email,
        phone: contactsTable.phone,
        status: contactsTable.status,
        lastContactedAt: contactsTable.lastContactedAt,
        organizationId: contactsTable.organizationId,
        ownerId: contactsTable.ownerId,
        createdAt: contactsTable.createdAt,
        updatedAt: contactsTable.updatedAt,
      })
      .from(contactsTable)
      .where(and(eq(contactsTable.organizationId, rawId), tenantId ? eq(contactsTable.tenantId, tenantId) : undefined)),
    db
      .select({
        id: activitiesTable.id,
        type: activitiesTable.type,
        summary: activitiesTable.summary,
        date: activitiesTable.date,
        contactId: activitiesTable.contactId,
        organizationId: activitiesTable.organizationId,
        userId: activitiesTable.userId,
        userName: usersTable.name,
        createdAt: activitiesTable.createdAt,
      })
      .from(activitiesTable)
      .leftJoin(usersTable, eq(activitiesTable.userId, usersTable.id))
      .where(and(eq(activitiesTable.organizationId, rawId), tenantId ? eq(activitiesTable.tenantId, tenantId) : undefined))
      .orderBy(desc(activitiesTable.date))
      .limit(10),
    db
      .select()
      .from(tasksTable)
      .where(
        and(
          eq(tasksTable.organizationId, rawId),
          ne(tasksTable.status, "DONE"),
          tenantId ? eq(tasksTable.tenantId, tenantId) : undefined,
        )
      ),
  ]);

  res.json({
    ...org,
    contactCount: contacts.length,
    lastActivityAt: activities[0]?.date ?? null,
    contacts: contacts.map((c) => ({ ...c, organizationName: org.name, ownerName: null })),
    activities: activities.map((a) => ({ ...a, contactName: null, organizationName: org.name })),
    tasks: tasks.map((t) => ({ ...t, ownerName: null, contactName: null, organizationName: org.name })),
  });
});

router.patch("/organizations/:id", authMiddleware, denyDevRoles, async (req, res): Promise<void> => {
  const user = req.user!;
  if (!["ADMIN", "MANAGER"].includes(user.role)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const tenantId = req.user!.tenantId;
  const raw = sanitiseInput(req.body as Record<string, unknown>) as any;

  const updates: Record<string, any> = {};
  const strFields = [
    "name", "type", "status", "location", "notes", "ownerId",
    "website", "phone", "address", "postcode", "region", "email",
    "orgSubtype", "urn", "ukprn", "charityNumber", "companiesHouseNumber",
    "localAuthority", "country", "phase", "sixthFormType",
    "ofstedRating", "lastInspectionDate", "trustType",
    "ceo", "educationLead", "safeguardingLead", "sector", "csrPriority",
    "deliveryStatus", "priority", "headteacher", "dsl", "senco",
    "headOfSixthForm", "careersLead", "source", "needsSummary",
    "parentOrgId", "relationshipStatus",
  ];
  for (const f of strFields) {
    if (raw[f] !== undefined) updates[f] = raw[f];
  }
  const intFields = ["ageRangeLow", "ageRangeHigh", "numberOnRoll", "numberOfSchools", "engagementScore"];
  for (const f of intFields) {
    if (raw[f] !== undefined) updates[f] = parseInt(raw[f], 10) || null;
  }
  const floatFields = ["fsmPercent", "senSupportPercent", "ehcpPercent", "attendancePercent", "persistentAbsencePercent", "suspensionPercent", "permanentExclusionPercent", "distanceFromProjectSite"];
  for (const f of floatFields) {
    if (raw[f] !== undefined) updates[f] = parseFloat(raw[f]) || null;
  }
  const boolFields = ["hasSixthForm", "resourcedProvisionFlag", "senUnitFlag", "alternativeProvisionFlag", "employeeVolunteeringInterest"];
  for (const f of boolFields) {
    if (raw[f] !== undefined) updates[f] = raw[f] === true || raw[f] === "true";
  }
  if (raw.tags !== undefined) updates.tags = Array.isArray(raw.tags) ? raw.tags : [raw.tags];
  if (raw.metadata !== undefined) updates.metadata = raw.metadata;

  const [org] = await db
    .update(organizationsTable)
    .set(updates)
    .where(and(eq(organizationsTable.id, rawId), tenantId ? eq(organizationsTable.tenantId, tenantId) : undefined))
    .returning();

  if (!org) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json({ ...org, contactCount: 0, ownerName: null, lastActivityAt: null });
  if (user.tenantId) dispatch(user.tenantId, "organization.updated", { id: org.id, name: org.name }).catch(() => {});
});

router.delete("/organizations/:id", authMiddleware, denyDevRoles, async (req, res): Promise<void> => {
  const user = req.user!;
  if (!["ADMIN", "MANAGER"].includes(user.role)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const tenantId = req.user!.tenantId;
  await db
    .update(organizationsTable)
    .set({ status: "INACTIVE" })
    .where(and(eq(organizationsTable.id, rawId), tenantId ? eq(organizationsTable.tenantId, tenantId) : undefined));

  if (tenantId) dispatch(tenantId, "organization.deleted", { id: rawId }).catch(() => {});
  res.json({ success: true });
});

export default router;
