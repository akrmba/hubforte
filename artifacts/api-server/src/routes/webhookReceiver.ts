import { Router } from "express";
import { db, webhooksTable, webhookDeliveryLogTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { generateId } from "../lib/id";
import { logger } from "../lib/logger";

const router = Router();

// ---------------------------------------------------------------------------
// Incoming webhook receiver — POST /api/webhooks/receive/:tenantId/:token
// Accepts any JSON payload, validates inbound token, returns 200 immediately.
// ---------------------------------------------------------------------------
router.post("/receive/:tenantId/:token", async (req, res): Promise<void> => {
  const { tenantId, token } = req.params;

  // Always return 200 immediately per webhook best practice
  res.status(200).json({ received: true });

  try {
    const [hook] = await db
      .select()
      .from(webhooksTable)
      .where(
        and(
          eq(webhooksTable.tenantId, tenantId),
          eq(webhooksTable.inboundToken, token),
          eq(webhooksTable.active, true)
        )
      );

    if (!hook) {
      logger.warn({ tenantId, token: token.slice(0, 8) + "..." }, "Incoming webhook: no matching hook for token");
      return;
    }

    // Persist payload to DB for later processing via webhook_delivery_log (inbound direction)
    const payload = req.body as Record<string, unknown>;
    await db.insert(webhookDeliveryLogTable).values({
      id: generateId(),
      webhookId: hook.id,
      tenantId,
      eventType: "inbound",
      success: true,
      requestBody: payload,
      attemptCount: 1,
    });

    logger.info({ webhookId: hook.id, tenantId }, "Incoming webhook received and queued");
  } catch (err) {
    logger.error({ err, tenantId }, "Incoming webhook processing error");
  }
});

export default router;
