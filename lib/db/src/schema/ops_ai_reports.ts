import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const opsAiReportsTable = pgTable("ops_ai_reports", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id),
  reportText: text("report_text").notNull(),
  severity: text("severity").notNull(), // ok | warning | critical
  trigger: text("trigger").notNull(), // scheduled | alarm
  inputSnapshot: jsonb("input_snapshot"),
  aiProvider: text("ai_provider"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertOpsAiReportSchema = createInsertSchema(opsAiReportsTable).omit({ createdAt: true });
export type InsertOpsAiReport = z.infer<typeof insertOpsAiReportSchema>;
export type OpsAiReport = typeof opsAiReportsTable.$inferSelect;
