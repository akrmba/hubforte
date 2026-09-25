import { pgTable, text, timestamp, jsonb, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const errorLogsTable = pgTable("error_logs", {
  id: text("id").primaryKey(),
  level: text("level").notNull(),
  message: text("message").notNull(),
  source: text("source").notNull().default("api"),
  route: text("route"),
  tenantId: text("tenant_id"),       // which tenant was affected — required for founder incident model
  userId: text("user_id"),
  requestId: text("request_id"),     // internal correlation ID — never shown to customers
  errorRefId: text("error_ref_id"),  // customer/support reference — ERR-YYYY-MMDD-XXXX format
  method: text("method"),
  statusCode: integer("status_code"),
  stack: text("stack"),
  requestBody: text("request_body"),
  plainEnglish: text("plain_english"),
  resolved: boolean("resolved").notNull().default(false),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedNote: text("resolved_note"),
  resolvedBy: text("resolved_by"),
  occurrenceCount: integer("occurrence_count").notNull().default(1),
  lastOccurredAt: timestamp("last_occurred_at", { withTimezone: true }),
  dedupHash: text("dedup_hash"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertErrorLogSchema = createInsertSchema(errorLogsTable).omit({ createdAt: true });
export type InsertErrorLog = z.infer<typeof insertErrorLogSchema>;
export type ErrorLog = typeof errorLogsTable.$inferSelect;
