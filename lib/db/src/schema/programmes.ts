import { pgTable, text, integer, timestamp, pgEnum, jsonb, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { organizationsTable } from "./organizations";
import { contactsTable } from "./contacts";

export const programmeStatusEnum = pgEnum("programme_status", ["PLANNED", "RECRUITING", "ACTIVE", "PAUSED", "COMPLETED", "CANCELLED"]);
export const deliveryModelEnum = pgEnum("delivery_model", ["IN_SCHOOL", "VIRTUAL", "HYBRID", "COMMUNITY"]);
export const fundingStatusEnum = pgEnum("funding_status", ["PROSPECT", "COMMITTED", "RECEIVED", "INVOICED", "PAID", "OVERDUE"]);

export const programmesTable = pgTable("programmes", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").references(() => tenantsTable.id),
  organizationId: text("organization_id").notNull().references(() => organizationsTable.id),
  fundingOpportunityId: text("funding_opportunity_id"),
  programmeName: text("programme_name").notNull(),
  programmeType: text("programme_type"),
  programmeCategory: text("programme_category"),
  academicYear: text("academic_year"),
  term: text("term"),
  deliveryModel: deliveryModelEnum("delivery_model"),
  targetYearGroups: text("target_year_groups").array(),
  targetStudentCount: integer("target_student_count"),
  actualStudentCount: integer("actual_student_count").default(0),
  priorityGroups: text("priority_groups").array(),
  intendedOutcomes: text("intended_outcomes"),
  selectionCriteria: text("selection_criteria"),
  referralRoute: text("referral_route"),
  startDate: text("start_date"),
  endDate: text("end_date"),
  sessionCountPlanned: integer("session_count_planned"),
  sessionCountDelivered: integer("session_count_delivered"),
  deliveryDay: text("delivery_day"),
  deliveryTime: text("delivery_time"),
  venue: text("venue"),
  leadContactId: text("lead_contact_id").references(() => contactsTable.id),
  safeguardingContactId: text("safeguarding_contact_id").references(() => contactsTable.id),
  programmeManagerId: text("programme_manager_id"),
  volunteerNeededCount: integer("volunteer_needed_count"),
  volunteerAssignedCount: integer("volunteer_assigned_count"),
  budget: numeric("budget"),
  fundingStatus: fundingStatusEnum("funding_status"),
  status: programmeStatusEnum("status").default("PLANNED"),
  baselineDate: text("baseline_date"),
  reviewDate: text("review_date"),
  completionDate: text("completion_date"),
  impactSummary: text("impact_summary"),
  riskLog: text("risk_log"),
  metadata: jsonb("metadata").default({}),
  tags: text("tags").array(),
  notes: text("notes"),
  createdBy: text("created_by"),
  sourceTable: text("source_table"),
  sourceId: text("source_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertProgrammeSchema = createInsertSchema(programmesTable).omit({ createdAt: true, updatedAt: true });
export type InsertProgramme = z.infer<typeof insertProgrammeSchema>;
export type Programme = typeof programmesTable.$inferSelect;
