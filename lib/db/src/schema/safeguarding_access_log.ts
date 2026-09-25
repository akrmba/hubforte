import { pgTable, text, timestamp, pgEnum, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { usersTable } from "./users";

export const accessTypeEnum = pgEnum("access_type", ["VIEW", "CREATE", "UPDATE", "DELETE", "EXPORT"]);

export const safeguardingAccessLogTable = pgTable("safeguarding_access_log", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").references(() => tenantsTable.id),
  safeguardingNoteId: text("safeguarding_note_id").notNull(),
  userId: text("user_id").notNull().references(() => usersTable.id),
  accessType: accessTypeEnum("access_type").notNull(),
  accessTimestamp: timestamp("access_timestamp", { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  accessedFields: jsonb("accessed_fields").default([]),
  reasonForAccess: text("reason_for_access"),
  metadata: jsonb("metadata").default({}),
});

export const insertSafeguardingAccessLogSchema = createInsertSchema(safeguardingAccessLogTable);
export type InsertSafeguardingAccessLog = z.infer<typeof insertSafeguardingAccessLogSchema>;
export type SafeguardingAccessLog = typeof safeguardingAccessLogTable.$inferSelect;