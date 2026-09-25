import { pgTable, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const priorityEnum = pgEnum("priority", ["LOW", "MEDIUM", "HIGH"]);
export const taskStatusEnum = pgEnum("task_status", ["PENDING", "IN_PROGRESS", "DONE"]);

export const tasksTable = pgTable("tasks", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").references(() => tenantsTable.id),
  title: text("title").notNull(),
  description: text("description"),
  dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
  priority: priorityEnum("priority").notNull().default("MEDIUM"),
  status: taskStatusEnum("status").notNull().default("PENDING"),
  ownerId: text("owner_id").notNull(),
  contactId: text("contact_id"),
  organizationId: text("organization_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTaskSchema = createInsertSchema(tasksTable).omit({ createdAt: true, updatedAt: true });
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasksTable.$inferSelect;
