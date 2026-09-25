import { pgTable, text, boolean, timestamp, unique, jsonb } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

export const tenantFieldVisibilityTable = pgTable("tenant_field_visibility", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id),
  entityType: text("entity_type").notNull(), // e.g., "organizations", "contacts", "students", etc.
  fieldPath: text("field_path").notNull(), // e.g., "name", "email", "address.street"
  visible: boolean("visible").notNull().default(true),
  required: boolean("required").notNull().default(false),
  labelOverride: text("label_override"), // Custom label for this tenant
  helpText: text("help_text"), // Tenant-specific help text
  validationRules: jsonb("validation_rules"), // JSON schema validation rules
  displayOrder: text("display_order"), // Controls ordering in forms
  visibleToRoles: jsonb("visible_to_roles").$type<string[]>(), // Array of role names that can see this field
  editableByRoles: jsonb("editable_by_roles").$type<string[]>(), // Array of role names that can edit this field
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  updatedBy: text("updated_by"),
}, (table) => [
  unique("tenant_entity_field_unique").on(table.tenantId, table.entityType, table.fieldPath),
]);

export type TenantFieldVisibility = typeof tenantFieldVisibilityTable.$inferSelect;
export type NewTenantFieldVisibility = typeof tenantFieldVisibilityTable.$inferInsert;