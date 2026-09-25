import { pgTable, text, timestamp, pgEnum, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { contactsTable } from "./contacts";
import { organizationsTable } from "./organizations";
import { programmesTable } from "./programmes";
import { fundingOpportunitiesTable } from "./funding_opportunities";
import { volunteersTable } from "./volunteers";
import { studentsTable } from "./students";
import { priorityEnum } from "./tasks";

export const activityTypeEnum = pgEnum("activity_type", ["EMAIL", "CALL", "NOTE", "MEETING", "TASK_COMPLETED", "SITE_VISIT", "WHATSAPP", "EVENT", "OTHER"]);
export const sentimentEnum = pgEnum("sentiment", ["POSITIVE", "NEUTRAL", "NEGATIVE"]);

export const activitiesTable = pgTable("activities", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").references(() => tenantsTable.id),
  type: activityTypeEnum("type").notNull(),
  summary: text("summary").notNull(),
  date: timestamp("date", { withTimezone: true }).notNull().defaultNow(),
  contactId: text("contact_id").references(() => contactsTable.id),
  organizationId: text("organization_id").references(() => organizationsTable.id),
  opportunityId: text("opportunity_id").references(() => fundingOpportunitiesTable.id),
  userId: text("user_id").notNull(),
  subject: text("subject"),
  notes: text("notes"),
  outcome: text("outcome"),
  sentiment: sentimentEnum("sentiment"),
  nextAction: text("next_action"),
  nextActionDate: text("next_action_date"),
  priority: priorityEnum("priority").default("MEDIUM"),
  volunteerId: text("volunteer_id").references(() => volunteersTable.id),
  studentId: text("student_id").references(() => studentsTable.id),
  programmeId: text("programme_id").references(() => programmesTable.id),
  metadata: jsonb("metadata").default({}),
  createdBy: text("created_by"),
  sourceTable: text("source_table"),
  sourceId: text("source_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertActivitySchema = createInsertSchema(activitiesTable).omit({ createdAt: true, updatedAt: true });
export type InsertActivity = z.infer<typeof insertActivitySchema>;
export type Activity = typeof activitiesTable.$inferSelect;
