import crypto from "crypto";
import { db, webhooksTable, webhookDeliveryLogTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { generateId } from "./id";
import { logger } from "./logger";

export type WebhookEventType =
  | "contact.created" | "contact.updated" | "contact.deleted"
  | "organization.created" | "organization.updated" | "organization.deleted"
  | "opportunity.created" | "opportunity.updated" | "opportunity.won" | "opportunity.lost"
  | "activity.created"
  | "task.created" | "task.completed"
  | "campaign.sent"
  | "support.ticket.created" | "support.ticket.resolved"
  | "user.created";

function signPayload(secret: string, body: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

async function deliverOnce(
  url: string,
  secret: string,
  eventType: WebhookEventType,
  payload: Record<string, unknown>
): Promise<{ success: boolean; statusCode?: number; responseBody?: string; error?: string }> {
  const body = JSON.stringify({ event: eventType, data: payload, timestamp: new Date().toISOString() });
  const signature = signPayload(secret, body);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hubforte-Signature": `sha256=${signature}`,
        "X-Hubforte-Event": eventType,
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    const responseBody = await res.text().catch(() => "");
    return { success: res.ok, statusCode: res.status, responseBody };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function dispatch(
  tenantId: string,
  eventType: WebhookEventType,
  payload: Record<string, unknown>
): Promise<void> {
  let hooks: typeof webhooksTable.$inferSelect[];
  try {
    hooks = await db
      .select()
      .from(webhooksTable)
      .where(and(eq(webhooksTable.tenantId, tenantId), eq(webhooksTable.active, true)));
  } catch (err) {
    logger.error({ err, tenantId, eventType }, "webhookDelivery: failed to query webhooks");
    return;
  }

  const matching = hooks.filter((h) => {
    const events = h.events as string[];
    return events.includes(eventType) || events.includes("*");
  });

  for (const hook of matching) {
    let attempt = 0;
    let result: Awaited<ReturnType<typeof deliverOnce>> = { success: false };
    const maxAttempts = 3;

    while (attempt < maxAttempts) {
      attempt++;
      result = await deliverOnce(hook.url, hook.secret, eventType, payload);
      if (result.success) break;
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
      }
    }

    try {
      await db.insert(webhookDeliveryLogTable).values({
        id: generateId(),
        webhookId: hook.id,
        tenantId,
        eventType,
        success: result.success,
        statusCode: result.statusCode ?? null,
        requestBody: payload,
        responseBody: result.responseBody ?? result.error ?? null,
        attemptCount: attempt,
        errorMessage: result.error ?? null,
      });
    } catch (logErr) {
      logger.error({ logErr, webhookId: hook.id }, "webhookDelivery: failed to write delivery log");
    }

    if (!result.success) {
      logger.warn({ webhookId: hook.id, tenantId, eventType, attempts: attempt }, "webhookDelivery: delivery failed after retries");
    }
  }
}
