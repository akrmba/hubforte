import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const reportTypesTable = pgTable("report_types", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").references(() => tenantsTable.id),
  entityType: text("entity_type").notNull(),
  label: text("label").notNull(),
  description: text("description"),
  availableFields: jsonb("available_fields").notNull().default([]),
  availableFilters: jsonb("available_filters").notNull().default([]),
  availableGroupings: jsonb("available_groupings").notNull().default([]),
  joinConfig: jsonb("join_config").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertReportTypeSchema = createInsertSchema(reportTypesTable).omit({ createdAt: true });
export type InsertReportType = z.infer<typeof insertReportTypeSchema>;
export type ReportType = typeof reportTypesTable.$inferSelect;
