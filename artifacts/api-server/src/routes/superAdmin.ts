import { Router, type IRouter } from "express";
import { db, usersTable, featureFlagsTable, tenantFeatureFlagsTable, tenantsTable, aiLogsTable, aiConfigTable, MODULE_DEFINITIONS, getModuleDefinition, validateModuleDependencies, validateModuleDependents } from "@workspace/db";
import { eq, desc, count } from "drizzle-orm";
import { authMiddleware } from "../lib/auth";
import { auditMiddleware } from "../lib/audit";
import { invalidateModuleCache } from "../lib/featureFlags";
import { generateId } from "../lib/id";
import { getMaintenanceStatus, enableMaintenanceMode, disableMaintenanceMode } from "../lib/maintenanceMode";
import { handleDeployFailure } from "../lib/deployHealth";
import { getModelConfig, listModels, getDefaultProvider, getDefaultModel, type AIProvider } from "../lib/aiModels";
import { getAvailableProviders } from "../lib/aiProvider";
import { logger } from "../lib/logger";
import { writeAuditLog } from "../lib/audit";

const router: IRouter = Router();

const superAdminOnly = (req: any, res: any, next: any) => {
  if (req.user?.role !== "SUPER_ADMIN") {
    res.status(403).json({ error: "Super Admin only" });
    return;
  }
  next();
};

// GET /api/super-admin/feature-flags
router.get("/", authMiddleware, superAdminOnly, async (_req, res): Promise<void> => {
  const flags = await db
    .select()
    .from(featureFlagsTable)
    .orderBy(featureFlagsTable.module);

  // Join updatedBy user names
  const userIds = [...new Set(flags.map((f) => f.updatedBy).filter(Boolean))] as string[];
  let userMap = new Map<string, string>();
  if (userIds.length > 0) {
    const users = await db
      .select({ id: usersTable.id, name: usersTable.name })
      .from(usersTable);
    userMap = new Map(users.map((u) => [u.id, u.name || u.id]));
  }

  res.json(
    flags.map((f) => ({
      ...f,
      updatedByName: f.updatedBy ? userMap.get(f.updatedBy) || f.updatedBy : null,
    }))
  );
});

// PATCH /api/super-admin/feature-flags/:module
router.patch("/feature-flags/:module", authMiddleware, superAdminOnly, auditMiddleware("feature_flag"), async (req, res): Promise<void> => {
  const moduleName = Array.isArray(req.params.module) ? req.params.module[0] : req.params.module;
  const { enabled } = req.body;

  if (typeof enabled !== "boolean") {
    res.status(400).json({ error: "enabled must be a boolean" });
    return;
  }

  // Get current enabled modules globally
  const enabledModules = await db
    .select({ module: featureFlagsTable.module })
    .from(featureFlagsTable)
    .where(eq(featureFlagsTable.enabled, true));

  const enabledModuleKeys = enabledModules.map(m => m.module);

  if (enabled) {
    // Check if module can be enabled (dependencies)
    const { getModuleDefinition, validateModuleDependencies } = await import("@workspace/db");
    const moduleDef = getModuleDefinition(moduleName);
    
    if (moduleDef) {
      const missingDeps = validateModuleDependencies(moduleName, enabledModuleKeys);
      if (missingDeps.length > 0) {
        res.status(400).json({ 
          error: "Cannot enable module due to missing dependencies", 
          missingDependencies: missingDeps 
        });
        return;
      }

      // Check conflicts
      if (moduleDef.conflicts) {
        const conflicts = moduleDef.conflicts.filter(conflict => enabledModuleKeys.includes(conflict));
        if (conflicts.length > 0) {
          res.status(400).json({ 
            error: "Cannot enable module due to conflicts", 
            conflicts 
          });
          return;
        }
      }
    }
  } else {
    // Check if module can be disabled (dependents)
    const { validateModuleDependents } = await import("@workspace/db");
    const dependents = validateModuleDependents(moduleName, enabledModuleKeys);
    
    if (dependents.length > 0) {
      res.status(400).json({ 
        error: "Cannot disable module because other modules depend on it", 
        dependents 
      });
      return;
    }

    // Check if module is required
    const { getModuleDefinition } = await import("@workspace/db");
    const moduleDef = getModuleDefinition(moduleName);
    if (moduleDef?.required) {
      res.status(400).json({ 
        error: "Cannot disable required module" 
      });
      return;
    }
  }

  const [updated] = await db
    .update(featureFlagsTable)
    .set({ enabled, updatedBy: req.user!.id, updatedAt: new Date() })
    .where(eq(featureFlagsTable.module, moduleName))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Module not found" });
    return;
  }

  // Invalidate cache for this module
  invalidateModuleCache(moduleName);

  res.json(updated);
});

// GET /api/super-admin/users
router.get("/users", authMiddleware, superAdminOnly, async (_req, res): Promise<void> => {
  const users = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      role: usersTable.role,
      active: usersTable.active,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .orderBy(usersTable.createdAt);

  res.json(users);
});

// GET /api/super-admin/maintenance
router.get("/maintenance", authMiddleware, superAdminOnly, (_req, res): void => {
  res.json(getMaintenanceStatus());
});

// POST /api/super-admin/maintenance/enable
router.post("/maintenance/enable", authMiddleware, superAdminOnly, auditMiddleware("maintenance_mode"), async (req, res): Promise<void> => {
  const { message, estimatedResolution } = req.body || {};
  await enableMaintenanceMode(req.user!.id, message, estimatedResolution);
  res.json(getMaintenanceStatus());
});

// POST /api/super-admin/maintenance/disable
router.post("/maintenance/disable", authMiddleware, superAdminOnly, auditMiddleware("maintenance_mode"), async (req, res): Promise<void> => {
  await disableMaintenanceMode(req.user!.id);
  res.json(getMaintenanceStatus());
});

// POST /api/super-admin/deploy/report-failure — report a failed deploy
// Triggers auto-detection: re-enables maintenance, creates error log, notifies admins
router.post("/deploy/report-failure", authMiddleware, superAdminOnly, auditMiddleware("deploy"), async (req, res): Promise<void> => {
  const { checks, commitHash } = req.body || {};
  if (!Array.isArray(checks) || checks.length === 0) {
    res.status(400).json({ error: "checks must be a non-empty array of strings" });
    return;
  }

  await handleDeployFailure({
    checks,
    commitHash,
    timestamp: new Date().toISOString(),
  });

  res.json({
    status: "deploy_failure_recorded",
    actions: [
      "Critical error log entry created",
      "In-app notification sent to admins",
      "Maintenance mode re-enabled (was disabled)",
    ],
    nextSteps: "Follow ops/ROLLBACK_RUNBOOK.md — no automatic fixes will be attempted",
  });
});

// GET /api/super-admin/ai-config — returns current AI defaults and available options
router.get("/ai-config", authMiddleware, superAdminOnly, async (_req, res): Promise<void> => {
  try {
    // Read persisted config from DB, fall back to env vars
    const [providerRow] = await db
      .select()
      .from(aiConfigTable)
      .where(eq(aiConfigTable.key, "default_provider"));

    const [modelRow] = await db
      .select()
      .from(aiConfigTable)
      .where(eq(aiConfigTable.key, "default_model"));

    const defaultProvider = providerRow?.value || process.env.AI_DEFAULT_PROVIDER || getDefaultProvider();
    const defaultModel = modelRow?.value || process.env.AI_DEFAULT_MODEL || getDefaultModel();
    const availableProviders = getAvailableProviders();
    const allModels = listModels();
    const availableModels = allModels.filter((m) => availableProviders.includes(m.provider));

    res.json({
      defaultProvider,
      defaultModel,
      availableProviders,
      models: availableModels.map((m) => ({
        key: m.modelId,
        displayName: m.displayName,
        provider: m.provider,
        supportsJsonMode: m.supportsJsonMode,
      })),
    });
  } catch (error: any) {
    logger.error({ error }, "Failed to fetch AI config");
    res.status(500).json({ error: "Failed to fetch AI config" });
  }
});

// PUT /api/super-admin/ai-config — persist default provider/model
router.put("/ai-config", authMiddleware, superAdminOnly, auditMiddleware("ai_config"), async (req, res): Promise<void> => {
  try {
    const { provider, model } = req.body;
    if (!provider || !model) {
      res.status(400).json({ error: "provider and model are required" });
      return;
    }

    // Validate model belongs to provider
    const config = getModelConfig(model);
    if (config.provider !== provider) {
      res.status(400).json({ error: `Model "${model}" does not belong to provider "${provider}"` });
      return;
    }

    // Upsert into ai_config table
    await db
      .insert(aiConfigTable)
      .values({
        key: "default_provider",
        value: provider,
        updatedBy: req.user!.id,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: aiConfigTable.key,
        set: { value: provider, updatedBy: req.user!.id, updatedAt: new Date() },
      });

    await db
      .insert(aiConfigTable)
      .values({
        key: "default_model",
        value: model,
        updatedBy: req.user!.id,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: aiConfigTable.key,
        set: { value: model, updatedBy: req.user!.id, updatedAt: new Date() },
      });

    // Also update runtime env for immediate effect
    process.env.AI_DEFAULT_PROVIDER = provider;
    process.env.AI_DEFAULT_MODEL = model;

    res.json({ success: true, provider, model });
  } catch (error: any) {
    if (error.message?.startsWith("Unknown AI model")) {
      res.status(400).json({ error: error.message });
      return;
    }
    logger.error({ error }, "Failed to update AI config");
    res.status(500).json({ error: "Failed to update AI config" });
  }
});

// GET /api/super-admin/ai-logs — last 50 AI interactions
router.get("/ai-logs", authMiddleware, superAdminOnly, async (_req, res): Promise<void> => {
  try {
    const logs = await db
      .select()
      .from(aiLogsTable)
      .orderBy(desc(aiLogsTable.createdAt))
      .limit(50);

    res.json(logs);
  } catch (error: any) {
    logger.error({ error }, "Failed to fetch AI logs");
    res.status(500).json({ error: "Failed to fetch AI logs" });
  }
});

// GET /api/super-admin/modules/global
// Returns global defaults enriched with module registry metadata
router.get("/modules/global", authMiddleware, superAdminOnly, async (_req, res): Promise<void> => {
  const flags = await db
    .select({ module: featureFlagsTable.module, enabled: featureFlagsTable.enabled, updatedAt: featureFlagsTable.updatedAt, updatedBy: featureFlagsTable.updatedBy })
    .from(featureFlagsTable)
    .orderBy(featureFlagsTable.module);

  const flagMap = new Map(flags.map((f) => [f.module, f]));

  const result = MODULE_DEFINITIONS.map((def) => {
    const flag = flagMap.get(def.key);
    return {
      key: def.key,
      name: def.name,
      description: def.description,
      category: def.category,
      required: def.required,
      defaultEnabled: def.defaultEnabled,
      dependencies: def.dependencies,
      enabled: flag?.enabled ?? def.defaultEnabled,
      updatedAt: flag?.updatedAt ?? null,
      updatedBy: flag?.updatedBy ?? null,
    };
  });

  res.json(result);
});

// PATCH /api/super-admin/modules/global/:moduleKey
router.patch("/modules/global/:moduleKey", authMiddleware, superAdminOnly, auditMiddleware("feature_flag"), async (req, res): Promise<void> => {
  const moduleName = Array.isArray(req.params.moduleKey) ? req.params.moduleKey[0] : req.params.moduleKey;
  const { enabled } = req.body;

  if (typeof enabled !== "boolean") {
    res.status(400).json({ error: "enabled must be a boolean" });
    return;
  }

  const moduleDef = getModuleDefinition(moduleName);
  if (!moduleDef) {
    res.status(404).json({ error: "Module not found" });
    return;
  }

  if (!enabled && moduleDef.required) {
    res.status(400).json({ error: "Cannot disable required module" });
    return;
  }

  // Validate against current global enabled state
  const globalFlags = await db
    .select({ module: featureFlagsTable.module, enabled: featureFlagsTable.enabled })
    .from(featureFlagsTable);
  const enabledModuleKeys = globalFlags.filter((f) => f.enabled).map((f) => f.module);

  if (enabled) {
    const missingDeps = validateModuleDependencies(moduleName, enabledModuleKeys);
    if (missingDeps.length > 0) {
      res.status(400).json({ error: "Cannot enable module due to missing dependencies", missingDependencies: missingDeps });
      return;
    }
    if (moduleDef.conflicts) {
      const conflicts = moduleDef.conflicts.filter((c) => enabledModuleKeys.includes(c));
      if (conflicts.length > 0) {
        res.status(400).json({ error: "Cannot enable module due to conflicts", conflicts });
        return;
      }
    }
  } else {
    const dependents = validateModuleDependents(moduleName, enabledModuleKeys);
    if (dependents.length > 0) {
      res.status(400).json({ error: "Cannot disable module because other modules depend on it", dependents });
      return;
    }
  }

  const [updated] = await db
    .update(featureFlagsTable)
    .set({ enabled, updatedBy: req.user!.id, updatedAt: new Date() })
    .where(eq(featureFlagsTable.module, moduleName))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Module not found in feature_flags table" });
    return;
  }

  // Count tenants with no override row for this module — they inherit the global default
  const overrideRows = await db
    .select({ tenantId: tenantFeatureFlagsTable.tenantId })
    .from(tenantFeatureFlagsTable)
    .where(eq(tenantFeatureFlagsTable.module, moduleName));

  const [{ total }] = await db.select({ total: count() }).from(tenantsTable);
  const tenantsAffected = (total as number) - overrideRows.length;

  invalidateModuleCache(moduleName);

  res.json({ key: moduleName, enabled, tenantsAffected });
});

// POST /api/super-admin/emergency-access/activate
// Break-glass: activates the emergency account using a one-time token from env.
// No auth required — this is the recovery path when all admin accounts are locked out.
router.post("/emergency-access/activate", async (req, res): Promise<void> => {
  const clientIp = req.ip || req.socket.remoteAddress || '';
  const isLocal = clientIp === '127.0.0.1' ||
                  clientIp === '::1' ||
                  clientIp === '::ffff:127.0.0.1';
  if (!isLocal) {
    res.status(403).json({
      error: true,
      code: 'FORBIDDEN',
      message: 'Emergency access can only be activated from localhost.'
    });
    return;
  }

  const { token } = req.body as { token?: string };
  const expectedToken = process.env.EMERGENCY_ACTIVATION_TOKEN;

  if (!expectedToken) {
    res.status(503).json({ error: "Emergency access is not configured on this instance." });
    return;
  }
  if (!token || token !== expectedToken) {
    res.status(401).json({ error: "Invalid activation token." });
    return;
  }

  const emergencyUser = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.isEmergencyAccount, true))
    .limit(1);

  if (emergencyUser.length === 0) {
    res.status(404).json({ error: "No emergency account found. Run scripts/emergency-access.ts to create one." });
    return;
  }

  const activatedAt = new Date();
  const expiresAt = new Date(activatedAt.getTime() + 2 * 60 * 60 * 1000);

  await db
    .update(usersTable)
    .set({ active: true, emergencyActivatedAt: activatedAt } as any)
    .where(eq(usersTable.isEmergencyAccount, true));

  writeAuditLog({
    userId: '',
    userRole: 'SYSTEM',
    tenantId: null,
    action: 'EMERGENCY_ACCESS_ACTIVATED',
    entityType: 'user',
    entityId: emergencyUser[0].id,
    route: req.originalUrl,
    method: 'POST',
    ipAddress: req.ip,
    changes: {
      activatedAt: activatedAt.toISOString(),
      activatedFromIp: req.ip,
      expiresAt: expiresAt.toISOString(),
    },
  });

  logger.warn({ userId: emergencyUser[0].id }, "Emergency account activated via break-glass token");
  res.json({ message: "Emergency account activated. Sign in with the emergency credentials, then immediately disable it after recovery." });
});

// POST /api/super-admin/emergency-access/deactivate (requires auth — call after recovery)
router.post("/emergency-access/deactivate", authMiddleware, superAdminOnly, async (req, res): Promise<void> => {
  const [emergencyUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.isEmergencyAccount, true))
    .limit(1);

  await db
    .update(usersTable)
    .set({ active: false, emergencyActivatedAt: null } as any)
    .where(eq(usersTable.isEmergencyAccount, true));

  if (emergencyUser) {
    writeAuditLog({
      userId: req.user?.id ?? '',
      userRole: req.user?.role ?? 'SUPER_ADMIN',
      tenantId: null,
      action: 'EMERGENCY_ACCESS_DEACTIVATED',
      entityType: 'user',
      entityId: emergencyUser.id,
      route: req.originalUrl,
      method: 'POST',
      ipAddress: req.ip,
      changes: { deactivatedAt: new Date().toISOString() },
    });
  }

  logger.warn("Emergency account deactivated");
  res.json({ message: "Emergency account deactivated." });
});

// GET /api/super-admin/feature-flags (public endpoint for non-super-admin to read enabled states)
// This is mounted separately in index.ts
export const featureFlagsPublicRouter: IRouter = Router();

featureFlagsPublicRouter.get("/feature-flags", authMiddleware, async (req, res): Promise<void> => {
  const tenantId = req.user?.tenantId;

  // Return all modules with effective enabled state (tenant override → global default)
  const globalFlags = await db
    .select({ module: featureFlagsTable.module, enabled: featureFlagsTable.enabled })
    .from(featureFlagsTable);
  const globalMap = new Map(globalFlags.map((f) => [f.module, f.enabled]));

  if (tenantId) {
    const tenantOverrides = await db
      .select({ module: tenantFeatureFlagsTable.module, enabled: tenantFeatureFlagsTable.enabled })
      .from(tenantFeatureFlagsTable)
      .where(eq(tenantFeatureFlagsTable.tenantId, tenantId));
    const overrideMap = new Map(tenantOverrides.map((f) => [f.module, f.enabled]));

    const result = globalFlags.map((f) => ({
      module: f.module,
      enabled: overrideMap.has(f.module) ? overrideMap.get(f.module)! : f.enabled,
    }));
    res.json(result);
    return;
  }

  res.json(globalFlags);
});

export default router;
