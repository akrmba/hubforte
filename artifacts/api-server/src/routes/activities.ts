import { Router, type IRouter } from "express";
import { db, activitiesTable, usersTable, contactsTable, organizationsTable } from "@workspace/db";
import { eq, and, desc, count } from "drizzle-orm";
import { authMiddleware, requireRole, denyDevRoles } from "../lib/auth";
import { generateId } from "../lib/id";
import { sanitiseInput } from "../lib/sanitise";
import { dispatch } from "../lib/webhookDelivery";

const router: IRouter = Router();

router.get("/activities", authMiddleware, denyDevRoles, async (req, res): Promise<void> => {
  const { contactId, organizationId, page = "1", limit: rawLimit = "25" } = req.query as Record<string, string>;
  const pageNum = Math.max(1, Number(page));
  const limitNum = Math.min(100, Math.max(1, Number(rawLimit)));
  const offset = (pageNum - 1) * limitNum;
  const tenantId = req.user!.tenantId;

  const conditions = [];
  if (tenantId) conditions.push(eq(activitiesTable.tenantId, tenantId));
  if (contactId) conditions.push(eq(activitiesTable.contactId, contactId));
  if (organizationId) conditions.push(eq(activitiesTable.organizationId, organizationId));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

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
    .leftJoin(usersTable, eq(activitiesTable.userId, usersTable.id))
    .where(where)
    .orderBy(desc(activitiesTable.date))
    .limit(limitNum)
    .offset(offset);

  const [totalResult] = await db
    .select({ count: count() })
    .from(activitiesTable)
    .where(where);

  res.json({
    data: activities.map((a) => ({
      ...a,
      contactName: null,
      organizationName: null,
    })),
    total: totalResult.count,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(totalResult.count / limitNum) || 1,
  });
});

router.post("/activities", authMiddleware, denyDevRoles, requireRole("ADMIN", "MANAGER", "OPERATOR"), async (req, res): Promise<void> => {
  const user = req.user!;

  const cleanBody = sanitiseInput(req.body as Record<string, unknown>) as any;
  const { type, summary, subject, date, contactId, organizationId } = cleanBody;
  const summaryValue = summary || subject;

  if (!type || !summaryValue) {
    res.status(400).json({ error: "type and summary are required" });
    return;
  }

  const validTypes = ["EMAIL", "CALL", "NOTE", "MEETING", "TASK_COMPLETED"];
  if (!validTypes.includes(type)) {
    res.status(400).json({ error: "Invalid activity type" });
    return;
  }

  const id = generateId("act");
  const [activity] = await db
    .insert(activitiesTable)
    .values({
      id,
      tenantId: user.tenantId,
      type,
      summary: summaryValue,
      date: date ? new Date(date) : new Date(),
      contactId: contactId || null,
      organizationId: organizationId || null,
      userId: user.id,
    })
    .returning();

  res.status(201).json({ ...activity, userName: user.name, contactName: null, organizationName: null });
  if (user.tenantId) dispatch(user.tenantId, "activity.created", { id: activity.id, type: activity.type }).catch(() => {});
});

export default router;
