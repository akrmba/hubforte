import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { usersTable } from "./users";

export const changeEventsTable = pgTable("change_events", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  eventType: text("event_type").notNull(), // CREATE | UPDATE | DELETE
  changedFields: jsonb("changed_fields").default([]),
  oldValues: jsonb("old_values").default({}),
  newValues: jsonb("new_values").default({}),
  userId: text("user_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertChangeEventSchema = createInsertSchema(changeEventsTable).omit({ createdAt: true });
export type InsertChangeEvent = z.infer<typeof insertChangeEventSchema>;
export type ChangeEvent = typeof changeEventsTable.$inferSelect;
