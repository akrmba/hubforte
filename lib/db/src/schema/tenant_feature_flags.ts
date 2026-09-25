import { pgTable, text, boolean, timestamp, unique } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

export const tenantFeatureFlagsTable = pgTable("tenant_feature_flags", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id),
  module: text("module").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  updatedBy: text("updated_by"),
}, (table) => [
  unique("tenant_module_unique").on(table.tenantId, table.module),
]);

export type TenantFeatureFlag = typeof tenantFeatureFlagsTable.$inferSelect;
