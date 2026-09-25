import { pgTable, text, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { savedReportsTable } from "./savedReports";
import { usersTable } from "./users";

export const reportSchedulesTable = pgTable("report_schedules", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id),
  savedReportId: text("saved_report_id").notNull().references(() => savedReportsTable.id),
  ownerId: text("owner_id").notNull().references(() => usersTable.id),
  frequency: text("frequency").notNull(), // daily | weekly | monthly
  recipientUserIds: jsonb("recipient_user_ids").notNull().default([]),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertReportScheduleSchema = createInsertSchema(reportSchedulesTable).omit({ createdAt: true, updatedAt: true });
export type InsertReportSchedule = z.infer<typeof insertReportScheduleSchema>;
export type ReportSchedule = typeof reportSchedulesTable.$inferSelect;
