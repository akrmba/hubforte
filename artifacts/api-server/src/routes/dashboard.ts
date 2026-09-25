import { Router, type IRouter } from "express";
import { db, organizationsTable, contactsTable, tasksTable, activitiesTable, usersTable, fundingOpportunitiesTable, supportTicketsTable, campaignsTable, programmeCohortsTable, studentsTable } from "@workspace/db";
import { count, eq, lte, and, gte, ne, desc, sql, notInArray, inArray } from "drizzle-orm";
import { authMiddleware, denyDevRoles } from "../lib/auth";

const router: IRouter = Router();

router.get("/dashboard/stats", authMiddleware, denyDevRoles, async (req, res): Promise<void> => {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const tenantId = req.user!.tenantId;

  const [orgCount, contactCount, tasksDueToday, emailsThisWeek, openTickets, pipelineValue, activeCampaigns, activeCohorts, studentsThisWeek] = await Promise.all([
    db.select({ count: count() }).from(organizationsTable).where(tenantId ? eq(organizationsTable.tenantId, tenantId) : undefined),
    db.select({ count: count() }).from(contactsTable).where(tenantId ? eq(contactsTable.tenantId, tenantId) : undefined),
    db
      .select({ count: count() })
      .from(tasksTable)
      .where(and(lte(tasksTable.dueDate, today), ne(tasksTable.status, "DONE"), tenantId ? eq(tasksTable.tenantId, tenantId) : undefined)),
    db
      .select({ count: count() })
      .from(activitiesTable)
      .where(and(eq(activitiesTable.type, "EMAIL"), gte(activitiesTable.date, weekAgo), tenantId ? eq(activitiesTable.tenantId, tenantId) : undefined)),
    db
      .select({ count: count() })
      .from(supportTicketsTable)
      .where(and(notInArray(supportTicketsTable.status, ["RESOLVED", "CLOSED"]), tenantId ? eq(supportTicketsTable.tenantId, tenantId) : undefined)),
    db
      .select({ total: sql<string>`COALESCE(SUM(value), 0)` })
      .from(fundingOpportunitiesTable)
      .where(and(notInArray(fundingOpportunitiesTable.stage, ["AWARDED", "DECLINED", "LOST"]), tenantId ? eq(fundingOpportunitiesTable.tenantId, tenantId) : undefined)),
    db
      .select({ count: count() })
      .from(campaignsTable)
      .where(and(inArray(campaignsTable.status, ["SCHEDULED", "SENDING"]), tenantId ? eq(campaignsTable.tenantId, tenantId) : undefined)),
    db
      .select({ count: count() })
      .from(programmeCohortsTable)
      .where(and(inArray(programmeCohortsTable.status, ["OPEN", "IN_PROGRESS"]), tenantId ? eq(programmeCohortsTable.tenantId, tenantId) : undefined)),
    db
      .select({ count: count() })
      .from(studentsTable)
      .where(and(gte(studentsTable.createdAt, weekAgo), tenantId ? eq(studentsTable.tenantId, tenantId) : undefined)),
  ]);

  res.json({
    totalOrganizations: orgCount[0]?.count ?? 0,
    totalContacts: contactCount[0]?.count ?? 0,
    tasksDueToday: tasksDueToday[0]?.count ?? 0,
    emailsSentThisWeek: emailsThisWeek[0]?.count ?? 0,
    openTickets: openTickets[0]?.count ?? 0,
    pipelineValue: parseFloat(pipelineValue[0]?.total ?? "0"),
    activeCampaigns: activeCampaigns[0]?.count ?? 0,
    activeCohorts: activeCohorts[0]?.count ?? 0,
    studentsEnrolledThisWeek: studentsThisWeek[0]?.count ?? 0,
  });
});

router.get("/dashboard/activity", authMiddleware, denyDevRoles, async (req, res): Promise<void> => {
  const tenantId = req.user!.tenantId;
  const activities = await db
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
    .leftJoin(usersTable, and(eq(activitiesTable.userId, usersTable.id), tenantId ? eq(usersTable.tenantId, tenantId) : undefined))
    .where(tenantId ? eq(activitiesTable.tenantId, tenantId) : undefined)
    .orderBy(desc(activitiesTable.createdAt))
    .limit(10);

  const enriched = await Promise.all(
    activities.map(async (a) => {
      let contactName = null;
      if (a.contactId) {
        const [c] = await db
          .select({ firstName: contactsTable.firstName, lastName: contactsTable.lastName })
          .from(contactsTable)
          .where(and(eq(contactsTable.id, a.contactId), tenantId ? eq(contactsTable.tenantId, tenantId) : undefined));
        if (c) contactName = `${c.firstName} ${c.lastName}`;
      }
      return { ...a, contactName, organizationName: null };
    })
  );

  res.json(enriched);
});

router.get("/dashboard/tasks-due", authMiddleware, denyDevRoles, async (req, res): Promise<void> => {
  const tenantId = req.user!.tenantId;
  const tasks = await db
    .select({
      id: tasksTable.id,
      title: tasksTable.title,
      description: tasksTable.description,
      dueDate: tasksTable.dueDate,
      priority: tasksTable.priority,
      status: tasksTable.status,
      ownerId: tasksTable.ownerId,
      ownerName: usersTable.name,
      contactId: tasksTable.contactId,
      organizationId: tasksTable.organizationId,
      createdAt: tasksTable.createdAt,
      updatedAt: tasksTable.updatedAt,
    })
    .from(tasksTable)
    .leftJoin(usersTable, and(eq(tasksTable.ownerId, usersTable.id), tenantId ? eq(usersTable.tenantId, tenantId) : undefined))
    .where(and(ne(tasksTable.status, "DONE"), tenantId ? eq(tasksTable.tenantId, tenantId) : undefined))
    .orderBy(tasksTable.dueDate)
    .limit(5);

  res.json(tasks.map((t) => ({ ...t, contactName: null, organizationName: null })));
});

router.get("/dashboard/pipeline-stages", authMiddleware, denyDevRoles, async (req, res): Promise<void> => {
  const tenantId = req.user!.tenantId;
  const activeStages = ["PROSPECT", "APPROACH", "PROPOSAL_SENT", "APPLIED", "ACTIVE"];

  const rows = await db
    .select({
      stage: fundingOpportunitiesTable.stage,
      dealCount: count(),
      totalValue: sql<string>`COALESCE(SUM(value), 0)`,
    })
    .from(fundingOpportunitiesTable)
    .where(and(
      notInArray(fundingOpportunitiesTable.stage, ["AWARDED", "DECLINED", "LOST", "COMPLETED"]),
      tenantId ? eq(fundingOpportunitiesTable.tenantId, tenantId) : undefined,
    ))
    .groupBy(fundingOpportunitiesTable.stage);

  // Return all active stages, filling in zeros for missing ones
  const result = activeStages.map((stage) => {
    const row = rows.find((r) => r.stage === stage);
    return {
      stage,
      dealCount: row?.dealCount ?? 0,
      totalValue: parseFloat(row?.totalValue ?? "0"),
    };
  });

  res.json(result);
});

export default router;
