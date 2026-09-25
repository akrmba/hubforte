import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const registeredAppsTable = pgTable("registered_apps", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id),
  appName: text("app_name").notNull(),
  appSlug: text("app_slug").notNull(),
  appUrl: text("app_url"),
  webhookUrl: text("webhook_url"),
  apiKey: text("api_key").notNull(),
  webhookSecret: text("webhook_secret").notNull(),
  scopes: jsonb("scopes").notNull().default([]),
  status: text("status").notNull().default("active"),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRegisteredAppSchema = createInsertSchema(registeredAppsTable).omit({ createdAt: true, updatedAt: true });
export type InsertRegisteredApp = z.infer<typeof insertRegisteredAppSchema>;
export type RegisteredApp = typeof registeredAppsTable.$inferSelect;
