import { Router, type IRouter } from "express";
import { db, tasksTable, activitiesTable, usersTable } from "@workspace/db";
import { eq, and, lte, gte, ne, inArray, count } from "drizzle-orm";
import { authMiddleware, requireRole, denyDevRoles } from "../lib/auth";
import { generateId } from "../lib/id";
import { sanitiseInput } from "../lib/sanitise";
import { dispatch } from "../lib/webhookDelivery";

const router: IRouter = Router();

router.get("/tasks", authMiddleware, denyDevRoles, async (req, res): Promise<void> => {
  const { status, priority, ownerId, contactId, organizationId, dueBefore, dueAfter, mine, page = "1", limit: rawLimit = "25" } = req.query as Record<string, string>;
  const user = req.user!;
  const tenantId = user.tenantId;
  const pageNum = Math.max(1, Number(page));
  const limitNum = Math.min(100, Math.max(1, Number(rawLimit)));
  const offset = (pageNum - 1) * limitNum;

  const conditions = [];
  if (tenantId) conditions.push(eq(tasksTable.tenantId, tenantId));
  if (mine === "true" || (!ownerId && !["SUPER_ADMIN", "ADMIN", "MANAGER"].includes(user.role))) {
    conditions.push(eq(tasksTable.ownerId, user.id));
  } else if (ownerId) {
    conditions.push(eq(tasksTable.ownerId, ownerId));
  }
  if (status) {
    const statuses = status.split(",").map((s) => s.trim()).filter(Boolean);
    if (statuses.length === 1) conditions.push(eq(tasksTable.status, statuses[0] as any));
    else if (statuses.length > 1) conditions.push(inArray(tasksTable.status, statuses as any));
  }
  if (priority) {
    const priorities = priority.split(",").map((p) => p.trim()).filter(Boolean);
    if (priorities.length === 1) conditions.push(eq(tasksTable.priority, priorities[0] as any));
    else if (priorities.length > 1) conditions.push(inArray(tasksTable.priority, priorities as any));
  }
  if (contactId) conditions.push(eq(tasksTable.contactId, contactId));
  if (organizationId) conditions.push(eq(tasksTable.organizationId, organizationId));
  if (dueBefore) conditions.push(lte(tasksTable.dueDate, new Date(dueBefore)));
  if (dueAfter) conditions.push(gte(tasksTable.dueDate, new Date(dueAfter)));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

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
    .leftJoin(usersTable, eq(tasksTable.ownerId, usersTable.id))
    .where(where)
    .orderBy(tasksTable.dueDate)
    .limit(limitNum)
    .offset(offset);

  const [totalResult] = await db
    .select({ count: count() })
    .from(tasksTable)
    .where(where);

  res.json({
    data: tasks.map((t) => ({
      ...t,
      contactName: null,
      organizationName: null,
    })),
    total: totalResult.count,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(totalResult.count / limitNum) || 1,
  });
});

router.post("/tasks", authMiddleware, denyDevRoles, requireRole("ADMIN", "MANAGER", "OPERATOR"), async (req, res): Promise<void> => {
  const user = req.user!;
  const cleanBody = sanitiseInput(req.body as Record<string, unknown>) as any;
  const { title, description, dueDate, priority, status, ownerId, contactId, organizationId } = cleanBody;

  if (!title || !dueDate) {
    res.status(400).json({ error: "title and dueDate are required" });
    return;
  }

  const id = generateId("tsk");
  const [task] = await db
    .insert(tasksTable)
    .values({
      id,
      tenantId: user.tenantId,
      title,
      description: description || null,
      dueDate: new Date(dueDate),
      priority: priority || "MEDIUM",
      status: status || "PENDING",
      ownerId: ownerId || user.id,
      contactId: contactId || null,
      organizationId: organizationId || null,
    })
    .returning();

  res.status(201).json({ ...task, ownerName: user.name, contactName: null, organizationName: null });
  if (user.tenantId) dispatch(user.tenantId, "task.created", { id: task.id, title: task.title }).catch(() => {});
});

router.patch("/tasks/:id", authMiddleware, denyDevRoles, requireRole("ADMIN", "MANAGER", "OPERATOR"), async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const user = req.user!;
  const tenantId = user.tenantId;

  const [existing] = await db
    .select()
    .from(tasksTable)
    .where(and(eq(tasksTable.id, rawId), tenantId ? eq(tasksTable.tenantId, tenantId) : undefined));
  if (!existing) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  const cleanBody = sanitiseInput(req.body as Record<string, unknown>) as any;
  const { title, description, dueDate, priority, status, ownerId, contactId, organizationId } = cleanBody;

  const updates: Record<string, any> = {};
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (dueDate !== undefined) updates.dueDate = new Date(dueDate);
  if (priority !== undefined) updates.priority = priority;
  if (status !== undefined) updates.status = status;
  if (ownerId !== undefined) updates.ownerId = ownerId;
  if (contactId !== undefined) updates.contactId = contactId;
  if (organizationId !== undefined) updates.organizationId = organizationId;

  const [task] = await db
    .update(tasksTable)
    .set(updates)
    .where(and(eq(tasksTable.id, rawId), tenantId ? eq(tasksTable.tenantId, tenantId) : undefined))
    .returning();

  if (status === "DONE" && existing.status !== "DONE") {
    const actId = generateId("act");
    await db.insert(activitiesTable).values({
      id: actId,
      tenantId: user.tenantId,
      type: "TASK_COMPLETED",
      summary: `Completed task: ${task.title}`,
      date: new Date(),
      contactId: task.contactId || null,
      organizationId: task.organizationId || null,
      userId: user.id,
    });
    if (user.tenantId) dispatch(user.tenantId, "task.completed", { id: task.id, title: task.title }).catch(() => {});
  }

  res.json({ ...task, ownerName: user.name, contactName: null, organizationName: null });
});

router.delete("/tasks/:id", authMiddleware, denyDevRoles, requireRole("ADMIN", "MANAGER"), async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const tenantId = req.user!.tenantId;
  await db.delete(tasksTable).where(and(eq(tasksTable.id, rawId), tenantId ? eq(tasksTable.tenantId, tenantId) : undefined));
  res.json({ success: true });
});

export default router;
