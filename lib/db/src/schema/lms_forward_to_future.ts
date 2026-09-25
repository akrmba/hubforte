import { pgTable, text, date, jsonb, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { programmeCohortsTable } from "./programme_cohorts";
import { studentsTable } from "./students";
import { usersTable } from "./users";

export const lmsForwardToFutureTable = pgTable("lms_forward_to_future", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id),
  cohortId: text("cohort_id").notNull().references(() => programmeCohortsTable.id),
  studentId: text("student_id").notNull().references(() => studentsTable.id),
  programmeType: text("programme_type").notNull(), // rising_futures | finding_futures | launching_futures
  sessionDate: date("session_date"), // actual FtF session date
  responsesJson: jsonb("responses_json").notNull().default({}), // flexible payload until final FtF template confirmed
  enteredBy: text("entered_by").notNull().references(() => usersTable.id),
  enteredAt: timestamp("entered_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  uniqStudentCohort: unique().on(t.studentId, t.cohortId),
}));

export const insertLmsForwardToFutureSchema = createInsertSchema(lmsForwardToFutureTable).omit({ enteredAt: true, updatedAt: true });
export type InsertLmsForwardToFuture = z.infer<typeof insertLmsForwardToFutureSchema>;
export type LmsForwardToFuture = typeof lmsForwardToFutureTable.$inferSelect;
