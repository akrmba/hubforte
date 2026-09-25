import { pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { studentsTable } from "./students";

export const lmsTeacherFeedbackTable = pgTable("lms_teacher_feedback", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id),
  studentId: text("student_id").notNull().unique().references(() => studentsTable.id),
  aspirationChange: boolean("aspiration_change"),
  attendanceChange: boolean("attendance_change"),
  behaviourChange: boolean("behaviour_change"),
  academicProgressChange: boolean("academic_progress_change"),
  freeTextReflection: text("free_text_reflection"),
  submittedViaToken: text("submitted_via_token"), // FK to lms_access_tokens.id
  isComplete: boolean("is_complete").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertLmsTeacherFeedbackSchema = createInsertSchema(lmsTeacherFeedbackTable).omit({ createdAt: true, updatedAt: true });
export type InsertLmsTeacherFeedback = z.infer<typeof insertLmsTeacherFeedbackSchema>;
export type LmsTeacherFeedback = typeof lmsTeacherFeedbackTable.$inferSelect;
