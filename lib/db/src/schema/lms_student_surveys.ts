import { pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { studentsTable } from "./students";

export const lmsStudentSurveysTable = pgTable("lms_student_surveys", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id),
  studentId: text("student_id").notNull().references(() => studentsTable.id),
  timePoint: text("time_point").notNull(), // pre | end | forward_to_future
  enjoyedProgramme: text("enjoyed_programme"),
  preparedFuture: text("prepared_future"),
  motivatedSchool: text("motivated_school"),
  shownSkills: text("shown_skills"),
  betterFutureIdeas: text("better_future_ideas"),
  positiveDifference: text("positive_difference"),
  threeWords: text("three_words"),
  favouriteThing: text("favourite_thing"),
  whyFavourite: text("why_favourite"),
  changeOneThing: text("change_one_thing"),
  otherComments: text("other_comments"),
  submissionChannel: text("submission_channel").notNull(), // coach_handover | qr_code | url_code | email_link | sms_link
  submittedViaToken: text("submitted_via_token"), // FK to lms_access_tokens.id
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("lms_student_surveys_student_timepoint").on(t.studentId, t.timePoint),
]);

export const insertLmsStudentSurveySchema = createInsertSchema(lmsStudentSurveysTable).omit({ createdAt: true });
export type InsertLmsStudentSurvey = z.infer<typeof insertLmsStudentSurveySchema>;
export type LmsStudentSurvey = typeof lmsStudentSurveysTable.$inferSelect;
