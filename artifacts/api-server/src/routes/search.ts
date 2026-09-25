import { Router } from "express";
import { db, contactsTable, organizationsTable, fundersTable, fundingOpportunitiesTable, supportTicketsTable, tasksTable, emailTemplatesTable, campaignsTable } from "@workspace/db";
import { or, ilike, and, eq } from "drizzle-orm";
import { authMiddleware, denyDevRoles } from "../lib/auth";
import { logger } from "../lib/logger";

const router = Router();

const PREVIEW_LIMIT = 5;
const FULL_LIMIT = 20;

router.get("/search", authMiddleware, denyDevRoles, async (req, res): Promise<void> => {
  try {
    const q = String(req.query.q || "").trim();
    const full = req.query.full === "1";
    const limit = full ? FULL_LIMIT : PREVIEW_LIMIT;
    const tenantId = req.user!.tenantId;

    if (!q || q.length < 2) {
      res.json({ contacts: [], organizations: [], funders: [], opportunities: [], tickets: [], tasks: [], templates: [], campaigns: [] });
      return;
    }

    const like = `%${q}%`;

    const [contacts, organizations, funders, opportunities, tickets, tasks, templates, campaigns] = await Promise.all([
      db
        .select({ id: contactsTable.id, firstName: contactsTable.firstName, lastName: contactsTable.lastName, email: contactsTable.email })
        .from(contactsTable)
        .where(and(or(ilike(contactsTable.firstName, like), ilike(contactsTable.lastName, like), ilike(contactsTable.email, like)), tenantId ? eq(contactsTable.tenantId, tenantId) : undefined))
        .limit(limit),

      db
        .select({ id: organizationsTable.id, name: organizationsTable.name, type: organizationsTable.type })
        .from(organizationsTable)
        .where(and(ilike(organizationsTable.name, like), tenantId ? eq(organizationsTable.tenantId, tenantId) : undefined))
        .limit(limit),

      db
        .select({ id: fundersTable.id, name: fundersTable.name, type: fundersTable.type })
        .from(fundersTable)
        .where(and(ilike(fundersTable.name, like), tenantId ? eq(fundersTable.tenantId, tenantId) : undefined))
        .limit(limit),

      db
        .select({ id: (fundingOpportunitiesTable as any).id, name: (fundingOpportunitiesTable as any).name, stage: (fundingOpportunitiesTable as any).stage, value: (fundingOpportunitiesTable as any).value })
        .from(fundingOpportunitiesTable as any)
        .where(and(ilike(fundingOpportunitiesTable.name, like), tenantId ? eq(fundingOpportunitiesTable.tenantId, tenantId) : undefined))
        .limit(limit),

      db
        .select({ id: supportTicketsTable.id, ticketNumber: supportTicketsTable.ticketNumber, title: supportTicketsTable.title, status: supportTicketsTable.status })
        .from(supportTicketsTable)
        .where(and(or(ilike(supportTicketsTable.title, like), ilike(supportTicketsTable.ticketNumber, like)), tenantId ? eq(supportTicketsTable.tenantId, tenantId) : undefined))
        .limit(limit),

      db
        .select({ id: tasksTable.id, title: tasksTable.title, status: tasksTable.status, dueDate: tasksTable.dueDate })
        .from(tasksTable)
        .where(and(ilike(tasksTable.title, like), tenantId ? eq(tasksTable.tenantId, tenantId) : undefined))
        .limit(limit),

      db
        .select({ id: emailTemplatesTable.id, name: emailTemplatesTable.name, subject: emailTemplatesTable.subject })
        .from(emailTemplatesTable)
        .where(and(or(ilike(emailTemplatesTable.name, like), ilike(emailTemplatesTable.subject, like)), tenantId ? eq(emailTemplatesTable.tenantId, tenantId) : undefined))
        .limit(limit),

      db
        .select({ id: campaignsTable.id, name: campaignsTable.name, status: campaignsTable.status })
        .from(campaignsTable)
        .where(and(ilike(campaignsTable.name, like), tenantId ? eq(campaignsTable.tenantId, tenantId) : undefined))
        .limit(limit),
    ]);

    res.json({ contacts, organizations, funders, opportunities, tickets, tasks, templates, campaigns });
    return;
  } catch (error) {
    logger.error({ error }, "Global search failed");
    res.status(500).json({ error: "Search failed" });
    return;
  }
});

export default router;
