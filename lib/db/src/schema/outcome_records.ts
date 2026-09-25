import { pgTable, text, timestamp, pgEnum, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { outcomeFrameworksTable } from "./outcome_frameworks";
import { studentsTable } from "./students";
import { programmesTable } from "./programmes";
import { programmeCohortsTable } from "./programme_cohorts";
import { programmeSessionsTable } from "./programme_sessions";
import { usersTable } from "./users";

export const assessmentTypeEnum = pgEnum("assessment_type", ["BASELINE", "MIDLINE", "ENDLINE", "FOLLOW_UP", "AD_HOC"]);
export const outcomeRecordStatusEnum = pgEnum("outcome_record_status", ["DRAFT", "SUBMITTED", "VERIFIED", "REJECTED"]);

export const outcomeRecordsTable = pgTable("outcome_records", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").references(() => tenantsTable.id),
  outcomeFrameworkId: text("outcome_framework_id").notNull().references(() => outcomeFrameworksTable.id),
  studentId: text("student_id").notNull().references(() => studentsTable.id),
  programmeId: text("programme_id").references(() => programmesTable.id),
  cohortId: text("cohort_id").references(() => programmeCohortsTable.id),
  sessionId: text("session_id").references(() => programmeSessionsTable.id),
  assessmentDate: text("assessment_date").notNull(),
  assessorUserId: text("assessor_user_id").references(() => usersTable.id),
  assessmentType: assessmentTypeEnum("assessment_type").notNull(),
  scores: jsonb("scores").default({}),
  notes: text("notes"),
  evidenceUrl: text("evidence_url"),
  status: outcomeRecordStatusEnum("status").default("DRAFT"),
  verifiedByUserId: text("verified_by_user_id").references(() => usersTable.id),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  metadata: jsonb("metadata").default({}),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertOutcomeRecordSchema = createInsertSchema(outcomeRecordsTable).omit({ createdAt: true, updatedAt: true });
export type InsertOutcomeRecord = z.infer<typeof insertOutcomeRecordSchema>;
export type OutcomeRecord = typeof outcomeRecordsTable.$inferSelect;