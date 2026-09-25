import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { studentsTable } from "./students";

export const lmsParentSurveysTable = pgTable("lms_parent_surveys", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id),
  studentId: text("student_id").notNull().unique().references(() => studentsTable.id),
  positiveDifferenceChild: text("positive_difference_child"),
  childMorePrepared: text("child_more_prepared"),
  childMoreMotivated: text("child_more_motivated"),
  biggestChanges: text("biggest_changes"),
  submissionChannel: text("submission_channel").notNull(),
  submittedViaToken: text("submitted_via_token"), // FK to lms_access_tokens.id
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertLmsParentSurveySchema = createInsertSchema(lmsParentSurveysTable).omit({ createdAt: true });
export type InsertLmsParentSurvey = z.infer<typeof insertLmsParentSurveySchema>;
export type LmsParentSurvey = typeof lmsParentSurveysTable.$inferSelect;
