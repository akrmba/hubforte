import { Router } from "express";
import { db, notificationsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { authMiddleware } from "../lib/auth";
import { logger } from "../lib/logger";

const router = Router();

// GET /notifications — list unread notifications for current user (last 50)
router.get("/", authMiddleware, async (req, res): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId;
    const notifications = await db
      .select()
      .from(notificationsTable)
      .where(and(eq(notificationsTable.userId, req.user!.id), tenantId ? eq(notificationsTable.tenantId, tenantId) : undefined))
      .orderBy(desc(notificationsTable.createdAt))
      .limit(50);

    res.json(notifications);
  } catch (error) {
    logger.error({ error }, "Error fetching notifications");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /notifications/:id/read — mark one as read
router.patch("/:id/read", authMiddleware, async (req, res): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const tenantId = req.user!.tenantId;

    const [updated] = await db
      .update(notificationsTable)
      .set({ read: true })
      .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, req.user!.id), tenantId ? eq(notificationsTable.tenantId, tenantId) : undefined))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Notification not found" });
      return;
    }

    res.json(updated);
  } catch (error) {
    logger.error({ error }, "Error marking notification as read");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /notifications/read-all — mark all as read
router.patch("/read-all", authMiddleware, async (req, res): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId;
    await db
      .update(notificationsTable)
      .set({ read: true })
      .where(and(eq(notificationsTable.userId, req.user!.id), eq(notificationsTable.read, false), tenantId ? eq(notificationsTable.tenantId, tenantId) : undefined));

    res.json({ message: "All notifications marked as read" });
  } catch (error) {
    logger.error({ error }, "Error marking all notifications as read");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /notifications/:id — delete one
router.delete("/:id", authMiddleware, async (req, res): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const tenantId = req.user!.tenantId;

    const [deleted] = await db
      .delete(notificationsTable)
      .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, req.user!.id), tenantId ? eq(notificationsTable.tenantId, tenantId) : undefined))
      .returning();

    if (!deleted) {
      res.status(404).json({ error: "Notification not found" });
      return;
    }

    res.json({ message: "Notification deleted" });
  } catch (error) {
    logger.error({ error }, "Error deleting notification");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
