import { Router, type IRouter } from "express";
import { db, registeredAppsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { authMiddleware, requireRole } from "../lib/auth";
import { auditMiddleware } from "../lib/audit";
import { generateId } from "../lib/id";
import { logger } from "../lib/logger";
import { encrypt } from "../lib/encrypt";
import crypto from "crypto";

const router: IRouter = Router();

// Admin-only — managers must not create/delete machine-to-machine credentials
const adminOnly = requireRole("ADMIN");

function generateApiKey(): string {
  return "yck_" + crypto.randomBytes(32).toString("hex");
}

function generateWebhookSecret(): string {
  return "whs_" + crypto.randomBytes(32).toString("hex");
}

// Hash the apiKey for lookup (SHA-256) — stored alongside the AES-256 encrypted value
// The hash is used for fast indexed lookup; the encrypted value is never needed server-side
// (the plaintext is returned once to the caller and never stored retrievably)
function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

router.get("/", authMiddleware, adminOnly, async (req, res): Promise<void> => {
  const tenantId = req.user!.tenantId;
  if (!tenantId) {
    res.status(403).json({ error: "No tenant assigned" });
    return;
  }

  const apps = await db
    .select({
      id: registeredAppsTable.id,
      appName: registeredAppsTable.appName,
      appSlug: registeredAppsTable.appSlug,
      appUrl: registeredAppsTable.appUrl,
      webhookUrl: registeredAppsTable.webhookUrl,
      scopes: registeredAppsTable.scopes,
      status: registeredAppsTable.status,
      lastUsedAt: registeredAppsTable.lastUsedAt,
      createdAt: registeredAppsTable.createdAt,
    })
    .from(registeredAppsTable)
    .where(eq(registeredAppsTable.tenantId, tenantId))
    .orderBy(registeredAppsTable.createdAt);

  res.json(apps);
});

router.post("/", authMiddleware, adminOnly, auditMiddleware("registered_app"), async (req, res): Promise<void> => {
  const tenantId = req.user!.tenantId;
  if (!tenantId) {
    res.status(403).json({ error: "No tenant assigned" });
    return;
  }

  const { appName, appUrl, webhookUrl, scopes } = req.body as {
    appName?: string;
    appUrl?: string;
    webhookUrl?: string;
    scopes?: string[];
  };

  if (!appName || typeof appName !== "string" || appName.trim().length === 0) {
    res.status(400).json({ error: "appName is required" });
    return;
  }

  const validScopes = [
    "contacts.read", "contacts.write",
    "organizations.read", "organizations.write",
    "activities.read", "activities.write",
    "deals.read", "deals.write",
    "notes.read", "notes.write",
    "lms.read",
  ];

  const requestedScopes = Array.isArray(scopes) ? scopes : [];
  const invalidScopes = requestedScopes.filter((s) => !validScopes.includes(s));
  if (invalidScopes.length > 0) {
    res.status(400).json({ error: `Invalid scopes: ${invalidScopes.join(", ")}` });
    return;
  }

  const appSlug = appName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const apiKey = generateApiKey();
  const webhookSecret = generateWebhookSecret();
  const id = generateId();

  // Store SHA-256 hash of apiKey for fast indexed lookup
  // Store AES-256-GCM encrypted webhookSecret at rest — plaintext returned once to caller
  await db.insert(registeredAppsTable).values({
    id,
    tenantId,
    appName: appName.trim(),
    appSlug,
    appUrl: appUrl || null,
    webhookUrl: webhookUrl || null,
    apiKey: hashApiKey(apiKey),
    webhookSecret: encrypt(webhookSecret),
    scopes: requestedScopes,
    status: "active",
  });

  logger.info({ event: "app_registered", appId: id, tenantId, appName });

  // Return plaintext apiKey and webhookSecret once — not retrievable again
  res.status(201).json({
    id,
    appName: appName.trim(),
    appSlug,
    appUrl: appUrl || null,
    webhookUrl: webhookUrl || null,
    scopes: requestedScopes,
    status: "active",
    apiKey,
    webhookSecret,
    createdAt: new Date().toISOString(),
  });
});

router.delete("/:id", authMiddleware, adminOnly, auditMiddleware("registered_app"), async (req, res): Promise<void> => {
  const tenantId = req.user!.tenantId;
  if (!tenantId) {
    res.status(403).json({ error: "No tenant assigned" });
    return;
  }

  const appId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [deleted] = await db
    .delete(registeredAppsTable)
    .where(and(eq(registeredAppsTable.id, appId), eq(registeredAppsTable.tenantId, tenantId)))
    .returning({ id: registeredAppsTable.id });

  if (!deleted) {
    res.status(404).json({ error: "App not found" });
    return;
  }

  logger.info({ event: "app_deleted", appId, tenantId });
  res.json({ success: true });
});

export default router;
