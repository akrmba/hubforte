import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const integrationConfigsTable = pgTable("integration_configs", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  connectorKey: text("connector_key").notNull(),
  encryptedConfig: text("encrypted_config").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertIntegrationConfigSchema = createInsertSchema(integrationConfigsTable).omit({ createdAt: true, updatedAt: true });
export type InsertIntegrationConfig = z.infer<typeof insertIntegrationConfigSchema>;
export type IntegrationConfig = typeof integrationConfigsTable.$inferSelect;
