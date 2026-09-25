import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { usersTable } from "./users";

export const fieldHistoryTable = pgTable("field_history", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  fieldName: text("field_name").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  changedBy: text("changed_by").references(() => usersTable.id),
  changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertFieldHistorySchema = createInsertSchema(fieldHistoryTable).omit({ changedAt: true });
export type InsertFieldHistory = z.infer<typeof insertFieldHistorySchema>;
export type FieldHistory = typeof fieldHistoryTable.$inferSelect;
