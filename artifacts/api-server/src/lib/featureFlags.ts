import { Request, Response, NextFunction } from "express";
import { db, featureFlagsTable, tenantFeatureFlagsTable, getModuleDefinition, MODULE_DEFINITIONS, validateModuleDependencies, validateModuleDependents } from "@workspace/db";
import { and, eq } from "drizzle-orm";

interface CacheEntry {
  enabled: boolean;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 60_000; // 1 minute

async function isModuleEnabled(module: string, tenantId?: string): Promise<boolean> {
  const cacheKey = `${tenantId}:${module}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.enabled;
  }

  if (tenantId) {
    // Check for a tenant override row first
    const [tenantFlag] = await db
      .select({ enabled: tenantFeatureFlagsTable.enabled })
      .from(tenantFeatureFlagsTable)
      .where(and(eq(tenantFeatureFlagsTable.tenantId, tenantId), eq(tenantFeatureFlagsTable.module, module)));

    if (tenantFlag !== undefined) {
      cache.set(cacheKey, { enabled: tenantFlag.enabled, fetchedAt: Date.now() });
      return tenantFlag.enabled;
    }
    // No override row — fall through to global default
  }

  const [globalFlag] = await db
    .select({ enabled: featureFlagsTable.enabled })
    .from(featureFlagsTable)
    .where(eq(featureFlagsTable.module, module));

  const enabled = globalFlag ? globalFlag.enabled : false;
  cache.set(cacheKey, { enabled, fetchedAt: Date.now() });
  return enabled;
}

export function invalidateModuleCache(module?: string) {
  if (module) {
    for (const key of cache.keys()) {
      if (key.endsWith(`:${module}`)) {
        cache.delete(key);
      }
    }
  } else {
    cache.clear();
  }
}

/** Compute effective enabled module keys for a tenant: override rows + global fallback */
async function getEffectiveEnabledModuleKeys(tenantId: string): Promise<string[]> {
  const [globalFlags, tenantOverrides] = await Promise.all([
    db.select({ module: featureFlagsTable.module, enabled: featureFlagsTable.enabled }).from(featureFlagsTable),
    db.select({ module: tenantFeatureFlagsTable.module, enabled: tenantFeatureFlagsTable.enabled })
      .from(tenantFeatureFlagsTable)
      .where(eq(tenantFeatureFlagsTable.tenantId, tenantId)),
  ]);

  const globalMap = new Map(globalFlags.map((f) => [f.module, f.enabled]));
  const overrideMap = new Map(tenantOverrides.map((f) => [f.module, f.enabled]));

  return MODULE_DEFINITIONS
    .filter((def) => {
      const override = overrideMap.get(def.key);
      return override !== undefined ? override : (globalMap.get(def.key) ?? def.defaultEnabled ?? false);
    })
    .map((def) => def.key);
}

/**
 * Check if a module can be enabled for a tenant
 */
export async function canEnableModule(module: string, tenantId: string): Promise<{ canEnable: boolean; missingDependencies: string[]; conflicts: string[] }> {
  const moduleDef = getModuleDefinition(module);
  if (!moduleDef) {
    return { canEnable: false, missingDependencies: [], conflicts: [] };
  }

  const enabledModuleKeys = await getEffectiveEnabledModuleKeys(tenantId);
  const missingDeps = validateModuleDependencies(module, enabledModuleKeys);

  const conflicts: string[] = [];
  if (moduleDef.conflicts) {
    for (const conflict of moduleDef.conflicts) {
      if (enabledModuleKeys.includes(conflict)) {
        conflicts.push(conflict);
      }
    }
  }

  const canEnable = missingDeps.length === 0 && conflicts.length === 0;
  return { canEnable, missingDependencies: missingDeps, conflicts };
}

/**
 * Check if a module can be disabled for a tenant
 */
export async function canDisableModule(module: string, tenantId: string): Promise<{ canDisable: boolean; dependents: string[] }> {
  const enabledModuleKeys = await getEffectiveEnabledModuleKeys(tenantId);
  const dependents = validateModuleDependents(module, enabledModuleKeys);
  const moduleDef = getModuleDefinition(module);
  const isRequired = moduleDef?.required || false;
  const canDisable = dependents.length === 0 && !isRequired;
  return { canDisable, dependents };
}

/**
 * Get all modules for a tenant with dependency information, using effective state
 */
export async function getTenantModulesWithDependencies(tenantId: string): Promise<Array<{
  module: string;
  enabled: boolean;
  canDisable: boolean;
  dependents: string[];
  missingDependencies: string[];
}>> {
  const [globalFlags, tenantOverrides] = await Promise.all([
    db.select({ module: featureFlagsTable.module, enabled: featureFlagsTable.enabled }).from(featureFlagsTable),
    db.select({ module: tenantFeatureFlagsTable.module, enabled: tenantFeatureFlagsTable.enabled })
      .from(tenantFeatureFlagsTable)
      .where(eq(tenantFeatureFlagsTable.tenantId, tenantId)),
  ]);

  const globalMap = new Map(globalFlags.map((f) => [f.module, f.enabled]));
  const overrideMap = new Map(tenantOverrides.map((f) => [f.module, f.enabled]));

  const effectiveState = MODULE_DEFINITIONS.map((def) => {
    const override = overrideMap.get(def.key);
    const enabled = override !== undefined ? override : (globalMap.get(def.key) ?? def.defaultEnabled ?? false);
    return { module: def.key, enabled };
  });

  const enabledModules = effectiveState.filter((m) => m.enabled).map((m) => m.module);

  return effectiveState.map(({ module, enabled }) => {
    const dependents = validateModuleDependents(module, enabledModules);
    const missingDeps = enabled ? [] : validateModuleDependencies(module, enabledModules);
    const moduleDef = getModuleDefinition(module);
    const canDisable = dependents.length === 0 && !(moduleDef?.required || false);
    return { module, enabled, canDisable, dependents, missingDependencies: missingDeps };
  });
}

export function checkModuleEnabled(module: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // SUPER_ADMIN always bypasses feature flag checks
    if (req.user?.role === "SUPER_ADMIN") {
      next();
      return;
    }

    const enabled = await isModuleEnabled(module, req.user?.tenantId ?? undefined);
    if (!enabled) {
      res.status(403).json({ error: "This module is currently disabled" });
      return;
    }
    next();
  };
}
