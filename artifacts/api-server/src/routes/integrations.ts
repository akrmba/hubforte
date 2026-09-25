import { Router } from "express";
import crypto from "crypto";
import { db, webhooksTable, webhookDeliveryLogTable, integrationConfigsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { authMiddleware, denyDevRoles } from "../lib/auth";
import { generateId } from "../lib/id";
import { logger } from "../lib/logger";
import { encrypt, decrypt } from "../lib/encrypt";
import { dispatch, type WebhookEventType } from "../lib/webhookDelivery";
import type { Request, Response } from "express";

const router = Router();

function getTenantId(req: Request, res: Response): string | null {
  const tenantId = req.user!.tenantId;
  if (!tenantId) { res.status(400).json({ error: "No tenant context" }); return null; }
  return tenantId;
}

function param(req: Request, name: string): string {
  const v = req.params[name];
  return Array.isArray(v) ? v[0] : v;
}

// ---------------------------------------------------------------------------
// Webhook CRUD
// ---------------------------------------------------------------------------

router.get("/webhooks", authMiddleware, denyDevRoles, async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req, res);
    if (!tenantId) return;
    const hooks = await db
      .select()
      .from(webhooksTable)
      .where(eq(webhooksTable.tenantId, tenantId))
      .orderBy(desc(webhooksTable.createdAt));
    res.json({ webhooks: hooks.map((h) => ({ ...h, secret: undefined })) });
  } catch (err) {
    logger.error({ err }, "GET /integrations/webhooks failed");
    res.status(500).json({ error: "Failed to list webhooks" });
  }
});

router.post("/webhooks", authMiddleware, denyDevRoles, async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req, res);
    if (!tenantId) return;
    const { name, url, events, active } = req.body as {
      name?: string; url?: string; events?: string[]; active?: boolean;
    };

    if (!name || !url || !Array.isArray(events)) {
      res.status(400).json({ error: "name, url, and events are required" });
      return;
    }

    try { new URL(url); } catch {
      res.status(400).json({ error: "Invalid webhook URL" });
      return;
    }

    const secret = crypto.randomBytes(32).toString("hex");
    const inboundToken = crypto.randomBytes(24).toString("hex");
    const id = generateId();

    await db.insert(webhooksTable).values({
      id,
      tenantId,
      name,
      url,
      secret,
      inboundToken,
      events,
      active: active !== false,
    });

    const [hook] = await db.select().from(webhooksTable).where(eq(webhooksTable.id, id));
    res.status(201).json({ webhook: { ...hook, secret } });
  } catch (err) {
    logger.error({ err }, "POST /integrations/webhooks failed");
    res.status(500).json({ error: "Failed to create webhook" });
  }
});

router.patch("/webhooks/:id", authMiddleware, denyDevRoles, async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req, res);
    if (!tenantId) return;
    const id = param(req, "id");
    const { name, url, events, active } = req.body as {
      name?: string; url?: string; events?: string[]; active?: boolean;
    };

    const [existing] = await db
      .select()
      .from(webhooksTable)
      .where(and(eq(webhooksTable.id, id), eq(webhooksTable.tenantId, tenantId)));

    if (!existing) { res.status(404).json({ error: "Webhook not found" }); return; }

    if (url) {
      try { new URL(url); } catch {
        res.status(400).json({ error: "Invalid webhook URL" });
        return;
      }
    }

    const updates: Partial<typeof webhooksTable.$inferInsert> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name;
    if (url !== undefined) updates.url = url;
    if (events !== undefined) updates.events = events;
    if (active !== undefined) updates.active = active;

    await db.update(webhooksTable).set(updates).where(eq(webhooksTable.id, id));
    const [updated] = await db.select().from(webhooksTable).where(eq(webhooksTable.id, id));
    res.json({ webhook: { ...updated, secret: undefined } });
  } catch (err) {
    logger.error({ err }, "PATCH /integrations/webhooks/:id failed");
    res.status(500).json({ error: "Failed to update webhook" });
  }
});

router.delete("/webhooks/:id", authMiddleware, denyDevRoles, async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req, res);
    if (!tenantId) return;
    const id = param(req, "id");

    const [existing] = await db
      .select()
      .from(webhooksTable)
      .where(and(eq(webhooksTable.id, id), eq(webhooksTable.tenantId, tenantId)));

    if (!existing) { res.status(404).json({ error: "Webhook not found" }); return; }

    await db.delete(webhooksTable).where(eq(webhooksTable.id, id));
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "DELETE /integrations/webhooks/:id failed");
    res.status(500).json({ error: "Failed to delete webhook" });
  }
});

router.post("/webhooks/:id/test", authMiddleware, denyDevRoles, async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req, res);
    if (!tenantId) return;
    const id = param(req, "id");

    const [hook] = await db
      .select()
      .from(webhooksTable)
      .where(and(eq(webhooksTable.id, id), eq(webhooksTable.tenantId, tenantId)));

    if (!hook) { res.status(404).json({ error: "Webhook not found" }); return; }

    // Deliver directly to this specific webhook only — do NOT use tenant-wide dispatch()
    const testPayload = { event: "test", data: { test: true, webhookId: id, message: "This is a test delivery from Hubforte" }, timestamp: new Date().toISOString() };
    const body = JSON.stringify(testPayload);
    const signature = crypto.createHmac("sha256", hook.secret).update(body).digest("hex");

    let success = false;
    let statusCode: number | undefined;
    let responseBody: string | undefined;
    let errorMessage: string | undefined;

    try {
      const res2 = await fetch(hook.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Hubforte-Signature": `sha256=${signature}`, "X-Hubforte-Event": "test" },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      statusCode = res2.status;
      responseBody = await res2.text().catch(() => "");
      success = res2.ok;
    } catch (err2: unknown) {
      errorMessage = err2 instanceof Error ? err2.message : String(err2);
    }

    await db.insert(webhookDeliveryLogTable).values({
      id: generateId(),
      webhookId: hook.id,
      tenantId,
      eventType: "test",
      success,
      statusCode: statusCode ?? null,
      requestBody: testPayload,
      responseBody: responseBody ?? errorMessage ?? null,
      attemptCount: 1,
      errorMessage: errorMessage ?? null,
    });

    res.json({ success, statusCode, message: success ? "Test delivered successfully" : "Test delivery failed" });
  } catch (err) {
    logger.error({ err }, "POST /integrations/webhooks/:id/test failed");
    res.status(500).json({ error: "Failed to send test" });
  }
});

// ---------------------------------------------------------------------------
// Webhook delivery logs
// ---------------------------------------------------------------------------

router.get("/webhooks/:id/logs", authMiddleware, denyDevRoles, async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req, res);
    if (!tenantId) return;
    const id = param(req, "id");

    const [hook] = await db
      .select()
      .from(webhooksTable)
      .where(and(eq(webhooksTable.id, id), eq(webhooksTable.tenantId, tenantId)));

    if (!hook) { res.status(404).json({ error: "Webhook not found" }); return; }

    const logs = await db
      .select()
      .from(webhookDeliveryLogTable)
      .where(eq(webhookDeliveryLogTable.webhookId, id))
      .orderBy(desc(webhookDeliveryLogTable.createdAt))
      .limit(50);

    res.json({ logs });
  } catch (err) {
    logger.error({ err }, "GET /integrations/webhooks/:id/logs failed");
    res.status(500).json({ error: "Failed to fetch logs" });
  }
});

// ---------------------------------------------------------------------------
// Connector config (integration_configs)
// ---------------------------------------------------------------------------

router.get("/connectors", authMiddleware, denyDevRoles, async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req, res);
    if (!tenantId) return;
    const configs = await db
      .select({
        id: integrationConfigsTable.id,
        connectorKey: integrationConfigsTable.connectorKey,
        active: integrationConfigsTable.active,
        updatedAt: integrationConfigsTable.updatedAt,
      })
      .from(integrationConfigsTable)
      .where(eq(integrationConfigsTable.tenantId, tenantId));

    res.json({ connectors: configs });
  } catch (err) {
    logger.error({ err }, "GET /integrations/connectors failed");
    res.status(500).json({ error: "Failed to list connectors" });
  }
});

router.put("/connectors/:key", authMiddleware, denyDevRoles, async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req, res);
    if (!tenantId) return;
    const key = param(req, "key");
    const { config, active } = req.body as { config?: Record<string, unknown>; active?: boolean };

    if (!config || typeof config !== "object") {
      res.status(400).json({ error: "config object is required" });
      return;
    }

    const encryptedConfig = encrypt(JSON.stringify(config));

    const [existing] = await db
      .select()
      .from(integrationConfigsTable)
      .where(and(eq(integrationConfigsTable.tenantId, tenantId), eq(integrationConfigsTable.connectorKey, key)));

    if (existing) {
      await db
        .update(integrationConfigsTable)
        .set({ encryptedConfig, active: active !== false, updatedAt: new Date() })
        .where(eq(integrationConfigsTable.id, existing.id));
    } else {
      await db.insert(integrationConfigsTable).values({
        id: generateId(),
        tenantId,
        connectorKey: key,
        encryptedConfig,
        active: active !== false,
      });
    }

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "PUT /integrations/connectors/:key failed");
    res.status(500).json({ error: "Failed to save connector config" });
  }
});

router.delete("/connectors/:key", authMiddleware, denyDevRoles, async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req, res);
    if (!tenantId) return;
    const key = param(req, "key");

    await db
      .delete(integrationConfigsTable)
      .where(and(eq(integrationConfigsTable.tenantId, tenantId), eq(integrationConfigsTable.connectorKey, key)));

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "DELETE /integrations/connectors/:key failed");
    res.status(500).json({ error: "Failed to delete connector config" });
  }
});

// ---------------------------------------------------------------------------
// Slack test notification (working connector example)
// ---------------------------------------------------------------------------

router.post("/connectors/slack/test", authMiddleware, denyDevRoles, async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req, res);
    if (!tenantId) return;

    const [cfg] = await db
      .select()
      .from(integrationConfigsTable)
      .where(and(eq(integrationConfigsTable.tenantId, tenantId), eq(integrationConfigsTable.connectorKey, "slack")));

    if (!cfg || !cfg.active) {
      res.status(400).json({ error: "Slack connector is not configured" });
      return;
    }

    const config = JSON.parse(decrypt(cfg.encryptedConfig)) as { webhookUrl?: string };
    if (!config.webhookUrl) {
      res.status(400).json({ error: "Slack webhook URL is not set" });
      return;
    }

    const slackRes = await fetch(config.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: ":white_check_mark: Hubforte Slack connector test — connection successful!" }),
      signal: AbortSignal.timeout(8_000),
    });

    if (!slackRes.ok) {
      res.status(502).json({ error: `Slack returned ${slackRes.status}` });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "POST /integrations/connectors/slack/test failed");
    res.status(500).json({ error: "Failed to send Slack test" });
  }
});

export default router;
