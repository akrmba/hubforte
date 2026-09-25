import { Router, type IRouter } from "express";
import { db, emailTemplatesTable, usersTable } from "@workspace/db";
import { eq, and, desc, count } from "drizzle-orm";
import { authMiddleware, requireRole, denyDevRoles } from "../lib/auth";
import { generateId } from "../lib/id";
import { extractVariables } from "../lib/templateEngine";
import { sanitiseInput } from "../lib/sanitise";

const router: IRouter = Router();

router.get("/templates", authMiddleware, denyDevRoles, async (req, res): Promise<void> => {
  const { page = "1", limit: rawLimit = "25" } = req.query as Record<string, string>;
  const pageNum = Math.max(1, Number(page));
  const limitNum = Math.min(100, Math.max(1, Number(rawLimit)));
  const offset = (pageNum - 1) * limitNum;
  const tenantId = req.user!.tenantId;

  const templates = await db
    .select({
      id: emailTemplatesTable.id,
      name: emailTemplatesTable.name,
      subject: emailTemplatesTable.subject,
      body: emailTemplatesTable.body,
      variables: emailTemplatesTable.variables,
      ownerId: emailTemplatesTable.ownerId,
      ownerName: usersTable.name,
      createdAt: emailTemplatesTable.createdAt,
      updatedAt: emailTemplatesTable.updatedAt,
    })
    .from(emailTemplatesTable)
    .leftJoin(usersTable, eq(emailTemplatesTable.ownerId, usersTable.id))
    .where(tenantId ? eq(emailTemplatesTable.tenantId, tenantId) : undefined)
    .orderBy(desc(emailTemplatesTable.updatedAt))
    .limit(limitNum)
    .offset(offset);

  const [totalResult] = await db
    .select({ count: count() })
    .from(emailTemplatesTable)
    .where(tenantId ? eq(emailTemplatesTable.tenantId, tenantId) : undefined);

  res.json({
    data: templates,
    total: totalResult.count,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(totalResult.count / limitNum) || 1,
  });
});

router.post("/templates", authMiddleware, denyDevRoles, requireRole("ADMIN", "MANAGER", "OPERATOR"), async (req, res): Promise<void> => {
  const user = req.user!;

  const cleanBody = sanitiseInput(req.body as Record<string, unknown>) as any;
  const { name, subject, body } = cleanBody;

  if (!name || !subject || !body) {
    res.status(400).json({ error: "name, subject, and body are required" });
    return;
  }

  const variables = [...new Set([...extractVariables(subject), ...extractVariables(body)])];

  const id = generateId("tpl");
  const [template] = await db
    .insert(emailTemplatesTable)
    .values({ id, tenantId: user.tenantId, name, subject, body, variables, ownerId: user.id })
    .returning();

  res.status(201).json({ ...template, ownerName: user.name });
});

router.get("/templates/:id", authMiddleware, denyDevRoles, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const tenantId = req.user!.tenantId;

  const [template] = await db
    .select({
      id: emailTemplatesTable.id,
      name: emailTemplatesTable.name,
      subject: emailTemplatesTable.subject,
      body: emailTemplatesTable.body,
      variables: emailTemplatesTable.variables,
      ownerId: emailTemplatesTable.ownerId,
      ownerName: usersTable.name,
      createdAt: emailTemplatesTable.createdAt,
      updatedAt: emailTemplatesTable.updatedAt,
    })
    .from(emailTemplatesTable)
    .leftJoin(usersTable, eq(emailTemplatesTable.ownerId, usersTable.id))
    .where(and(eq(emailTemplatesTable.id, rawId), tenantId ? eq(emailTemplatesTable.tenantId, tenantId) : undefined));

  if (!template) {
    res.status(404).json({ error: "Template not found" });
    return;
  }

  res.json(template);
});

router.patch("/templates/:id", authMiddleware, denyDevRoles, requireRole("ADMIN", "MANAGER", "OPERATOR"), async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const user = req.user!;
  const tenantId = user.tenantId;
  const cleanBody = sanitiseInput(req.body as Record<string, unknown>) as any;
  const { name, subject, body } = cleanBody;

  const updates: Record<string, any> = {};
  if (name !== undefined) updates.name = name;
  if (subject !== undefined) updates.subject = subject;
  if (body !== undefined) updates.body = body;

  const [existing] = await db
    .select()
    .from(emailTemplatesTable)
    .where(and(eq(emailTemplatesTable.id, rawId), tenantId ? eq(emailTemplatesTable.tenantId, tenantId) : undefined));
  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  if (user.role === "OPERATOR" && existing.ownerId !== user.id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  if (subject !== undefined || body !== undefined) {
    const newSubject = subject ?? existing.subject ?? "";
    const newBody = body ?? existing.body ?? "";
    updates.variables = [...new Set([...extractVariables(newSubject), ...extractVariables(newBody)])];
  }

  const [template] = await db
    .update(emailTemplatesTable)
    .set(updates)
    .where(and(eq(emailTemplatesTable.id, rawId), tenantId ? eq(emailTemplatesTable.tenantId, tenantId) : undefined))
    .returning();

  if (!template) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json({ ...template, ownerName: null });
});

router.delete("/templates/:id", authMiddleware, denyDevRoles, requireRole("ADMIN", "MANAGER"), async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const user = req.user!;
  const tenantId = user.tenantId;

  const [template] = await db
    .select()
    .from(emailTemplatesTable)
    .where(and(eq(emailTemplatesTable.id, rawId), tenantId ? eq(emailTemplatesTable.tenantId, tenantId) : undefined));
  if (!template) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  if (template.ownerId !== user.id && user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  await db
    .delete(emailTemplatesTable)
    .where(and(eq(emailTemplatesTable.id, rawId), tenantId ? eq(emailTemplatesTable.tenantId, tenantId) : undefined));
  res.json({ success: true });
});

export default router;
