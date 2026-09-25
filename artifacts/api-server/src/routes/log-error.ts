import { Router, type IRouter } from "express";
import { db, errorLogsTable } from "@workspace/db";
import { generateId } from "../lib/id";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.post("/log-error", async (req, res): Promise<void> => {
  const { message, stack, componentStack, url } = req.body;
  const userId = (req as any).user?.id ?? null;

  try {
    await db.insert(errorLogsTable).values({
      id: generateId("err"),
      level: "error",
      message: String(message ?? "Unknown error").slice(0, 2000),
      metadata: {
        stack: String(stack ?? "").slice(0, 5000) || null,
        componentStack: String(componentStack ?? "").slice(0, 5000) || null,
        url: String(url ?? "").slice(0, 500) || null,
        userId,
      },
    });
  } catch (e) {
    logger.error({ err: e }, "Failed to write error log");
  }

  res.json({ ok: true });
});

export default router;
