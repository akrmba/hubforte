import { pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { studentsTable } from "./students";
import { usersTable } from "./users";

export const lmsChosenTalentsTable = pgTable("lms_chosen_talents", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id),
  studentId: text("student_id").notNull().unique().references(() => studentsTable.id),
  confidence: boolean("confidence").notNull().default(true),
  resilience: boolean("resilience").notNull().default(true),
  communication: boolean("communication").notNull().default(true),
  selfAwareness: boolean("self_awareness").notNull().default(true),
  setBy: text("set_by").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertLmsChosenTalentSchema = createInsertSchema(lmsChosenTalentsTable).omit({ createdAt: true, updatedAt: true });
export type InsertLmsChosenTalent = z.infer<typeof insertLmsChosenTalentSchema>;
export type LmsChosenTalent = typeof lmsChosenTalentsTable.$inferSelect;
