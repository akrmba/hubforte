import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import { db, tenantsTable, tenantFeatureFlagsTable, featureFlagsTable, usersTable, tenantAiConfigTable, getModuleDefinition, MODULE_DEFINITIONS, validateModuleDependencies, validateModuleDependents } from "@workspace/db";
import bcryptjs from "bcryptjs";
import { count, desc, eq, sql } from "drizzle-orm";
import { authMiddleware } from "../lib/auth";
import { auditMiddleware, writeAuditLog } from "../lib/audit";
import { generateId } from "../lib/id";
import { invalidateModuleCache } from "../lib/featureFlags";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type TenantRecord = typeof tenantsTable.$inferSelect;
type TenantSummary = {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  status: string;
  active: boolean;
  suspended: boolean;
  createdAt: Date;
  updatedAt: Date;
  userCount: number;
  enabledModuleCount: number;
};
type ProvisionedAdminUser = {
  id: string;
  email: string | null;
  name: string | null;
  role: "SUPER_ADMIN" | "ADMIN" | "MANAGER" | "OPERATOR" | "VIEWER" | "DEVELOPER" | "PLATFORM_BUILDER";
  active: boolean;
  tenantId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const tenantSummarySelection = {
  id: tenantsTable.id,
  name: tenantsTable.name,
  slug: tenantsTable.slug,
  domain: tenantsTable.domain,
  status: tenantsTable.status,
  active: tenantsTable.active,
  suspended: tenantsTable.suspended,
  createdAt: tenantsTable.createdAt,
  updatedAt: tenantsTable.updatedAt,
  userCount: sql<number>`(
    SELECT COUNT(*)
    FROM ${usersTable}
    WHERE ${usersTable.tenantId} = ${tenantsTable.id}
  )`.mapWith(Number),
  enabledModuleCount: sql<number>`(
    SELECT COUNT(*)
    FROM ${featureFlagsTable} gf
    WHERE (
      SELECT COALESCE(
        (SELECT tf.enabled FROM ${tenantFeatureFlagsTable} tf
         WHERE tf.tenant_id = ${tenantsTable.id} AND tf.module = gf.module
         LIMIT 1),
        gf.enabled
      )
    ) = true
  )`.mapWith(Number),
};
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function superAdminOnly(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.role !== "SUPER_ADMIN") {
    res.status(403).json({ error: "Super Admin only" });
    return;
  }

  next();
}

function normaliseRequiredString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normaliseOptionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normaliseEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  return EMAIL_PATTERN.test(trimmed) ? trimmed : null;
}

async function getTenantById(id: string): Promise<TenantRecord | null> {
  const [tenant] = await db
    .select()
    .from(tenantsTable)
    .where(eq(tenantsTable.id, id));

  return tenant ?? null;
}

async function getTenantSummaryById(id: string): Promise<TenantSummary | null> {
  const [tenant] = await db
    .select(tenantSummarySelection)
    .from(tenantsTable)
    .where(eq(tenantsTable.id, id));

  return tenant ?? null;
}

router.use(authMiddleware, superAdminOnly);

// GET /api/super-admin/tenants
router.get("/", async (_req, res): Promise<void> => {
  const tenants = await db
    .select(tenantSummarySelection)
    .from(tenantsTable)
    .orderBy(desc(tenantsTable.createdAt));

  res.json(tenants);
});

// POST /api/super-admin/tenants
router.post("/", async (req, res): Promise<void> => {
  const name = normaliseRequiredString(req.body?.name);
  const slug = normaliseRequiredString(req.body?.slug);
  const domain = normaliseOptionalString(req.body?.domain);
  const hasAnyAdminFields = ["adminEmail", "adminFirstName", "adminLastName", "adminPassword"].some((field) =>
    Object.prototype.hasOwnProperty.call(req.body ?? {}, field),
  );
  const adminEmail = hasAnyAdminFields ? normaliseEmail(req.body?.adminEmail) : null;
  const adminFirstName = hasAnyAdminFields ? normaliseRequiredString(req.body?.adminFirstName) : null;
  const adminLastName = hasAnyAdminFields ? normaliseRequiredString(req.body?.adminLastName) : null;
  const adminPassword = hasAnyAdminFields && typeof req.body?.adminPassword === "string" ? req.body.adminPassword : null;

  if (!name || !slug) {
    res.status(400).json({ error: "name and slug are required" });
    return;
  }

  if (!SLUG_PATTERN.test(slug)) {
    res.status(400).json({ error: "slug must contain only lowercase letters, numbers, and hyphens" });
    return;
  }

  if (req.body?.domain !== undefined && domain === undefined) {
    res.status(400).json({ error: "domain must be a string or null" });
    return;
  }

  if (hasAnyAdminFields) {
    if (!adminEmail || !adminFirstName || !adminLastName || !adminPassword) {
      res.status(400).json({ error: "adminEmail, adminFirstName, adminLastName, and adminPassword are all required when provisioning an admin user" });
      return;
    }

    if (adminPassword.length < 8) {
      res.status(400).json({ error: "adminPassword must be at least 8 characters" });
      return;
    }
  }

  const [existingTenant] = await db
    .select({ id: tenantsTable.id })
    .from(tenantsTable)
    .where(eq(tenantsTable.slug, slug));

  if (existingTenant) {
    res.status(409).json({ error: "A tenant with this slug already exists" });
    return;
  }

  if (adminEmail) {
    const [existingUser] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, adminEmail));

    if (existingUser) {
      res.status(409).json({ error: "A user with that admin email already exists" });
      return;
    }
  }

  const createdRecord = await db.transaction(async (tx) => {
    const [tenant] = await tx
      .insert(tenantsTable)
      .values({
        id: generateId("tenant"),
        name,
        slug,
        domain: domain ?? null,
        status: "active",
        active: true,
        suspended: false,
        updatedAt: new Date(),
      })
      .returning();

    let adminUser: ProvisionedAdminUser | null = null;
    if (adminEmail && adminFirstName && adminLastName && adminPassword) {
      const passwordHash = await bcryptjs.hash(adminPassword, 12);
      const [createdAdmin] = await tx
        .insert(usersTable)
        .values({
          id: generateId("usr"),
          email: adminEmail,
          name: `${adminFirstName} ${adminLastName}`.trim(),
          passwordHash,
          role: "ADMIN",
          active: true,
          tenantId: tenant.id,
        })
        .returning({
          id: usersTable.id,
          email: usersTable.email,
          name: usersTable.name,
          role: usersTable.role,
          active: usersTable.active,
          tenantId: usersTable.tenantId,
          createdAt: usersTable.createdAt,
          updatedAt: usersTable.updatedAt,
        });

      adminUser = createdAdmin;
    }

    return { tenant, adminUser };
  });

  const tenant = await getTenantSummaryById(createdRecord.tenant.id);
  if (!tenant) {
    res.status(500).json({ error: "Tenant created but could not be reloaded" });
    return;
  }

  void writeAuditLog({
    userId: req.user!.id,
    userRole: req.user!.role,
    tenantId: req.user!.role === "SUPER_ADMIN" ? null : req.user!.tenantId ?? null,
    action: "CREATE",
    entityType: "tenant",
    entityId: tenant.id,
    route: req.originalUrl,
    method: req.method,
    changes: {
      name: tenant.name,
      slug: tenant.slug,
      domain: tenant.domain,
      status: tenant.status,
      adminEmail: createdRecord.adminUser?.email ?? null,
      adminProvisioned: !!createdRecord.adminUser,
    },
    ipAddress: (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown",
  });

  res.status(201).json({
    tenant,
    adminUser: createdRecord.adminUser,
  });
});

// PATCH /api/super-admin/tenants/:id
router.patch("/:id", auditMiddleware("tenant"), async (req, res): Promise<void> => {
  const tenantId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const existingTenant = await getTenantById(tenantId);

  if (!existingTenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  const updates: Partial<typeof tenantsTable.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "name")) {
    const name = normaliseRequiredString(req.body?.name);
    if (!name) {
      res.status(400).json({ error: "name must be a non-empty string" });
      return;
    }
    updates.name = name;
  }

  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "slug")) {
    const slug = normaliseRequiredString(req.body?.slug);
    if (!slug || !SLUG_PATTERN.test(slug)) {
      res.status(400).json({ error: "slug must contain only lowercase letters, numbers, and hyphens" });
      return;
    }

    const [slugOwner] = await db
      .select({ id: tenantsTable.id })
      .from(tenantsTable)
      .where(eq(tenantsTable.slug, slug));

    if (slugOwner && slugOwner.id !== tenantId) {
      res.status(409).json({ error: "A tenant with this slug already exists" });
      return;
    }

    updates.slug = slug;
  }

  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "domain")) {
    const domain = normaliseOptionalString(req.body?.domain);
    if (req.body?.domain !== null && domain === undefined) {
      res.status(400).json({ error: "domain must be a string or null" });
      return;
    }
    updates.domain = domain ?? null;
  }

  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "active")) {
    if (typeof req.body?.active !== "boolean") {
      res.status(400).json({ error: "active must be a boolean" });
      return;
    }
    updates.active = req.body.active;
  }

  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "suspended")) {
    if (typeof req.body?.suspended !== "boolean") {
      res.status(400).json({ error: "suspended must be a boolean" });
      return;
    }
    updates.suspended = req.body.suspended;
    updates.status = req.body.suspended ? "suspended" : "active";
  }

  if (Object.keys(updates).length === 1) {
    res.status(400).json({ error: "No valid tenant fields provided" });
    return;
  }

  await db
    .update(tenantsTable)
    .set(updates)
    .where(eq(tenantsTable.id, tenantId))
    .returning({ id: tenantsTable.id });

  if (updates.suspended === true) {
    logger.warn({
      event: "tenant_suspended",
      tenantId,
      actorUserId: req.user!.id,
    }, "Tenant suspended");
  }

  const updatedTenant = await getTenantSummaryById(tenantId);
  if (!updatedTenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  res.json(updatedTenant);
});

// PATCH /api/super-admin/tenants/:id/status
router.patch("/:id/status", auditMiddleware("tenant"), async (req, res): Promise<void> => {
  const tenantId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const existingTenant = await getTenantById(tenantId);

  if (!existingTenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  const status = req.body?.status;
  if (status !== "active" && status !== "suspended") {
    res.status(400).json({ error: "status must be 'active' or 'suspended'" });
    return;
  }

  await db
    .update(tenantsTable)
    .set({
      status,
      suspended: status === "suspended",
      updatedAt: new Date(),
    })
    .where(eq(tenantsTable.id, tenantId));

  if (status === "suspended") {
    logger.warn({
      event: "tenant_suspended",
      tenantId,
      actorUserId: req.user!.id,
    }, "Tenant suspended");
  } else {
    logger.info({
      event: "tenant_reactivated",
      tenantId,
      actorUserId: req.user!.id,
    }, "Tenant reactivated");
  }

  const updatedTenant = await getTenantSummaryById(tenantId);
  if (!updatedTenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  res.json(updatedTenant);
});

// GET /api/super-admin/tenants/:id/feature-flags
router.get("/:id/feature-flags", async (req, res): Promise<void> => {
  const tenantId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const existingTenant = await getTenantById(tenantId);

  if (!existingTenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  const flags = await db
    .select({
      module: tenantFeatureFlagsTable.module,
      enabled: tenantFeatureFlagsTable.enabled,
      updatedAt: tenantFeatureFlagsTable.updatedAt,
      updatedBy: tenantFeatureFlagsTable.updatedBy,
    })
    .from(tenantFeatureFlagsTable)
    .where(eq(tenantFeatureFlagsTable.tenantId, tenantId))
    .orderBy(tenantFeatureFlagsTable.module);

  res.json(flags);
});

// PATCH /api/super-admin/tenants/:id/feature-flags/:module
router.patch("/:id/feature-flags/:module", auditMiddleware("tenant_feature_flag"), async (req, res): Promise<void> => {
  const tenantId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const moduleName = Array.isArray(req.params.module) ? req.params.module[0] : req.params.module;
  const enabled = req.body?.enabled;

  if (typeof enabled !== "boolean") {
    res.status(400).json({ error: "enabled must be a boolean" });
    return;
  }

  const existingTenant = await getTenantById(tenantId);
  if (!existingTenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  // Get current enabled modules for this tenant
  const enabledModules = await db
    .select({ module: tenantFeatureFlagsTable.module })
    .from(tenantFeatureFlagsTable)
    .where(
      sql`${tenantFeatureFlagsTable.tenantId} = ${tenantId} AND ${tenantFeatureFlagsTable.enabled} = true`
    );

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

  const [updatedFlag] = await db
    .update(tenantFeatureFlagsTable)
    .set({
      enabled: enabled,
      updatedAt: new Date(),
      updatedBy: req.user!.id,
    })
    .where(sql`${tenantFeatureFlagsTable.tenantId} = ${tenantId} AND ${tenantFeatureFlagsTable.module} = ${moduleName}`)
    .returning();

  if (!updatedFlag) {
    res.status(404).json({ error: "Tenant feature flag not found" });
    return;
  }

  invalidateModuleCache(moduleName);
  res.json(updatedFlag);
});

// GET /api/super-admin/tenants/:id/modules
// Returns modules with isOverride and defaultValue fields
router.get("/:id/modules", async (req, res): Promise<void> => {
  const tenantId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const existingTenant = await getTenantById(tenantId);

  if (!existingTenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  const tenantFlags = await db
    .select({
      module: tenantFeatureFlagsTable.module,
      enabled: tenantFeatureFlagsTable.enabled,
      updatedAt: tenantFeatureFlagsTable.updatedAt,
      updatedBy: tenantFeatureFlagsTable.updatedBy,
    })
    .from(tenantFeatureFlagsTable)
    .where(eq(tenantFeatureFlagsTable.tenantId, tenantId))
    .orderBy(tenantFeatureFlagsTable.module);

  const globalFlags = await db
    .select({ module: featureFlagsTable.module, enabled: featureFlagsTable.enabled })
    .from(featureFlagsTable);

  const globalMap = new Map(globalFlags.map((f) => [f.module, f.enabled]));
  const tenantMap = new Map(tenantFlags.map((f) => [f.module, f]));

  // Return ALL modules from the registry, overlaid with tenant overrides
  const result = MODULE_DEFINITIONS.map((def) => {
    const tenantRow = tenantMap.get(def.key);
    const globalDefault = globalMap.get(def.key) ?? def.defaultEnabled;
    const effectiveEnabled = tenantRow !== undefined ? tenantRow.enabled : globalDefault;
    return {
      key: def.key,
      enabled: effectiveEnabled,
      isOverride: tenantRow !== undefined,
      defaultValue: globalDefault,
      updatedAt: tenantRow?.updatedAt ?? null,
      updatedBy: tenantRow?.updatedBy ?? null,
    };
  });

  res.json(result);
});

// PATCH /api/super-admin/tenants/:id/modules/:moduleKey
router.patch("/:id/modules/:moduleKey", auditMiddleware("tenant_feature_flag"), async (req, res): Promise<void> => {
  const tenantId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const moduleName = Array.isArray(req.params.moduleKey) ? req.params.moduleKey[0] : req.params.moduleKey;
  const { enabled } = req.body;

  if (typeof enabled !== "boolean") {
    res.status(400).json({ error: "enabled must be a boolean" });
    return;
  }

  const existingTenant = await getTenantById(tenantId);
  if (!existingTenant) {
    res.status(404).json({ error: "Tenant not found" });
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

  // Get currently enabled modules for this tenant (override rows + global fallback)
  const globalFlags = await db
    .select({ module: featureFlagsTable.module, enabled: featureFlagsTable.enabled })
    .from(featureFlagsTable);
  const globalMap = new Map(globalFlags.map((f) => [f.module, f.enabled]));

  const tenantOverrides = await db
    .select({ module: tenantFeatureFlagsTable.module, enabled: tenantFeatureFlagsTable.enabled })
    .from(tenantFeatureFlagsTable)
    .where(eq(tenantFeatureFlagsTable.tenantId, tenantId));
  const tenantOverrideMap = new Map(tenantOverrides.map((f) => [f.module, f.enabled]));

  const enabledModuleKeys = MODULE_DEFINITIONS
    .filter((def) => {
      const override = tenantOverrideMap.get(def.key);
      return override !== undefined ? override : (globalMap.get(def.key) ?? def.defaultEnabled ?? false);
    })
    .map((def) => def.key);

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

  // If the requested value matches the global default, delete any override row (inherit global)
  // Only keep an override row when the tenant truly differs from the global default
  const globalDefault = globalMap.get(moduleName) ?? moduleDef.defaultEnabled ?? false;

  if (enabled === globalDefault) {
    await db
      .delete(tenantFeatureFlagsTable)
      .where(
        sql`${tenantFeatureFlagsTable.tenantId} = ${tenantId} AND ${tenantFeatureFlagsTable.module} = ${moduleName}`
      );
  } else {
    await db
      .insert(tenantFeatureFlagsTable)
      .values({
        id: generateId("tff"),
        tenantId,
        module: moduleName,
        enabled,
        updatedAt: new Date(),
        updatedBy: req.user!.id,
      })
      .onConflictDoUpdate({
        target: [tenantFeatureFlagsTable.tenantId, tenantFeatureFlagsTable.module],
        set: { enabled, updatedAt: new Date(), updatedBy: req.user!.id },
      });
  }

  invalidateModuleCache(moduleName);
  res.json({ key: moduleName, enabled });
});

// GET /api/super-admin/tenants/:id/ai-settings
router.get("/:id/ai-settings", async (req, res): Promise<void> => {
  const tenantId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const tenant = await getTenantById(tenantId);

  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  res.json({
    byokEnabled: tenant.byokEnabled,
    aiDiagnosisEnabled: tenant.aiDiagnosisEnabled,
  });
});

// PATCH /api/super-admin/tenants/:id/ai-settings
router.patch("/:id/ai-settings", async (req, res): Promise<void> => {
  const tenantId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const tenant = await getTenantById(tenantId);

  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  const updates: Partial<typeof tenantsTable.$inferInsert> = { updatedAt: new Date() };
  const auditChanges: Record<string, { old: unknown; new: unknown }> = {};

  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "byokEnabled")) {
    if (typeof req.body.byokEnabled !== "boolean") {
      res.status(400).json({ error: "byokEnabled must be a boolean" });
      return;
    }
    auditChanges.byokEnabled = { old: tenant.byokEnabled, new: req.body.byokEnabled };
    updates.byokEnabled = req.body.byokEnabled;
  }

  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "aiDiagnosisEnabled")) {
    if (typeof req.body.aiDiagnosisEnabled !== "boolean") {
      res.status(400).json({ error: "aiDiagnosisEnabled must be a boolean" });
      return;
    }
    auditChanges.aiDiagnosisEnabled = { old: tenant.aiDiagnosisEnabled, new: req.body.aiDiagnosisEnabled };
    updates.aiDiagnosisEnabled = req.body.aiDiagnosisEnabled;
  }

  if (Object.keys(updates).length === 1) {
    res.status(400).json({ error: "No valid AI settings fields provided" });
    return;
  }

  // If disabling BYOK, delete the stored config row entirely so no stale key remains
  if (updates.byokEnabled === false) {
    await db
      .delete(tenantAiConfigTable)
      .where(eq(tenantAiConfigTable.tenantId, tenantId));
  }

  await db.update(tenantsTable).set(updates).where(eq(tenantsTable.id, tenantId));

  void writeAuditLog({
    userId: req.user!.id,
    userRole: req.user!.role,
    // Preserve the target tenant context even for SUPER_ADMIN actions on this endpoint
    tenantId,
    action: "UPDATE",
    entityType: "tenant_ai_settings",
    entityId: tenantId,
    route: req.originalUrl,
    method: req.method,
    changes: auditChanges,
    ipAddress: (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown",
  });

  const updated = await getTenantById(tenantId);
  res.json({
    byokEnabled: updated!.byokEnabled,
    aiDiagnosisEnabled: updated!.aiDiagnosisEnabled,
  });
});

// POST /api/super-admin/tenants/:id/modules/reset
// Clears all tenant override rows so the tenant inherits global defaults
router.post("/:id/modules/reset", auditMiddleware("tenant_feature_flag"), async (req, res): Promise<void> => {
  const tenantId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const existingTenant = await getTenantById(tenantId);

  if (!existingTenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  const deleted = await db
    .delete(tenantFeatureFlagsTable)
    .where(eq(tenantFeatureFlagsTable.tenantId, tenantId))
    .returning({ module: tenantFeatureFlagsTable.module });

  invalidateModuleCache();
  logger.info({ tenantId, actorUserId: req.user!.id, cleared: deleted.length }, "Tenant module overrides cleared — inheriting global defaults");
  res.json({ reset: deleted.length });
});

export default router;
