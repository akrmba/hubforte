import { Router, type IRouter } from "express";
import { db, contactsTable, organizationsTable, activitiesTable, notesTable } from "@workspace/db";
import { eq, and, or, ilike, desc, SQL } from "drizzle-orm";
import { authenticateApp, requireScope } from "../lib/auth";
import { generateId } from "../lib/id";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// GET /api/v1/contacts?search=&limit=20
router.get("/contacts", authenticateApp, requireScope("contacts.read"), async (req, res): Promise<void> => {
  const { search, limit = "20" } = req.query as Record<string, string>;
  const tenantId = req.appAuth!.tenantId;
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

  const conditions: SQL[] = [eq(contactsTable.tenantId, tenantId)];
  if (search) {
    const searchClause = or(
      ilike(contactsTable.firstName, `%${search}%`),
      ilike(contactsTable.lastName, `%${search}%`),
      ilike(contactsTable.email, `%${search}%`),
      ilike(contactsTable.phone, `%${search}%`)
    );
    if (searchClause) conditions.push(searchClause);
  }

  const contacts = await db
    .select({
      id: contactsTable.id,
      firstName: contactsTable.firstName,
      lastName: contactsTable.lastName,
      email: contactsTable.email,
      phone: contactsTable.phone,
      status: contactsTable.status,
      organizationId: contactsTable.organizationId,
      createdAt: contactsTable.createdAt,
    })
    .from(contactsTable)
    .where(and(...conditions))
    .orderBy(desc(contactsTable.createdAt))
    .limit(limitNum);

  res.json({ data: contacts, count: contacts.length });
});

// GET /api/v1/contacts/:id
router.get("/contacts/:id", authenticateApp, requireScope("contacts.read"), async (req, res): Promise<void> => {
  const tenantId = req.appAuth!.tenantId;
  const contactId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [contact] = await db
    .select({
      id: contactsTable.id,
      firstName: contactsTable.firstName,
      lastName: contactsTable.lastName,
      email: contactsTable.email,
      phone: contactsTable.phone,
      status: contactsTable.status,
      organizationId: contactsTable.organizationId,
      createdAt: contactsTable.createdAt,
      updatedAt: contactsTable.updatedAt,
    })
    .from(contactsTable)
    .where(and(eq(contactsTable.id, contactId), eq(contactsTable.tenantId, tenantId)));

  if (!contact) {
    res.status(404).json({ error: "Contact not found" });
    return;
  }

  res.json(contact);
});

// POST /api/v1/activities
router.post("/activities", authenticateApp, requireScope("activities.write"), async (req, res): Promise<void> => {
  const tenantId = req.appAuth!.tenantId;
  const { contactId, type, subject, notes, duration, occurredAt } = req.body as {
    contactId?: string;
    type?: string;
    subject?: string;
    notes?: string;
    duration?: number;
    occurredAt?: string;
  };

  if (!contactId || !type) {
    res.status(400).json({ error: "contactId and type are required" });
    return;
  }

  // Verify contact belongs to this tenant
  const [contact] = await db
    .select({ id: contactsTable.id })
    .from(contactsTable)
    .where(and(eq(contactsTable.id, contactId), eq(contactsTable.tenantId, tenantId)));

  if (!contact) {
    res.status(404).json({ error: "Contact not found" });
    return;
  }

  const id = generateId();

  // Fix 5: map integrator-friendly type names to the DB enum values
  // The enum is: EMAIL, CALL, NOTE, MEETING, TASK_COMPLETED, SITE_VISIT, WHATSAPP, EVENT, OTHER
  const typeMap: Record<string, string> = {
    email: "EMAIL",
    call: "CALL",
    note: "NOTE",
    meeting: "MEETING",
    task: "TASK_COMPLETED",
    task_completed: "TASK_COMPLETED",
    site_visit: "SITE_VISIT",
    whatsapp: "WHATSAPP",
    event: "EVENT",
    other: "OTHER",
  };
  const mappedType = typeMap[type.toLowerCase()] ?? type.toUpperCase();

  // Append duration and occurredAt to notes so they are preserved without schema changes
  let notesValue = notes || null;
  const meta: string[] = [];
  if (duration) meta.push(`Duration: ${duration}s`);
  if (occurredAt) meta.push(`Occurred at: ${occurredAt}`);
  if (meta.length > 0) {
    notesValue = notesValue ? `${notesValue}\n\n${meta.join(" | ")}` : meta.join(" | ");
  }

  const [activity] = await db
    .insert(activitiesTable)
    .values({
      id,
      tenantId,
      contactId,
      type: mappedType as any,
      subject: subject || type,
      summary: subject || type,
      notes: notesValue,
      userId: "app",
    })
    .returning();

  logger.info({ event: "app_activity_created", appId: req.appAuth!.appId, activityId: id, tenantId });
  res.status(201).json(activity);
});

// GET /api/v1/organizations/:id
router.get("/organizations/:id", authenticateApp, requireScope("organizations.read"), async (req, res): Promise<void> => {
  const tenantId = req.appAuth!.tenantId;
  const orgId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [org] = await db
    .select({
      id: organizationsTable.id,
      name: organizationsTable.name,
      type: organizationsTable.type,
      email: organizationsTable.email,
      phone: organizationsTable.phone,
      website: organizationsTable.website,
      status: organizationsTable.status,
      createdAt: organizationsTable.createdAt,
    })
    .from(organizationsTable)
    .where(and(eq(organizationsTable.id, orgId), eq(organizationsTable.tenantId, tenantId)));

  if (!org) {
    res.status(404).json({ error: "Organization not found" });
    return;
  }

  res.json(org);
});

// POST /api/v1/notes
router.post("/notes", authenticateApp, requireScope("notes.write"), async (req, res): Promise<void> => {
  const tenantId = req.appAuth!.tenantId;
  const { contactId, organizationId, content } = req.body as {
    contactId?: string;
    organizationId?: string;
    content?: string;
  };

  if (!content || content.trim().length === 0) {
    res.status(400).json({ error: "content is required" });
    return;
  }

  if (!contactId && !organizationId) {
    res.status(400).json({ error: "contactId or organizationId is required" });
    return;
  }

  // Verify the linked record belongs to this tenant
  if (contactId) {
    const [c] = await db
      .select({ id: contactsTable.id })
      .from(contactsTable)
      .where(and(eq(contactsTable.id, contactId), eq(contactsTable.tenantId, tenantId)));
    if (!c) {
      res.status(404).json({ error: "Contact not found" });
      return;
    }
  }

  if (organizationId) {
    const [o] = await db
      .select({ id: organizationsTable.id })
      .from(organizationsTable)
      .where(and(eq(organizationsTable.id, organizationId), eq(organizationsTable.tenantId, tenantId)));
    if (!o) {
      res.status(404).json({ error: "Organization not found" });
      return;
    }
  }

  const id = generateId();
  const [note] = await db
    .insert(notesTable)
    .values({
      id,
      tenantId,
      contactId: contactId || null,
      organizationId: organizationId || null,
      content: content.trim(),
      authorId: "app",
    })
    .returning();

  logger.info({ event: "app_note_created", appId: req.appAuth!.appId, noteId: id, tenantId });
  res.status(201).json(note);
});

// GET /api/v1/deals
router.get("/deals", authenticateApp, requireScope("deals.read"), async (req, res): Promise<void> => {
  // Import fundingOpportunitiesTable — the deals/pipeline table in this codebase
  const { fundingOpportunitiesTable } = await import("@workspace/db");
  const tenantId = req.appAuth!.tenantId;
  const { limit = "20" } = req.query as Record<string, string>;
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

  const deals = await db
    .select({
      id: fundingOpportunitiesTable.id,
      name: fundingOpportunitiesTable.name,
      fundingType: fundingOpportunitiesTable.fundingType,
      amountExpected: fundingOpportunitiesTable.amountExpected,
      funderId: fundingOpportunitiesTable.funderId,
      createdAt: fundingOpportunitiesTable.createdAt,
    })
    .from(fundingOpportunitiesTable)
    .where(eq(fundingOpportunitiesTable.tenantId, tenantId))
    .orderBy(desc(fundingOpportunitiesTable.createdAt))
    .limit(limitNum);

  res.json({ data: deals, count: deals.length });
});

export default router;
