import { Router, type IRouter } from "express";
import { db, contactsTable, organizationsTable, activitiesTable, tasksTable, notesTable, usersTable } from "@workspace/db";
import { eq, ilike, and, or, count, desc, ne, asc, gte, lte } from "drizzle-orm";
import { authMiddleware, requireRole, denyDevRoles } from "../lib/auth";
import { generateId } from "../lib/id";
import { sanitiseInput } from "../lib/sanitise";
import { dispatch } from "../lib/webhookDelivery";

const router: IRouter = Router();

router.get("/contacts", authMiddleware, denyDevRoles, async (req, res): Promise<void> => {
  const { search, status, organizationId, ownerId, page = "1", limit = "20", sortBy, scoreMin, scoreMax } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(100, parseInt(limit, 10));
  const offset = (pageNum - 1) * limitNum;
  const tenantId = req.user!.tenantId;

  const conditions = [];
  if (tenantId) conditions.push(eq(contactsTable.tenantId, tenantId));
  if (search)
    conditions.push(
      or(
        ilike(contactsTable.firstName, `%${search}%`),
        ilike(contactsTable.lastName, `%${search}%`),
        ilike(contactsTable.email, `%${search}%`)
      )
    );
  if (status) conditions.push(eq(contactsTable.status, status as any));
  if (organizationId) conditions.push(eq(contactsTable.organizationId, organizationId));
  if (ownerId) conditions.push(eq(contactsTable.ownerId, ownerId));
  if (scoreMin) conditions.push(gte(contactsTable.leadScore, parseInt(scoreMin, 10)));
  if (scoreMax) conditions.push(lte(contactsTable.leadScore, parseInt(scoreMax, 10)));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const orderByClause = sortBy === "leadScore_asc"
    ? asc(contactsTable.leadScore)
    : sortBy === "leadScore_desc"
    ? desc(contactsTable.leadScore)
    : desc(contactsTable.createdAt);

  const [contacts, totalResult] = await Promise.all([
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
        organizationName: organizationsTable.name,
        ownerId: contactsTable.ownerId,
        ownerName: usersTable.name,
        createdAt: contactsTable.createdAt,
        updatedAt: contactsTable.updatedAt,
        leadScore: contactsTable.leadScore,
        leadScoreLabel: contactsTable.leadScoreLabel,
        leadScoreExplanation: contactsTable.leadScoreExplanation,
        leadScoreUpdatedAt: contactsTable.leadScoreUpdatedAt,
      })
      .from(contactsTable)
      .leftJoin(organizationsTable, eq(contactsTable.organizationId, organizationsTable.id))
      .leftJoin(usersTable, eq(contactsTable.ownerId, usersTable.id))
      .where(where)
      .limit(limitNum)
      .offset(offset)
      .orderBy(orderByClause),
    db.select({ count: count() }).from(contactsTable).where(where),
  ]);

  const total = totalResult[0]?.count ?? 0;

  res.json({
    data: contacts,
    total,
    page: pageNum,
    totalPages: Math.ceil(total / limitNum),
  });
});

router.post("/contacts", authMiddleware, denyDevRoles, async (req, res): Promise<void> => {
  const user = req.user!;
  if (user.role === "VIEWER") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const cleanBody = sanitiseInput(req.body as Record<string, unknown>) as any;
  const { firstName, lastName, email, phone, role, status, organizationId, ownerId } = cleanBody;

  if (!firstName || !lastName) {
    res.status(400).json({ error: "firstName and lastName are required" });
    return;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    res.status(400).json({ error: "Invalid email format" });
    return;
  }

  const tenantId = user.tenantId;
  const [existing] = await db
    .select()
    .from(contactsTable)
    .where(and(eq(contactsTable.email, email), tenantId ? eq(contactsTable.tenantId, tenantId) : undefined));
  if (existing) {
    res.status(409).json({ error: "A contact with this email already exists" });
    return;
  }

  const id = generateId("con");
  const values: Record<string, any> = {
    id,
    tenantId: user.tenantId,
    firstName,
    lastName,
    email: email || null,
    phone: phone || null,
    role: role || null,
    status: status || "PROSPECT",
    organizationId: organizationId || null,
    ownerId: ownerId || req.user!.id,
  };

  // Extended contact fields
  const extFields = [
    "jobTitleGroup", "department", "seniorityLevel", "phoneDirect", "mobile",
    "preferredContactMethod", "preferredContactTime", "title",
  ];
  for (const f of extFields) {
    if (cleanBody[f] !== undefined) values[f] = cleanBody[f];
  }
  const boolFields = [
    "isPrimaryContact", "isDecisionMaker", "isDeliveryContact",
    "isSafeguardingRelevant", "isFirstOutreachContact",
    "consentToContact", "marketingOptOut",
  ];
  for (const f of boolFields) {
    if (cleanBody[f] !== undefined) values[f] = cleanBody[f] === true || cleanBody[f] === "true";
  }
  if (cleanBody.lawfulBasis !== undefined) values.lawfulBasis = cleanBody.lawfulBasis;
  if (cleanBody.relationshipStrength !== undefined) values.relationshipStrength = parseInt(cleanBody.relationshipStrength, 10) || null;
  if (cleanBody.tags) values.tags = Array.isArray(cleanBody.tags) ? cleanBody.tags : [cleanBody.tags];
  if (cleanBody.metadata) values.metadata = cleanBody.metadata;

  const [contact] = await db
    .insert(contactsTable)
    .values(values as any)
    .returning();

  const [org] = await db
    .select({ name: organizationsTable.name })
    .from(organizationsTable)
    .where(and(eq(organizationsTable.id, organizationId), tenantId ? eq(organizationsTable.tenantId, tenantId) : undefined));

  res.status(201).json({ ...contact, organizationName: org?.name ?? null, ownerName: req.user!.name });
  if (req.user!.tenantId) dispatch(req.user!.tenantId, "contact.created", { id: contact.id, email: contact.email }).catch(() => {});
});

router.get("/contacts/:id", authMiddleware, denyDevRoles, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const tenantId = req.user!.tenantId;

  const [contact] = await db
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
      organizationName: organizationsTable.name,
      ownerId: contactsTable.ownerId,
      ownerName: usersTable.name,
      createdAt: contactsTable.createdAt,
      updatedAt: contactsTable.updatedAt,
      leadScore: contactsTable.leadScore,
      leadScoreLabel: contactsTable.leadScoreLabel,
      leadScoreExplanation: contactsTable.leadScoreExplanation,
      leadScoreUpdatedAt: contactsTable.leadScoreUpdatedAt,
    })
    .from(contactsTable)
    .leftJoin(organizationsTable, eq(contactsTable.organizationId, organizationsTable.id))
    .leftJoin(usersTable, eq(contactsTable.ownerId, usersTable.id))
    .where(and(eq(contactsTable.id, rawId), tenantId ? eq(contactsTable.tenantId, tenantId) : undefined));

  if (!contact) {
    res.status(404).json({ error: "Contact not found" });
    return;
  }

  const [activities, tasks, notes] = await Promise.all([
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
      .where(and(eq(activitiesTable.contactId, rawId), tenantId ? eq(activitiesTable.tenantId, tenantId) : undefined))
      .orderBy(desc(activitiesTable.date))
      .limit(20),
    db
      .select()
      .from(tasksTable)
      .where(
        and(
          eq(tasksTable.contactId, rawId),
          ne(tasksTable.status, "DONE"),
          tenantId ? eq(tasksTable.tenantId, tenantId) : undefined,
        )
      ),
    db
      .select({
        id: notesTable.id,
        content: notesTable.content,
        authorId: notesTable.authorId,
        authorName: usersTable.name,
        contactId: notesTable.contactId,
        organizationId: notesTable.organizationId,
        createdAt: notesTable.createdAt,
      })
      .from(notesTable)
      .leftJoin(usersTable, eq(notesTable.authorId, usersTable.id))
      .where(and(eq(notesTable.contactId, rawId), tenantId ? eq(notesTable.tenantId, tenantId) : undefined))
      .orderBy(desc(notesTable.createdAt)),
  ]);

  res.json({
    ...contact,
    activities: activities.map((a) => ({
      ...a,
      contactName: `${contact.firstName} ${contact.lastName}`,
      organizationName: contact.organizationName,
    })),
    tasks: tasks.map((t) => ({
      ...t,
      ownerName: null,
      contactName: `${contact.firstName} ${contact.lastName}`,
      organizationName: contact.organizationName,
    })),
    notes,
  });
});

router.patch("/contacts/:id", authMiddleware, denyDevRoles, requireRole("OPERATOR"), async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const tenantId = req.user!.tenantId;
  const raw = sanitiseInput(req.body as Record<string, unknown>) as any;

  const updates: Record<string, any> = {};
  const strFields = [
    "firstName", "lastName", "email", "phone", "role", "status",
    "organizationId", "ownerId", "title",
    "jobTitleGroup", "department", "seniorityLevel", "phoneDirect", "mobile",
    "preferredContactMethod", "preferredContactTime", "lawfulBasis",
  ];
  for (const f of strFields) {
    if (raw[f] !== undefined) updates[f] = raw[f];
  }
  const boolFields = [
    "isPrimaryContact", "isDecisionMaker", "isDeliveryContact",
    "isSafeguardingRelevant", "isFirstOutreachContact",
    "consentToContact", "marketingOptOut",
  ];
  for (const f of boolFields) {
    if (raw[f] !== undefined) updates[f] = raw[f] === true || raw[f] === "true";
  }
  if (raw.lastContactedAt !== undefined) updates.lastContactedAt = raw.lastContactedAt;
  if (raw.consentDate !== undefined) updates.consentDate = raw.consentDate;
  if (raw.nextFollowUpDate !== undefined) updates.nextFollowUpDate = raw.nextFollowUpDate;
  if (raw.relationshipStrength !== undefined) updates.relationshipStrength = parseInt(raw.relationshipStrength, 10) || null;
  if (raw.tags !== undefined) updates.tags = Array.isArray(raw.tags) ? raw.tags : [raw.tags];
  if (raw.metadata !== undefined) updates.metadata = raw.metadata;

  const [contact] = await db
    .update(contactsTable)
    .set(updates)
    .where(and(eq(contactsTable.id, rawId), tenantId ? eq(contactsTable.tenantId, tenantId) : undefined))
    .returning();

  if (!contact) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json({ ...contact, organizationName: null, ownerName: null });
  if (req.user!.tenantId) dispatch(req.user!.tenantId, "contact.updated", { id: contact.id }).catch(() => {});

  // Background lead score recalculation — non-blocking
  if (tenantId) {
    setImmediate(async () => {
      try {
        const { getAIProvider, chatCompletionWithContext } = await import("../lib/aiProvider.js");
        let score = 30;
        if (contact.status === "ACTIVE") score += 20;
        if (contact.lastContactedAt) {
          const daysSince = (Date.now() - new Date(contact.lastContactedAt).getTime()) / 86400000;
          if (daysSince < 7) score += 20;
          else if (daysSince < 30) score += 10;
          else if (daysSince > 90) score -= 10;
        }
        if (contact.email) score += 5;
        if (contact.phone) score += 5;
        if (contact.isDecisionMaker) score += 10;
        if (contact.consentToContact) score += 5;
        score = Math.max(0, Math.min(100, score));
        const label = score <= 30 ? "Cold" : score <= 60 ? "Warm" : score <= 80 ? "Hot" : "Ready";
        let explanation = `Score: ${score}/100 (${label})`;
        try {
          const ctx = await getAIProvider("client", tenantId as string);
          const result = await chatCompletionWithContext(ctx, `A CRM contact scored ${score}/100 (${label}). Status: ${contact.status}. Write one sentence explaining this score.`);
          explanation = result.content.trim();
        } catch { /* AI explanation optional */ }
        await db.update(contactsTable).set({ leadScore: score, leadScoreLabel: label, leadScoreExplanation: explanation, leadScoreUpdatedAt: new Date() })
          .where(and(eq(contactsTable.id, rawId), tenantId ? eq(contactsTable.tenantId, tenantId) : undefined));
      } catch { /* swallow — background job */ }
    });
  }
});

router.delete("/contacts/:id", authMiddleware, denyDevRoles, requireRole("ADMIN", "MANAGER"), async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const tenantId = req.user!.tenantId;
  await db
    .update(contactsTable)
    .set({ status: "INACTIVE" })
    .where(and(eq(contactsTable.id, rawId), tenantId ? eq(contactsTable.tenantId, tenantId) : undefined));
  if (tenantId) dispatch(tenantId, "contact.deleted", { id: rawId }).catch(() => {});
  res.json({ success: true });
});

export default router;
