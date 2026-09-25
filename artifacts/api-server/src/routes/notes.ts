import { Router, type IRouter } from "express";
import { db, notesTable, usersTable } from "@workspace/db";
import { eq, and, desc, count } from "drizzle-orm";
import { authMiddleware, requireRole, denyDevRoles } from "../lib/auth";
import { generateId } from "../lib/id";
import { sanitiseInput } from "../lib/sanitise";

const router: IRouter = Router();

router.get("/notes", authMiddleware, denyDevRoles, async (req, res): Promise<void> => {
  const { contactId, organizationId, page = "1", limit: rawLimit = "25" } = req.query as Record<string, string>;
  const pageNum = Math.max(1, Number(page));
  const limitNum = Math.min(100, Math.max(1, Number(rawLimit)));
  const offset = (pageNum - 1) * limitNum;
  const tenantId = req.user!.tenantId;

  const conditions = [];
  if (tenantId) conditions.push(eq(notesTable.tenantId, tenantId));
  if (contactId) conditions.push(eq(notesTable.contactId, contactId));
  if (organizationId) conditions.push(eq(notesTable.organizationId, organizationId));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const notes = await db
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
    .where(where)
    .orderBy(desc(notesTable.createdAt))
    .limit(limitNum)
    .offset(offset);

  const [totalResult] = await db
    .select({ count: count() })
    .from(notesTable)
    .where(where);

  res.json({
    data: notes,
    total: totalResult.count,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(totalResult.count / limitNum) || 1,
  });
});

router.post("/notes", authMiddleware, denyDevRoles, requireRole("ADMIN", "MANAGER", "OPERATOR"), async (req, res): Promise<void> => {
  const user = req.user!;
  const cleanBody = sanitiseInput(req.body as Record<string, unknown>) as any;
  const { content, contactId, organizationId } = cleanBody;

  if (content == null) {
    res.status(400).json({ error: "content is required" });
    return;
  }

  const id = generateId("note");
  const [note] = await db
    .insert(notesTable)
    .values({
      id,
      tenantId: user.tenantId,
      content,
      authorId: user.id,
      contactId: contactId || null,
      organizationId: organizationId || null,
    })
    .returning();

  res.status(201).json({ ...note, authorName: user.name });
});

router.delete("/notes/:id", authMiddleware, denyDevRoles, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const user = req.user!;
  const tenantId = user.tenantId;

  const [note] = await db
    .select()
    .from(notesTable)
    .where(and(eq(notesTable.id, rawId), tenantId ? eq(notesTable.tenantId, tenantId) : undefined));
  if (!note) {
    res.status(404).json({ error: "Note not found" });
    return;
  }

  if (note.authorId !== user.id && user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  await db.delete(notesTable).where(and(eq(notesTable.id, rawId), tenantId ? eq(notesTable.tenantId, tenantId) : undefined));
  res.json({ success: true });
});

export default router;
