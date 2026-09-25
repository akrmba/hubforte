import { Router, type IRouter } from "express";
import { db, campaignsTable, campaignContactsTable, contactsTable, usersTable, gmailCredentialsTable, outboundEmailsTable, activitiesTable } from "@workspace/db";
import { eq, and, count, sql, desc, inArray } from "drizzle-orm";
import { authMiddleware, requireRole, denyDevRoles } from "../lib/auth";
import { generateId } from "../lib/id";
import { mergeTemplate } from "../lib/templateEngine";
import { sendGmailEmail } from "../lib/gmail";
import { dispatch } from "../lib/webhookDelivery";

const router: IRouter = Router();

router.get("/campaigns", authMiddleware, denyDevRoles, async (req, res): Promise<void> => {
  const { status, page = "1", limit: rawLimit = "25" } = req.query as Record<string, string>;
  const pageNum = Math.max(1, Number(page));
  const limitNum = Math.min(100, Math.max(1, Number(rawLimit)));
  const offset = (pageNum - 1) * limitNum;
  const tenantId = req.user!.tenantId;

  const conditions = [];
  if (tenantId) conditions.push(eq(campaignsTable.tenantId, tenantId));
  if (status) conditions.push(eq(campaignsTable.status, status as any));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const campaigns = await db
    .select({
      id: campaignsTable.id,
      name: campaignsTable.name,
      subject: campaignsTable.subject,
      bodyTemplate: campaignsTable.bodyTemplate,
      status: campaignsTable.status,
      scheduledAt: campaignsTable.scheduledAt,
      ownerId: campaignsTable.ownerId,
      ownerName: usersTable.name,
      createdAt: campaignsTable.createdAt,
      updatedAt: campaignsTable.updatedAt,
    })
    .from(campaignsTable)
    .leftJoin(usersTable, eq(campaignsTable.ownerId, usersTable.id))
    .where(where)
    .orderBy(desc(campaignsTable.createdAt))
    .limit(limitNum)
    .offset(offset);

  const [totalResult] = await db
    .select({ count: count() })
    .from(campaignsTable)
    .where(where);

  const campaignIds = campaigns.map((c) => c.id);
  const contactCounts =
    campaignIds.length > 0
      ? await db
          .select({ campaignId: campaignContactsTable.campaignId, cnt: count() })
          .from(campaignContactsTable)
          .where(
            and(
              inArray(campaignContactsTable.campaignId, campaignIds),
              tenantId ? eq(campaignContactsTable.tenantId, tenantId) : undefined
            )
          )
          .groupBy(campaignContactsTable.campaignId)
      : [];

  const sentCounts =
    campaignIds.length > 0
      ? await db
          .select({ campaignId: campaignContactsTable.campaignId, cnt: count() })
          .from(campaignContactsTable)
          .where(
            and(
              inArray(campaignContactsTable.campaignId, campaignIds),
              eq(campaignContactsTable.status, "SENT"),
              tenantId ? eq(campaignContactsTable.tenantId, tenantId) : undefined
            )
          )
          .groupBy(campaignContactsTable.campaignId)
      : [];

  const contactCountMap = new Map(contactCounts.map((c) => [c.campaignId, c.cnt]));
  const sentCountMap = new Map(sentCounts.map((c) => [c.campaignId, c.cnt]));

  res.json({
    data: campaigns.map((c) => ({
      ...c,
      contactCount: contactCountMap.get(c.id) ?? 0,
      sentCount: sentCountMap.get(c.id) ?? 0,
    })),
    total: totalResult.count,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(totalResult.count / limitNum) || 1,
  });
});

router.post("/campaigns", authMiddleware, denyDevRoles, requireRole("ADMIN", "MANAGER", "OPERATOR"), async (req, res): Promise<void> => {
  const user = req.user!;

  const { name, subject, bodyTemplate, contactIds, scheduledAt } = req.body;
  if (!name || !subject || !bodyTemplate || !contactIds?.length) {
    res.status(400).json({ error: "name, subject, bodyTemplate, and contactIds are required" });
    return;
  }

  const id = generateId("cmp");
  const [campaign] = await db
    .insert(campaignsTable)
    .values({
      id,
      tenantId: user.tenantId,
      name,
      subject,
      bodyTemplate,
      status: "DRAFT",
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      ownerId: user.id,
    })
    .returning();

  const ccRecords = (contactIds as string[]).map((contactId) => ({
    id: generateId("cc"),
    tenantId: user.tenantId,
    campaignId: id,
    contactId,
    status: "PENDING" as const,
  }));

  await db.insert(campaignContactsTable).values(ccRecords);

  res.status(201).json({ ...campaign, contactCount: contactIds.length, sentCount: 0, ownerName: user.name });
});

router.get("/campaigns/:id", authMiddleware, denyDevRoles, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const tenantId = req.user!.tenantId;

  const [campaign] = await db
    .select({
      id: campaignsTable.id,
      name: campaignsTable.name,
      subject: campaignsTable.subject,
      bodyTemplate: campaignsTable.bodyTemplate,
      status: campaignsTable.status,
      scheduledAt: campaignsTable.scheduledAt,
      ownerId: campaignsTable.ownerId,
      ownerName: usersTable.name,
      createdAt: campaignsTable.createdAt,
      updatedAt: campaignsTable.updatedAt,
    })
    .from(campaignsTable)
    .leftJoin(usersTable, eq(campaignsTable.ownerId, usersTable.id))
    .where(and(eq(campaignsTable.id, rawId), tenantId ? eq(campaignsTable.tenantId, tenantId) : undefined));

  if (!campaign) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }

  const campaignContacts = await db
    .select({
      id: campaignContactsTable.id,
      campaignId: campaignContactsTable.campaignId,
      contactId: campaignContactsTable.contactId,
      contactName: sql<string>`concat(${contactsTable.firstName}, ' ', ${contactsTable.lastName})`,
      contactEmail: contactsTable.email,
      status: campaignContactsTable.status,
      sentAt: campaignContactsTable.sentAt,
      error: campaignContactsTable.error,
    })
    .from(campaignContactsTable)
    .leftJoin(contactsTable, eq(campaignContactsTable.contactId, contactsTable.id))
    .where(
      and(
        eq(campaignContactsTable.campaignId, rawId),
        tenantId ? eq(campaignContactsTable.tenantId, tenantId) : undefined,
        tenantId ? eq(contactsTable.tenantId, tenantId) : undefined
      )
    );

  const contactCount = campaignContacts.length;
  const sentCount = campaignContacts.filter((c) => c.status === "SENT").length;

  res.json({ ...campaign, contactCount, sentCount, campaignContacts });
});

router.post("/campaigns/:id/send", authMiddleware, denyDevRoles, requireRole("ADMIN", "MANAGER", "OPERATOR"), async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const user = req.user!;
  const tenantId = user.tenantId;

  const [cred] = await db
    .select()
    .from(gmailCredentialsTable)
    .where(and(eq(gmailCredentialsTable.userId, user.id), tenantId ? eq(gmailCredentialsTable.tenantId, tenantId) : undefined));
  if (!cred) {
    res.status(400).json({ error: "Gmail account not connected" });
    return;
  }

  const { scheduledAt } = req.body ?? {};
  const schedDate = scheduledAt ? new Date(scheduledAt) : null;
  const newStatus = schedDate && schedDate > new Date() ? "SCHEDULED" : "SENDING";

  const [campaign] = await db
    .update(campaignsTable)
    .set({ status: newStatus, scheduledAt: schedDate })
    .where(and(eq(campaignsTable.id, rawId), tenantId ? eq(campaignsTable.tenantId, tenantId) : undefined))
    .returning();

  if (!campaign) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }

  res.json({ ...campaign, contactCount: 0, sentCount: 0, ownerName: user.name });
  // Emit campaign.sent only when the campaign is immediately queued for sending (not scheduled)
  if (newStatus === "SENDING" && tenantId) {
    dispatch(tenantId, "campaign.sent", { id: campaign.id, name: campaign.name }).catch(() => {});
  }
});

router.post("/campaigns/:id/pause", authMiddleware, denyDevRoles, requireRole("ADMIN", "MANAGER", "OPERATOR"), async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const user = req.user!;
  const tenantId = user.tenantId;

  const [campaign] = await db
    .update(campaignsTable)
    .set({ status: "PAUSED" })
    .where(and(eq(campaignsTable.id, rawId), tenantId ? eq(campaignsTable.tenantId, tenantId) : undefined))
    .returning();

  if (!campaign) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }

  res.json({ ...campaign, contactCount: 0, sentCount: 0, ownerName: user.name });
});

router.get("/campaigns/:id/results", authMiddleware, denyDevRoles, requireRole("ADMIN", "MANAGER", "OPERATOR"), async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const tenantId = req.user!.tenantId;

  const results = await db
    .select({
      id: campaignContactsTable.id,
      campaignId: campaignContactsTable.campaignId,
      contactId: campaignContactsTable.contactId,
      contactName: sql<string>`concat(${contactsTable.firstName}, ' ', ${contactsTable.lastName})`,
      contactEmail: contactsTable.email,
      status: campaignContactsTable.status,
      sentAt: campaignContactsTable.sentAt,
      error: campaignContactsTable.error,
    })
    .from(campaignContactsTable)
    .leftJoin(contactsTable, eq(campaignContactsTable.contactId, contactsTable.id))
    .where(
      and(
        eq(campaignContactsTable.campaignId, rawId),
        tenantId ? eq(campaignContactsTable.tenantId, tenantId) : undefined,
        tenantId ? eq(contactsTable.tenantId, tenantId) : undefined
      )
    );

  res.json(results);
});

export default router;
