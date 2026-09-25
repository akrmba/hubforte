import { Router, Request, Response, NextFunction } from "express";
import { authMiddleware, requireRole, denyDevRoles } from "../lib/auth";
import { db, tenantAiConfigTable, tenantsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { encrypt, decrypt } from "../lib/encrypt";
import { generateId } from "../lib/id";
import { logger } from "../lib/logger";
import { checkModuleEnabled } from "../lib/featureFlags";

/** Middleware: block BYOK write actions unless the owner has enabled BYOK for this tenant. */
async function requireByokEnabled(req: Request, res: Response, next: NextFunction): Promise<void> {
  const tenantId = req.user?.tenantId;
  if (!tenantId) { res.status(400).json({ error: "No tenant context" }); return; }
  try {
    const [tenant] = await db
      .select({ byokEnabled: tenantsTable.byokEnabled })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, tenantId))
      .limit(1);
    if (!tenant?.byokEnabled) {
      res.status(403).json({ error: "Bring Your Own Key (BYOK) is not enabled for this account. Contact your platform administrator." });
      return;
    }
    next();
  } catch (err) {
    logger.error({ err }, "requireByokEnabled check failed");
    res.status(500).json({ error: "Internal server error" });
  }
}

const router = Router();

// Mask an API key for safe display: show first 4 + last 4 chars
function maskKey(key: string): string {
  if (key.length <= 8) return "****";
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

// GET /settings/ai — return current tenant AI config (key masked)
router.get("/", authMiddleware, denyDevRoles, checkModuleEnabled("ai"), async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId;
    if (!tenantId) { res.status(400).json({ error: "No tenant context" }); return; }

    // If BYOK is not owner-enabled, always report system default regardless of any stored config
    const [tenant] = await db
      .select({ byokEnabled: tenantsTable.byokEnabled })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, tenantId))
      .limit(1);

    if (!tenant?.byokEnabled) {
      res.json({
        configured: false,
        source: "system_default",
        byokEnabled: false,
        defaultProvider: process.env.DEFAULT_CLIENT_AI_PROVIDER || "openrouter",
        defaultModel: process.env.DEFAULT_CLIENT_AI_MODEL || "deepseek/deepseek-chat",
        features: {
          emailComposer: true,
          contactSummary: true,
          leadScore: true,
          nextBestAction: true,
          navHelper: true,
        },
      });
      return;
    }

    const [cfg] = await db
      .select()
      .from(tenantAiConfigTable)
      .where(eq(tenantAiConfigTable.tenantId, tenantId))
      .limit(1);

    if (!cfg) {
      res.json({
        configured: false,
        source: "system_default",
        defaultProvider: process.env.DEFAULT_CLIENT_AI_PROVIDER || "openrouter",
        defaultModel: process.env.DEFAULT_CLIENT_AI_MODEL || "deepseek/deepseek-chat",
        features: {
          emailComposer: true,
          contactSummary: true,
          leadScore: true,
          nextBestAction: true,
          navHelper: true,
        },
      });
      return;
    }

    // Reset usage counter if new month
    const now = new Date();
    const resetAt = new Date(cfg.usageResetAt);
    if (now.getMonth() !== resetAt.getMonth() || now.getFullYear() !== resetAt.getFullYear()) {
      await db
        .update(tenantAiConfigTable)
        .set({ usageThisMonth: 0, usageResetAt: now })
        .where(eq(tenantAiConfigTable.tenantId, tenantId));
      cfg.usageThisMonth = 0;
    }

    let maskedKey = "****";
    try {
      const raw = decrypt(cfg.encryptedApiKey);
      maskedKey = maskKey(raw);
    } catch {
      maskedKey = "****";
    }

    res.json({
      configured: true,
      source: "byok",
      provider: cfg.provider,
      maskedApiKey: maskedKey,
      model: cfg.model,
      monthlyBudgetUSD: cfg.monthlyBudgetUSD,
      usageThisMonth: cfg.usageThisMonth,
      features: {
        emailComposer: cfg.emailComposerEnabled,
        contactSummary: cfg.contactSummaryEnabled,
        leadScore: cfg.leadScoreEnabled,
        nextBestAction: cfg.nextBestActionEnabled,
        navHelper: cfg.navHelperEnabled,
      },
    });
  } catch (err) {
    logger.error({ err }, "GET /settings/ai error");
    res.status(500).json({ error: "Failed to load AI settings" });
  }
});

// POST /settings/ai — save or update BYOK config
router.post("/", authMiddleware, denyDevRoles, requireRole("ADMIN"), checkModuleEnabled("ai"), requireByokEnabled, async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId;
    if (!tenantId) { res.status(400).json({ error: "No tenant context" }); return; }

    const { provider, apiKey, model, monthlyBudget, features } = req.body;

    if (!provider || !apiKey || !model) {
      res.status(400).json({ error: "provider, apiKey, and model are required" });
      return;
    }

    if (!["openai", "anthropic", "openrouter"].includes(provider)) {
      res.status(400).json({ error: "provider must be openai, anthropic, or openrouter" });
      return;
    }

    const encryptedApiKey = encrypt(apiKey);
    const budget = typeof monthlyBudget === "number" && monthlyBudget > 0 ? monthlyBudget : 10;

    const [existing] = await db
      .select({ id: tenantAiConfigTable.id })
      .from(tenantAiConfigTable)
      .where(eq(tenantAiConfigTable.tenantId, tenantId))
      .limit(1);

    if (existing) {
      await db
        .update(tenantAiConfigTable)
        .set({
          provider,
          encryptedApiKey,
          model,
          monthlyBudgetUSD: budget,
          emailComposerEnabled: features?.emailComposer ?? true,
          contactSummaryEnabled: features?.contactSummary ?? true,
          leadScoreEnabled: features?.leadScore ?? true,
          nextBestActionEnabled: features?.nextBestAction ?? true,
          navHelperEnabled: features?.navHelper ?? true,
          updatedAt: new Date(),
        })
        .where(eq(tenantAiConfigTable.tenantId, tenantId));
    } else {
      await db.insert(tenantAiConfigTable).values({
        id: generateId(),
        tenantId,
        provider,
        encryptedApiKey,
        model,
        monthlyBudgetUSD: budget,
        usageThisMonth: 0,
        usageResetAt: new Date(),
        emailComposerEnabled: features?.emailComposer ?? true,
        contactSummaryEnabled: features?.contactSummary ?? true,
        leadScoreEnabled: features?.leadScore ?? true,
        nextBestActionEnabled: features?.nextBestAction ?? true,
        navHelperEnabled: features?.navHelper ?? true,
      });
    }

    res.json({ success: true, message: "AI settings saved" });
  } catch (err) {
    logger.error({ err }, "POST /settings/ai error");
    res.status(500).json({ error: "Failed to save AI settings" });
  }
});

// DELETE /settings/ai — remove BYOK config (revert to system default)
router.delete("/", authMiddleware, denyDevRoles, requireRole("ADMIN"), checkModuleEnabled("ai"), requireByokEnabled, async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId;
    if (!tenantId) { res.status(400).json({ error: "No tenant context" }); return; }

    await db
      .delete(tenantAiConfigTable)
      .where(eq(tenantAiConfigTable.tenantId, tenantId));

    res.json({ success: true, message: "AI settings removed. Reverted to system default." });
  } catch (err) {
    logger.error({ err }, "DELETE /settings/ai error");
    res.status(500).json({ error: "Failed to remove AI settings" });
  }
});

// GET /settings/ai/usage — usage this month vs budget
router.get("/usage", authMiddleware, denyDevRoles, checkModuleEnabled("ai"), async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId;
    if (!tenantId) { res.status(400).json({ error: "No tenant context" }); return; }

    // If BYOK is not owner-enabled, always report system default — never expose stored BYOK usage
    const [tenant] = await db
      .select({ byokEnabled: tenantsTable.byokEnabled })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, tenantId))
      .limit(1);

    if (!tenant?.byokEnabled) {
      res.json({ usageThisMonth: 0, monthlyBudgetUSD: null, percentUsed: 0, source: "system_default" });
      return;
    }

    const [cfg] = await db
      .select({
        usageThisMonth: tenantAiConfigTable.usageThisMonth,
        monthlyBudgetUSD: tenantAiConfigTable.monthlyBudgetUSD,
        usageResetAt: tenantAiConfigTable.usageResetAt,
      })
      .from(tenantAiConfigTable)
      .where(eq(tenantAiConfigTable.tenantId, tenantId))
      .limit(1);

    if (!cfg) {
      res.json({ usageThisMonth: 0, monthlyBudgetUSD: null, percentUsed: 0, source: "system_default" });
      return;
    }

    const percentUsed = cfg.monthlyBudgetUSD > 0
      ? Math.min(100, Math.round((cfg.usageThisMonth / cfg.monthlyBudgetUSD) * 100))
      : 0;

    res.json({
      usageThisMonth: cfg.usageThisMonth,
      monthlyBudgetUSD: cfg.monthlyBudgetUSD,
      percentUsed,
      usageResetAt: cfg.usageResetAt,
      source: "byok",
    });
  } catch (err) {
    logger.error({ err }, "GET /settings/ai/usage error");
    res.status(500).json({ error: "Failed to load AI usage" });
  }
});

// POST /settings/ai/test — test the AI connection
router.post("/test", authMiddleware, denyDevRoles, requireRole("ADMIN"), checkModuleEnabled("ai"), requireByokEnabled, async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId;
    const { getAIProvider, chatCompletionWithContext } = await import("../lib/aiProvider");
    const ctx = await getAIProvider("client", tenantId ?? undefined);
    const result = await chatCompletionWithContext(ctx, "Reply with exactly: OK");
    res.json({ success: true, provider: ctx.provider, model: ctx.model, response: result.content.trim() });
  } catch (err: any) {
    logger.warn({ err }, "AI connection test failed");
    res.status(400).json({ success: false, error: err?.message || "AI connection test failed" });
  }
});

// POST /settings/ai/update-meta — update non-key fields without replacing the API key
router.post("/update-meta", authMiddleware, denyDevRoles, requireRole("ADMIN"), checkModuleEnabled("ai"), requireByokEnabled, async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId;
    if (!tenantId) { res.status(400).json({ error: "No tenant context" }); return; }

    const { provider, model, monthlyBudget, features } = req.body;

    const [existing] = await db
      .select({ id: tenantAiConfigTable.id })
      .from(tenantAiConfigTable)
      .where(eq(tenantAiConfigTable.tenantId, tenantId))
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: "No AI config found. Please save a full config with an API key first." });
      return;
    }

    const updates: Record<string, any> = { updatedAt: new Date() };
    // provider is intentionally excluded — changing provider requires a new API key (use POST /settings/ai)
    if (model) updates.model = model;
    if (typeof monthlyBudget === "number" && monthlyBudget > 0) updates.monthlyBudgetUSD = monthlyBudget;
    if (features) {
      if (features.emailComposer !== undefined) updates.emailComposerEnabled = features.emailComposer;
      if (features.contactSummary !== undefined) updates.contactSummaryEnabled = features.contactSummary;
      if (features.leadScore !== undefined) updates.leadScoreEnabled = features.leadScore;
      if (features.nextBestAction !== undefined) updates.nextBestActionEnabled = features.nextBestAction;
      if (features.navHelper !== undefined) updates.navHelperEnabled = features.navHelper;
    }

    await db
      .update(tenantAiConfigTable)
      .set(updates)
      .where(eq(tenantAiConfigTable.tenantId, tenantId));

    res.json({ success: true, message: "AI settings updated" });
  } catch (err) {
    logger.error({ err }, "POST /settings/ai/update-meta error");
    res.status(500).json({ error: "Failed to update AI settings" });
  }
});

export default router;
