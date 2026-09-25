import { pgTable, text, boolean, timestamp, unique, jsonb, integer } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

export const recordTypeConfigsTable = pgTable("record_type_configs", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id),
  entityType: text("entity_type").notNull(), // e.g., "organizations", "contacts"
  recordType: text("record_type").notNull(), // e.g., "school", "college", "business", "parent", "guardian"
  displayName: text("display_name").notNull(), // User-friendly name
  description: text("description"),
  icon: text("icon"), // Icon name or URL
  color: text("color"), // CSS color for UI
  isDefault: boolean("is_default").notNull().default(false), // Default type for new records
  isActive: boolean("is_active").notNull().default(true), // Whether this type is active
  sortOrder: integer("sort_order").notNull().default(0), // Display order
  allowedTransitions: jsonb("allowed_transitions").$type<string[]>(), // Array of record_type values this can transition to
  validationRules: jsonb("validation_rules"), // Type-specific validation rules
  workflowRules: jsonb("workflow_rules"), // Type-specific workflow configuration
  metadata: jsonb("metadata"), // Additional type-specific metadata
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  updatedBy: text("updated_by"),
}, (table) => [
  unique("tenant_entity_type_unique").on(table.tenantId, table.entityType, table.recordType),
]);

export type RecordTypeConfig = typeof recordTypeConfigsTable.$inferSelect;
export type NewRecordTypeConfig = typeof recordTypeConfigsTable.$inferInsert;