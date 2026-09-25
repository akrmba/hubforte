import { Router, type IRouter } from "express";
import { db, tenantFieldVisibilityTable } from "@workspace/db";
import { and, eq, desc, sql } from "drizzle-orm";
import { authMiddleware, denyDevRoles } from "../lib/auth";
import { auditMiddleware } from "../lib/audit";
import { generateId } from "../lib/id";
import { logger } from "../lib/logger";

const fvt = tenantFieldVisibilityTable as any;

const router: IRouter = Router();

const adminOnly = (req: any, res: any, next: any) => {
  if (req.user?.role !== "ADMIN" && req.user?.role !== "SUPER_ADMIN") {
    res.status(403).json({ error: "Admin only" });
    return;
  }
  next();
};

// Get all field visibility configurations for a tenant
router.get("/admin/field-visibility", authMiddleware, denyDevRoles, adminOnly, async (req, res): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId;
    const { entityType } = req.query;

    const whereClause = tenantId ? eq(fvt.tenantId, tenantId) : undefined;
    const entityClause = entityType ? eq(fvt.entityType, entityType as string) : undefined;
    
    const conditions = [whereClause, entityClause].filter(Boolean);
    const finalCondition = conditions.length > 0 ? and(...conditions) : undefined;

    const configs = await db
      .select()
      .from(fvt)
      .where(finalCondition)
      .orderBy(fvt.entityType, fvt.fieldPath);

    res.json(configs);
  } catch (error) {
    logger.error({ error }, "Error fetching field visibility configs");
    res.status(500).json({ error: "Failed to fetch field visibility configurations" });
  }
});

// Get field visibility for a specific entity and field
router.get("/admin/field-visibility/:entityType/:fieldPath", authMiddleware, denyDevRoles, adminOnly, async (req, res): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId;
    const { entityType, fieldPath } = req.params;

    const config = await db
      .select()
      .from(fvt)
      .where(
        and(
          eq(fvt.tenantId, tenantId),
          eq(fvt.entityType, entityType),
          eq(fvt.fieldPath, fieldPath)
        )
      )
      .limit(1);

    if (config.length === 0) {
      res.status(404).json({ error: "Field visibility configuration not found" });
      return;
    }

    res.json(config[0]);
  } catch (error) {
    logger.error({ error }, "Error fetching field visibility config");
    res.status(500).json({ error: "Failed to fetch field visibility configuration" });
  }
});

// Create or update field visibility configuration
router.post("/admin/field-visibility", authMiddleware, denyDevRoles, adminOnly, auditMiddleware("field_visibility.update"), async (req, res): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const { entityType, fieldPath, visible, required, labelOverride, helpText, validationRules, displayOrder, visibleToRoles, editableByRoles } = req.body;

    if (!entityType || !fieldPath) {
      res.status(400).json({ error: "entityType and fieldPath are required" });
      return;
    }

    // Check if configuration already exists
    const existing = await db
      .select()
      .from(fvt)
      .where(
        and(
          eq(fvt.tenantId, tenantId),
          eq(fvt.entityType, entityType),
          eq(fvt.fieldPath, fieldPath)
        )
      )
      .limit(1);

    const now = new Date();
    const configData: any = {
      tenantId,
      entityType,
      fieldPath,
      visible: visible !== undefined ? visible : true,
      required: required !== undefined ? required : false,
      updatedAt: now,
      updatedBy: userId,
    };

    // Optional fields
    if (labelOverride !== undefined) configData.labelOverride = labelOverride;
    if (helpText !== undefined) configData.helpText = helpText;
    if (validationRules !== undefined) configData.validationRules = validationRules;
    if (displayOrder !== undefined) configData.displayOrder = displayOrder;
    if (visibleToRoles !== undefined) configData.visibleToRoles = visibleToRoles;
    if (editableByRoles !== undefined) configData.editableByRoles = editableByRoles;

    if (existing.length > 0) {
      // Update existing
      const [updated] = await db
        .update(fvt)
        .set(configData)
        .where(
          and(
            eq(fvt.tenantId, tenantId),
            eq(fvt.entityType, entityType),
            eq(fvt.fieldPath, fieldPath)
          )
        )
        .returning();

      res.json(updated);
    } else {
      // Create new
      configData.id = generateId("fvis");
      configData.createdAt = now;

      const [created] = (await db
        .insert(fvt)
        .values(configData)
        .returning()) as any[];

      res.status(201).json(created);
    }
  } catch (error) {
    logger.error({ error }, "Error saving field visibility config");
    res.status(500).json({ error: "Failed to save field visibility configuration" });
  }
});

// Batch update field visibility configurations
router.post("/admin/field-visibility/batch", authMiddleware, denyDevRoles, adminOnly, auditMiddleware("field_visibility.batch_update"), async (req, res): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const { updates } = req.body;

    if (!Array.isArray(updates)) {
      res.status(400).json({ error: "updates must be an array" });
      return;
    }

    const now = new Date();
    const results = [];

    for (const update of updates) {
      const { entityType, fieldPath, visible, required, labelOverride, helpText, validationRules, displayOrder, visibleToRoles, editableByRoles } = update;

      if (!entityType || !fieldPath) {
        results.push({ entityType, fieldPath, error: "entityType and fieldPath are required" });
        continue;
      }

      const configData: any = {
        tenantId,
        entityType,
        fieldPath,
        visible: visible !== undefined ? visible : true,
        required: required !== undefined ? required : false,
        updatedAt: now,
        updatedBy: userId,
      };

      // Optional fields
      if (labelOverride !== undefined) configData.labelOverride = labelOverride;
      if (helpText !== undefined) configData.helpText = helpText;
      if (validationRules !== undefined) configData.validationRules = validationRules;
      if (displayOrder !== undefined) configData.displayOrder = displayOrder;
      if (visibleToRoles !== undefined) configData.visibleToRoles = visibleToRoles;
      if (editableByRoles !== undefined) configData.editableByRoles = editableByRoles;

      try {
        // Check if exists
        const existing = await db
          .select()
          .from(fvt)
          .where(
            and(
              eq(fvt.tenantId, tenantId),
              eq(fvt.entityType, entityType),
              eq(fvt.fieldPath, fieldPath)
            )
          )
          .limit(1);

        if (existing.length > 0) {
          // Update
          const [updated] = await db
            .update(fvt)
            .set(configData)
            .where(
              and(
                eq(fvt.tenantId, tenantId),
                eq(fvt.entityType, entityType),
                eq(fvt.fieldPath, fieldPath)
              )
            )
            .returning();

          results.push({ entityType, fieldPath, success: true, data: updated });
        } else {
          // Create
          configData.id = generateId("fvis");
          configData.createdAt = now;

          const [created] = (await db
            .insert(fvt)
            .values(configData)
            .returning()) as any[];

          results.push({ entityType, fieldPath, success: true, data: created });
        }
      } catch (error) {
    logger.error({ entityType, fieldPath, error }, "Error in batch update for field");
        results.push({ entityType, fieldPath, error: "Failed to update" });
      }
    }

    res.json({ results });
  } catch (error) {
    logger.error({ error }, "Error in batch field visibility update");
    res.status(500).json({ error: "Failed to batch update field visibility configurations" });
  }
});

// Delete field visibility configuration
router.delete("/admin/field-visibility/:entityType/:fieldPath", authMiddleware, denyDevRoles, adminOnly, auditMiddleware("field_visibility.delete"), async (req, res): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId;
    const { entityType, fieldPath } = req.params;

    const [deleted] = (await db
      .delete(fvt)
      .where(
        and(
          eq(fvt.tenantId, tenantId),
          eq(fvt.entityType, entityType),
          eq(fvt.fieldPath, fieldPath)
        )
      )
      .returning()) as any[];

    if (!deleted) {
      res.status(404).json({ error: "Field visibility configuration not found" });
      return;
    }

    res.json({ success: true, message: "Field visibility configuration deleted" });
  } catch (error) {
    logger.error({ error }, "Error deleting field visibility config");
    res.status(500).json({ error: "Failed to delete field visibility configuration" });
  }
});

// Get field visibility for current user (filtered by role)
router.get("/field-visibility/:entityType", authMiddleware, denyDevRoles, async (req, res): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId;
    const userRole = req.user!.role;
    const { entityType } = req.params;

    // Get all configurations for this tenant and entity
    const allConfigs = await db
      .select()
      .from(fvt)
      .where(
        and(
          eq(fvt.tenantId, tenantId),
          eq(fvt.entityType, entityType)
        )
      )
      .orderBy(fvt.displayOrder, fvt.fieldPath);

    // Filter by user role
    const filteredConfigs = allConfigs.filter(config => {
      // Check visible_to_roles
      if (config.visibleToRoles && config.visibleToRoles.length > 0) {
        if (!config.visibleToRoles.includes(userRole)) {
          return false; // User role not in visible roles
        }
      }
      
      // If visible is false, don't show at all
      if (config.visible === false) {
        return false;
      }
      
      return true;
    });

    // Remove sensitive fields and add computed editable flag
    const result = filteredConfigs.map(config => {
      const { visibleToRoles, editableByRoles, updatedBy, ...rest } = config;
      
      // Compute if user can edit this field
      const canEdit = !editableByRoles || editableByRoles.length === 0 || editableByRoles.includes(userRole);
      
      return {
        ...rest,
        canEdit,
      };
    });

    res.json(result);
  } catch (error) {
    logger.error({ error }, "Error fetching field visibility for user");
    res.status(500).json({ error: "Failed to fetch field visibility" });
  }
});

export default router;