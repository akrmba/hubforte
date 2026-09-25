import { Router } from "express";
import { db, supportTicketsTable, ticketUpdatesTable, aiTicketDiagnosesTable, contactsTable, organizationsTable, usersTable, activitiesTable, tenantsTable } from "@workspace/db";
import { eq, and, or, ilike, desc, asc, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { authMiddleware, requireRole, denyDevRoles } from "../lib/auth";
import { generateId } from "../lib/id";
import { sanitiseInput } from "../lib/sanitise";
import { logger } from "../lib/logger";
import { createNotification } from "../lib/notifications";
import { dispatch } from "../lib/webhookDelivery";

const router = Router();
const assigneeUser = alias(usersTable, "assignee_user");

// GET /support/tickets — list with filters: status, priority, assignedToId, contactId, search.
// Include reporter name, assignee name, contact name, update count.
router.get("/tickets", authMiddleware, denyDevRoles, async (req, res): Promise<void> => {
  try {
    const { status, priority, assignedToId, contactId, search } = req.query;
    const tenantId = req.user!.tenantId;

    const query = db
      .select({
        id: supportTicketsTable.id,
        ticketNumber: supportTicketsTable.ticketNumber,
        title: supportTicketsTable.title,
        status: supportTicketsTable.status,
        priority: supportTicketsTable.priority,
        createdAt: supportTicketsTable.createdAt,
        updatedAt: supportTicketsTable.updatedAt,
        reportedBy: {
          id: usersTable.id,
          name: usersTable.name,
        },
        assignedTo: {
          id: assigneeUser.id,
          name: assigneeUser.name,
        },
        contact: {
          id: contactsTable.id,
          firstName: contactsTable.firstName,
          lastName: contactsTable.lastName,
        },
        updateCount: sql<number>`(SELECT count(*) FROM ${ticketUpdatesTable} WHERE ${ticketUpdatesTable.ticketId} = ${supportTicketsTable.id} ${tenantId ? sql`AND ${ticketUpdatesTable.tenantId} = ${tenantId}` : sql``})`.mapWith(Number),
      })
      .from(supportTicketsTable)
      .leftJoin(usersTable, and(eq(supportTicketsTable.reportedById, usersTable.id), tenantId ? eq(usersTable.tenantId, tenantId) : undefined))
      .leftJoin(assigneeUser, and(eq(supportTicketsTable.assignedToId, assigneeUser.id), tenantId ? eq(assigneeUser.tenantId, tenantId) : undefined))
      .leftJoin(contactsTable, and(eq(supportTicketsTable.contactId, contactsTable.id), tenantId ? eq(contactsTable.tenantId, tenantId) : undefined));

    const conditions = [];
    if (tenantId) conditions.push(eq(supportTicketsTable.tenantId, tenantId));
    if (status) conditions.push(eq(supportTicketsTable.status, status as any));
    if (priority) conditions.push(eq(supportTicketsTable.priority, priority as string));
    if (assignedToId) conditions.push(eq(supportTicketsTable.assignedToId, assignedToId as string));
    if (contactId) conditions.push(eq(supportTicketsTable.contactId, contactId as string));
    if (search) {
      conditions.push(
        or(
          ilike(supportTicketsTable.title, `%${search}%`),
          ilike(supportTicketsTable.ticketNumber, `%${search}%`),
          ilike(supportTicketsTable.description, `%${search}%`)
        )
      );
    }

    const tickets = await (conditions.length > 0
      ? query.where(and(...conditions))
      : query
    ).orderBy(desc(supportTicketsTable.createdAt));

    res.json(tickets);
    return;
  } catch (error) {
    logger.error({ error }, "Error fetching support tickets");
    res.status(500).json({ error: "Internal server error" });
    return;
  }
});

// POST /support/tickets — create ticket. Auto-generate ticketNumber (#001 format, sequential).
// Required: title, description, priority. Sets reportedById from req.user. OPERATOR+ only.
router.post("/tickets", authMiddleware, denyDevRoles, requireRole("ADMIN", "MANAGER", "OPERATOR"), async (req, res): Promise<void> => {
  try {
    const body = sanitiseInput(req.body);
    const { title, description, priority, contactId, organizationId } = body;
    const tenantId = req.user!.tenantId;

    if (!title || !description || !priority) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    const [lastTicket] = await db
      .select({ ticketNumber: supportTicketsTable.ticketNumber })
      .from(supportTicketsTable)
      .where(tenantId ? eq(supportTicketsTable.tenantId, tenantId) : undefined)
      .orderBy(desc(supportTicketsTable.ticketNumber))
      .limit(1);

    let nextNumber = 1;
    if (lastTicket && lastTicket.ticketNumber.startsWith("#")) {
      const currentNumber = parseInt(lastTicket.ticketNumber.substring(1), 10);
      if (!isNaN(currentNumber)) {
        nextNumber = currentNumber + 1;
      }
    }
    const ticketNumber = `#${nextNumber.toString().padStart(3, "0")}`;

    const newTicket = {
      id: generateId("ticket"),
      tenantId,
      ticketNumber,
      title,
      description,
      priority,
      contactId,
      organizationId,
      reportedById: req.user!.id,
      status: "OPEN" as const,
    };

    await db.insert(supportTicketsTable).values(newTicket);

    res.status(201).json(newTicket);
    if (req.user!.tenantId) dispatch(req.user!.tenantId, "support.ticket.created", { id: newTicket.id }).catch(() => {});
    return;
  } catch (error) {
    logger.error({ error }, "Error creating support ticket");
    res.status(500).json({ error: "Internal server error" });
    return;
  }
});

// GET /support/tickets/:id — full detail with contact, org, updates ordered by createdAt asc, AI diagnoses ordered by createdAt desc
router.get("/tickets/:id", authMiddleware, denyDevRoles, async (req, res): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const tenantId = req.user!.tenantId;

    const [ticket] = await db
      .select({
        id: supportTicketsTable.id,
        ticketNumber: supportTicketsTable.ticketNumber,
        title: supportTicketsTable.title,
        description: supportTicketsTable.description,
        status: supportTicketsTable.status,
        priority: supportTicketsTable.priority,
        source: supportTicketsTable.source,
        reportedById: supportTicketsTable.reportedById,
        assignedToId: supportTicketsTable.assignedToId,
        contactId: supportTicketsTable.contactId,
        organizationId: supportTicketsTable.organizationId,
        resolvedAt: supportTicketsTable.resolvedAt,
        resolutionNotes: supportTicketsTable.resolutionNotes,
        createdAt: supportTicketsTable.createdAt,
        updatedAt: supportTicketsTable.updatedAt,
        contact: {
          id: contactsTable.id,
          firstName: contactsTable.firstName,
          lastName: contactsTable.lastName,
          email: contactsTable.email,
        },
        organization: {
          id: organizationsTable.id,
          name: organizationsTable.name,
        },
        reportedBy: {
          id: usersTable.id,
          name: usersTable.name,
        },
        assignedTo: {
          id: assigneeUser.id,
          name: assigneeUser.name,
        },
      })
      .from(supportTicketsTable)
      .leftJoin(contactsTable, and(eq(supportTicketsTable.contactId, contactsTable.id), tenantId ? eq(contactsTable.tenantId, tenantId) : undefined))
      .leftJoin(organizationsTable, and(eq(supportTicketsTable.organizationId, organizationsTable.id), tenantId ? eq(organizationsTable.tenantId, tenantId) : undefined))
      .leftJoin(usersTable, and(eq(supportTicketsTable.reportedById, usersTable.id), tenantId ? eq(usersTable.tenantId, tenantId) : undefined))
      .leftJoin(assigneeUser, and(eq(supportTicketsTable.assignedToId, assigneeUser.id), tenantId ? eq(assigneeUser.tenantId, tenantId) : undefined))
      .where(and(eq(supportTicketsTable.id, id), tenantId ? eq(supportTicketsTable.tenantId, tenantId) : undefined));

    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    const updates = await db
      .select({
        id: ticketUpdatesTable.id,
        content: ticketUpdatesTable.content,
        isInternal: ticketUpdatesTable.isInternal,
        createdAt: ticketUpdatesTable.createdAt,
        author: {
          id: usersTable.id,
          name: usersTable.name,
        },
      })
      .from(ticketUpdatesTable)
      .leftJoin(usersTable, and(eq(ticketUpdatesTable.authorId, usersTable.id), tenantId ? eq(usersTable.tenantId, tenantId) : undefined))
      .where(and(eq(ticketUpdatesTable.ticketId, id), tenantId ? eq(ticketUpdatesTable.tenantId, tenantId) : undefined))
      .orderBy(asc(ticketUpdatesTable.createdAt));

    const diagnoses = await db
      .select()
      .from(aiTicketDiagnosesTable)
      .where(and(eq(aiTicketDiagnosesTable.ticketId, id), tenantId ? eq(aiTicketDiagnosesTable.tenantId, tenantId) : undefined))
      .orderBy(desc(aiTicketDiagnosesTable.createdAt));

    // Only expose diagnosis data if the feature is owner-enabled for this tenant
    let diagnosisEnabled = false;
    if (tenantId) {
      const [tenant] = await db
        .select({ aiDiagnosisEnabled: tenantsTable.aiDiagnosisEnabled })
        .from(tenantsTable)
        .where(eq(tenantsTable.id, tenantId))
        .limit(1);
      diagnosisEnabled = tenant?.aiDiagnosisEnabled ?? false;
    }

    // When diagnosis is disabled, strip both the diagnoses array and any AI-generated
    // update entries (approved diagnosis notes) so no technical AI output reaches the client.
    const filteredUpdates = diagnosisEnabled
      ? updates
      : updates.filter((u: any) => {
          const c = (u.content ?? "").toLowerCase();
          return !c.includes("ai-suggested action approved") && !c.includes("ai diagnosis");
        });

    res.json({ ...ticket, updates: filteredUpdates, diagnoses: diagnosisEnabled ? diagnoses : [] });
    return;
  } catch (error) {
    logger.error({ error }, "Error fetching support ticket detail");
    res.status(500).json({ error: "Internal server error" });
    return;
  }
});

// PATCH /support/tickets/:id — update status, priority, assignedToId, resolutionNotes. Set resolvedAt when status→RESOLVED.
router.patch("/tickets/:id", authMiddleware, denyDevRoles, requireRole("ADMIN", "MANAGER", "OPERATOR"), async (req, res): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const body = sanitiseInput(req.body);
    const { status, priority, assignedToId, resolutionNotes } = body;
    const tenantId = req.user!.tenantId;

    const [existingTicket] = await db
      .select()
      .from(supportTicketsTable)
      .where(and(eq(supportTicketsTable.id, id), tenantId ? eq(supportTicketsTable.tenantId, tenantId) : undefined));

    if (!existingTicket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    const updateData: any = {};
    if (status !== undefined) {
      updateData.status = status;
      if (status === "RESOLVED" && existingTicket.status !== "RESOLVED") {
        updateData.resolvedAt = new Date();
      } else if (status !== "RESOLVED") {
        updateData.resolvedAt = null;
      }
    }
    if (priority !== undefined) updateData.priority = priority;
    if (assignedToId !== undefined) updateData.assignedToId = assignedToId;
    if (resolutionNotes !== undefined) updateData.resolutionNotes = resolutionNotes;

    await db
      .update(supportTicketsTable)
      .set(updateData)
      .where(and(eq(supportTicketsTable.id, id), tenantId ? eq(supportTicketsTable.tenantId, tenantId) : undefined));

    // Notify assigned user when ticket is assigned to them
    if (assignedToId && assignedToId !== existingTicket.assignedToId) {
      createNotification({
        userId: assignedToId,
        tenantId: existingTicket.tenantId ?? tenantId,
        title: "Ticket assigned to you",
        message: `Support ticket ${existingTicket.ticketNumber}: ${existingTicket.title}`,
        type: "INFO",
        link: `/support/tickets/${id}`,
      }).catch(err => logger.error({ err }, "Failed to create ticket assignment notification"));
    }

    // Log activity when ticket resolved (if contactId set)
    if (status === "RESOLVED" && existingTicket.status !== "RESOLVED" && existingTicket.contactId) {
      await db.insert(activitiesTable).values({
        id: generateId("activity"),
        tenantId: existingTicket.tenantId ?? tenantId,
        type: "NOTE",
        summary: `Support ticket ${existingTicket.ticketNumber} resolved: ${existingTicket.title}`,
        contactId: existingTicket.contactId,
        organizationId: existingTicket.organizationId,
        userId: req.user!.id,
      });
    }

    res.json({ message: "Ticket updated successfully" });
    if (status === "RESOLVED" && existingTicket.status !== "RESOLVED" && req.user!.tenantId) {
      dispatch(req.user!.tenantId, "support.ticket.resolved", { id: existingTicket.id }).catch(() => {});
    }
    return;
  } catch (error) {
    logger.error({ error }, "Error updating support ticket");
    res.status(500).json({ error: "Internal server error" });
    return;
  }
});

// DELETE /support/tickets/:id — ADMIN only
router.delete("/tickets/:id", authMiddleware, denyDevRoles, requireRole("ADMIN"), async (req, res): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const tenantId = req.user!.tenantId;
    await db
      .delete(supportTicketsTable)
      .where(and(eq(supportTicketsTable.id, id), tenantId ? eq(supportTicketsTable.tenantId, tenantId) : undefined));
    res.json({ message: "Ticket deleted successfully" });
    return;
  } catch (error) {
    logger.error({ error }, "Error deleting support ticket");
    res.status(500).json({ error: "Internal server error" });
    return;
  }
});

// POST /support/tickets/:id/updates — add update. Required: content. Optional: isInternal. Sets authorId from req.user.
router.post("/tickets/:id/updates", authMiddleware, denyDevRoles, requireRole("ADMIN", "MANAGER", "OPERATOR"), async (req, res): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const user = req.user!;
    const tenantId = user.tenantId;
    const body = sanitiseInput(req.body);
    const { content, isInternal } = body;

    if (!content) {
      res.status(400).json({ error: "Content is required" });
      return;
    }

    if (isInternal && user.role === "OPERATOR") {
      res.status(403).json({ error: "Only managers can post internal notes" });
      return;
    }

    const [ticket] = await db
      .select()
      .from(supportTicketsTable)
      .where(and(eq(supportTicketsTable.id, id), tenantId ? eq(supportTicketsTable.tenantId, tenantId) : undefined));

    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    const newUpdate = {
      id: generateId("update"),
      tenantId: ticket.tenantId ?? tenantId,
      ticketId: id,
      authorId: user.id,
      content,
      isInternal: !!isInternal,
    };

    await db.insert(ticketUpdatesTable).values(newUpdate);

    res.status(201).json(newUpdate);
    return;
  } catch (error) {
    logger.error({ error }, "Error adding ticket update");
    res.status(500).json({ error: "Internal server error" });
    return;
  }
});

// POST /support/tickets/:id/diagnose — MANAGER+ only. Fetch ticket+updates+contact activities. Call diagnoseTicket() from ai.ts. Save AITicketDiagnosis. Return diagnosis.
router.post("/tickets/:id/diagnose", authMiddleware, denyDevRoles, requireRole("ADMIN", "MANAGER"), async (req, res): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const tenantId = req.user!.tenantId;

    // Check if AI ticket diagnosis is enabled for this tenant
    if (tenantId) {
      const [tenant] = await db
        .select({ aiDiagnosisEnabled: tenantsTable.aiDiagnosisEnabled })
        .from(tenantsTable)
        .where(eq(tenantsTable.id, tenantId))
        .limit(1);
      if (!tenant?.aiDiagnosisEnabled) {
        res.status(403).json({ error: "AI ticket diagnosis is not enabled for this account. Contact your platform administrator." });
        return;
      }
    }

    let diagnoseTicket;
    try {
      const aiLib = await import("../lib/ai");
      diagnoseTicket = aiLib.diagnoseTicket;
    } catch {
      res.status(503).json({ error: "AI service not available yet" });
      return;
    }

    const [ticket] = await db
      .select()
      .from(supportTicketsTable)
      .where(and(eq(supportTicketsTable.id, id), tenantId ? eq(supportTicketsTable.tenantId, tenantId) : undefined));

    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    const updates = await db
      .select()
      .from(ticketUpdatesTable)
      .where(and(eq(ticketUpdatesTable.ticketId, id), tenantId ? eq(ticketUpdatesTable.tenantId, tenantId) : undefined))
      .orderBy(asc(ticketUpdatesTable.createdAt));

    let activities: any[] = [];
    if (ticket.contactId) {
      activities = await db
        .select()
        .from(activitiesTable)
        .where(and(eq(activitiesTable.contactId, ticket.contactId), tenantId ? eq(activitiesTable.tenantId, tenantId) : undefined))
        .orderBy(desc(activitiesTable.date))
        .limit(10);
    }

    const updatesText = updates.map((u: any) => `[${u.isInternal ? "Internal" : "Public"}] ${u.content}`).join("\n");
    const activitiesText = activities.map((a: any) => `${a.type}: ${a.summary}`).join("\n");

    const aiResult = await diagnoseTicket({
      userId: req.user!.id,
      ticketTitle: ticket.title,
      ticketDescription: ticket.description,
      updates: `Updates:\n${updatesText}\n\nRelated Activities:\n${activitiesText}`,
    });

    if (!aiResult.success) {
      res.status(500).json({ error: aiResult.error || "AI diagnosis failed" });
      return;
    }

    const diagnosisRecord = {
      id: generateId("diag"),
      tenantId: ticket.tenantId ?? tenantId,
      ticketId: id,
      diagnosis: aiResult.result.diagnosis,
      suggestedAction: aiResult.result.suggestedAction,
      confidence: aiResult.result.confidence,
    };

    await db.insert(aiTicketDiagnosesTable).values(diagnosisRecord);

    res.json(diagnosisRecord);
    return;
  } catch (error) {
    logger.error({ error }, "Error running AI diagnosis");
    res.status(500).json({ error: "Internal server error" });
    return;
  }
});

// POST /support/tickets/:id/diagnose/approve — MANAGER+ only. Set approvedById+approvedAt. Add ticket update: "AI-suggested action approved by [name]: [action]".
router.post("/tickets/:id/diagnose/approve", authMiddleware, denyDevRoles, requireRole("ADMIN", "MANAGER"), async (req, res): Promise<void> => {
  try {
    const ticketId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { diagnosisId } = req.body;
    const tenantId = req.user!.tenantId;

    // Same gate as /diagnose — cannot approve if feature is disabled
    if (tenantId) {
      const [tenant] = await db
        .select({ aiDiagnosisEnabled: tenantsTable.aiDiagnosisEnabled })
        .from(tenantsTable)
        .where(eq(tenantsTable.id, tenantId))
        .limit(1);
      if (!tenant?.aiDiagnosisEnabled) {
        res.status(403).json({ error: "AI ticket diagnosis is not enabled for this account. Contact your platform administrator." });
        return;
      }
    }

    if (!diagnosisId) {
      res.status(400).json({ error: "diagnosisId is required" });
      return;
    }

    const [diagnosis] = await db
      .select()
      .from(aiTicketDiagnosesTable)
      .where(
        and(
          eq(aiTicketDiagnosesTable.id, diagnosisId),
          eq(aiTicketDiagnosesTable.ticketId, ticketId),
          tenantId ? eq(aiTicketDiagnosesTable.tenantId, tenantId) : undefined
        )
      );

    if (!diagnosis) {
      res.status(404).json({ error: "Diagnosis not found" });
      return;
    }

    await db
      .update(aiTicketDiagnosesTable)
      .set({
        approvedById: req.user!.id,
        approvedAt: new Date(),
        applied: true,
      })
      .where(and(eq(aiTicketDiagnosesTable.id, diagnosisId), tenantId ? eq(aiTicketDiagnosesTable.tenantId, tenantId) : undefined));

    await db.insert(ticketUpdatesTable).values({
      id: generateId("update"),
      tenantId: diagnosis.tenantId ?? tenantId,
      ticketId,
      authorId: req.user!.id,
      content: `AI-suggested action approved by ${req.user!.name}: ${diagnosis.suggestedAction}`,
      isInternal: true,
    });

    res.json({ message: "Diagnosis approved" });
    return;
  } catch (error) {
    logger.error({ error }, "Error approving AI diagnosis");
    res.status(500).json({ error: "Internal server error" });
    return;
  }
});

export default router;
