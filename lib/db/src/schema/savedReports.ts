import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { reportTypesTable } from "./reportTypes";
import { usersTable } from "./users";

export const savedReportsTable = pgTable("saved_reports", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id),
  reportTypeId: text("report_type_id").references(() => reportTypesTable.id),
  name: text("name").notNull(),
  columns: jsonb("columns").notNull().default([]),
  filters: jsonb("filters").notNull().default([]),
  groupings: jsonb("groupings").notNull().default([]),
  sortOrder: jsonb("sort_order").notNull().default([]),
  chartType: text("chart_type"),
  sharing: text("sharing").notNull().default("PRIVATE"),
  ownerId: text("owner_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSavedReportSchema = createInsertSchema(savedReportsTable).omit({ createdAt: true, updatedAt: true });
export type InsertSavedReport = z.infer<typeof insertSavedReportSchema>;
export type SavedReport = typeof savedReportsTable.$inferSelect;
