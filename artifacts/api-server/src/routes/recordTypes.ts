import { Router, type IRouter } from "express";
import { db, recordTypeConfigsTable } from "@workspace/db";
import { and, eq, desc, sql, or } from "drizzle-orm";
import { authMiddleware, denyDevRoles } from "../lib/auth";
import { auditMiddleware } from "../lib/audit";
import { generateId } from "../lib/id";
import { logger } from "../lib/logger";

const rct = recordTypeConfigsTable as any;

const router: IRouter = Router();

const adminOnly = (req: any, res: any, next: any) => {
  if (req.user?.role !== "ADMIN" && req.user?.role !== "SUPER_ADMIN") {
    res.status(403).json({ error: "Admin only" });
    return;
  }
  next();
};

// Get all record type configurations for a tenant
router.get("/admin/record-types", authMiddleware, denyDevRoles, adminOnly, async (req, res): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId;
    const { entityType, activeOnly } = req.query;

    const whereClause = tenantId ? eq(rct.tenantId, tenantId) : undefined;
    const entityClause = entityType ? eq(rct.entityType, entityType as string) : undefined;
    const activeClause = activeOnly === "true" ? eq(rct.isActive, true) : undefined;
    
    const conditions = [whereClause, entityClause, activeClause].filter(Boolean);
    const finalCondition = conditions.length > 0 ? and(...conditions) : undefined;

    const configs = await db
      .select()
      .from(rct)
      .where(finalCondition)
      .orderBy(rct.entityType, rct.sortOrder, rct.recordType);

    res.json(configs);
  } catch (error) {
    logger.error({ error }, "Error fetching record type configs");
    res.status(500).json({ error: "Failed to fetch record type configurations" });
  }
});

// Get record type configuration by ID
router.get("/admin/record-types/:id", authMiddleware, denyDevRoles, adminOnly, async (req, res): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const [config] = await db
      .select()
      .from(rct)
      .where(
        and(
          eq(rct.tenantId, tenantId),
          eq(rct.id, id)
        )
      )
      .limit(1);

    if (!config) {
      res.status(404).json({ error: "Record type configuration not found" });
      return;
    }

    res.json(config);
  } catch (error) {
    logger.error({ error }, "Error fetching record type config");
    res.status(500).json({ error: "Failed to fetch record type configuration" });
  }
});

// Create record type configuration
router.post("/admin/record-types", authMiddleware, denyDevRoles, adminOnly, auditMiddleware("record_type.create"), async (req, res): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const {
      entityType,
      recordType,
      displayName,
      description,
      icon,
      color,
      isDefault,
      isActive,
      sortOrder,
      allowedTransitions,
      validationRules,
      workflowRules,
      metadata
    } = req.body;

    if (!entityType || !recordType || !displayName) {
      res.status(400).json({ error: "entityType, recordType, and displayName are required" });
      return;
    }

    // Check if record type already exists for this tenant and entity
    const existing = await db
      .select()
      .from(rct)
      .where(
        and(
          eq(rct.tenantId, tenantId),
          eq(rct.entityType, entityType),
          eq(rct.recordType, recordType)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      res.status(409).json({ error: "Record type already exists for this tenant and entity" });
      return;
    }

    // If setting as default, unset any existing default for this entity
    if (isDefault === true) {
      await db
        .update(rct)
        .set({ isDefault: false })
        .where(
          and(
            eq(rct.tenantId, tenantId),
            eq(rct.entityType, entityType),
            eq(rct.isDefault, true)
          )
        );
    }

    const now = new Date();
    const configData: any = {
      id: generateId("rtype"),
      tenantId,
      entityType,
      recordType,
      displayName,
      description: description || null,
      icon: icon || null,
      color: color || null,
      isDefault: isDefault !== undefined ? isDefault : false,
      isActive: isActive !== undefined ? isActive : true,
      sortOrder: sortOrder !== undefined ? sortOrder : 0,
      allowedTransitions: allowedTransitions || null,
      validationRules: validationRules || null,
      workflowRules: workflowRules || null,
      metadata: metadata || null,
      createdAt: now,
      updatedAt: now,
      updatedBy: userId,
    };

    const [created] = (await db
      .insert(rct)
      .values(configData)
      .returning()) as any[];

    res.status(201).json(created);
  } catch (error) {
    logger.error({ error }, "Error creating record type config");
    res.status(500).json({ error: "Failed to create record type configuration" });
  }
});

// Update record type configuration
router.put("/admin/record-types/:id", authMiddleware, denyDevRoles, adminOnly, auditMiddleware("record_type.update"), async (req, res): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const { id } = req.params;
    const {
      displayName,
      description,
      icon,
      color,
      isDefault,
      isActive,
      sortOrder,
      allowedTransitions,
      validationRules,
      workflowRules,
      metadata
    } = req.body;

    // Check if config exists and belongs to tenant
    const [existing] = await db
      .select()
      .from(rct)
      .where(
        and(
          eq(rct.tenantId, tenantId),
          eq(rct.id, id)
        )
      )
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: "Record type configuration not found" });
      return;
    }

    // If setting as default, unset any existing default for this entity
    if (isDefault === true && existing.isDefault === false) {
      await db
        .update(rct)
        .set({ isDefault: false })
        .where(
          and(
            eq(rct.tenantId, tenantId),
            eq(rct.entityType, existing.entityType),
            eq(rct.isDefault, true),
            eq(rct.id, id)
          )
        );
    }

    const updateData: any = {
      updatedAt: new Date(),
      updatedBy: userId,
    };

    // Update only provided fields
    if (displayName !== undefined) updateData.displayName = displayName;
    if (description !== undefined) updateData.description = description;
    if (icon !== undefined) updateData.icon = icon;
    if (color !== undefined) updateData.color = color;
    if (isDefault !== undefined) updateData.isDefault = isDefault;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
    if (allowedTransitions !== undefined) updateData.allowedTransitions = allowedTransitions;
    if (validationRules !== undefined) updateData.validationRules = validationRules;
    if (workflowRules !== undefined) updateData.workflowRules = workflowRules;
    if (metadata !== undefined) updateData.metadata = metadata;

    const [updated] = await db
      .update(rct)
      .set(updateData)
      .where(
        and(
          eq(rct.tenantId, tenantId),
          eq(rct.id, id)
        )
      )
      .returning();

    res.json(updated);
  } catch (error) {
    logger.error({ error }, "Error updating record type config");
    res.status(500).json({ error: "Failed to update record type configuration" });
  }
});

// Delete record type configuration
router.delete("/admin/record-types/:id", authMiddleware, denyDevRoles, adminOnly, auditMiddleware("record_type.delete"), async (req, res): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    // Check if this is a default type
    const [config] = await db
      .select()
      .from(rct)
      .where(
        and(
          eq(rct.tenantId, tenantId),
          eq(rct.id, id)
        )
      )
      .limit(1);

    if (!config) {
      res.status(404).json({ error: "Record type configuration not found" });
      return;
    }

    // Don't allow deletion of default type unless there are other types
    if (config.isDefault) {
      const otherTypes = await db
        .select()
        .from(rct)
        .where(
          and(
            eq(rct.tenantId, tenantId),
            eq(rct.entityType, config.entityType),
            eq(rct.id, id)
          )
        )
        .limit(2);

      if (otherTypes.length <= 1) {
        res.status(400).json({ error: "Cannot delete the only record type for this entity" });
        return;
      }
    }

    const [deleted] = (await db
      .delete(rct)
      .where(
        and(
          eq(rct.tenantId, tenantId),
          eq(rct.id, id)
        )
      )
      .returning()) as any[];

    // If deleted type was default, set another type as default
    if (deleted && deleted.isDefault) {
      const [newDefault] = await db
        .select()
        .from(rct)
        .where(
          and(
            eq(rct.tenantId, tenantId),
            eq(rct.entityType, deleted.entityType)
          )
        )
        .orderBy(rct.sortOrder)
        .limit(1);

      if (newDefault) {
        await db
          .update(rct)
          .set({ isDefault: true })
          .where(eq(rct.id, newDefault.id));
      }
    }

    res.json({ success: true, message: "Record type configuration deleted" });
  } catch (error) {
    logger.error({ error }, "Error deleting record type config");
    res.status(500).json({ error: "Failed to delete record type configuration" });
  }
});

// Get active record types for current user (filtered by entity)
router.get("/record-types/:entityType", authMiddleware, denyDevRoles, async (req, res): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId;
    const { entityType } = req.params;

    const types = await db
      .select({
        id: rct.id,
        recordType: rct.recordType,
        displayName: rct.displayName,
        description: rct.description,
        icon: rct.icon,
        color: rct.color,
        isDefault: rct.isDefault,
        validationRules: rct.validationRules,
        metadata: rct.metadata,
      })
      .from(rct)
      .where(
        and(
          eq(rct.tenantId, tenantId),
          eq(rct.entityType, entityType),
          eq(rct.isActive, true)
        )
      )
      .orderBy(rct.sortOrder, rct.displayName);

    res.json(types);
  } catch (error) {
    logger.error({ error }, "Error fetching record types for user");
    res.status(500).json({ error: "Failed to fetch record types" });
  }
});

// Get default record type for entity
router.get("/record-types/:entityType/default", authMiddleware, denyDevRoles, async (req, res): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId;
    const { entityType } = req.params;

    const [defaultType] = await db
      .select({
        id: rct.id,
        recordType: rct.recordType,
        displayName: rct.displayName,
        description: rct.description,
        icon: rct.icon,
        color: rct.color,
        validationRules: rct.validationRules,
        metadata: rct.metadata,
      })
      .from(rct)
      .where(
        and(
          eq(rct.tenantId, tenantId),
          eq(rct.entityType, entityType),
          eq(rct.isDefault, true),
          eq(rct.isActive, true)
        )
      )
      .limit(1);

    if (!defaultType) {
      // Fall back to first active type if no default set
      const [firstType] = await db
        .select({
          id: rct.id,
          recordType: rct.recordType,
          displayName: rct.displayName,
          description: rct.description,
          icon: rct.icon,
          color: rct.color,
          validationRules: rct.validationRules,
          metadata: rct.metadata,
        })
        .from(rct)
        .where(
          and(
            eq(rct.tenantId, tenantId),
            eq(rct.entityType, entityType),
            eq(rct.isActive, true)
          )
        )
        .orderBy(rct.sortOrder)
        .limit(1);

      if (!firstType) {
        res.status(404).json({ error: "No record types found for this entity" });
        return;
      }

      res.json(firstType);
      return;
    }

    res.json(defaultType);
  } catch (error) {
    logger.error({ error }, "Error fetching default record type");
    res.status(500).json({ error: "Failed to fetch default record type" });
  }
});

export default router;