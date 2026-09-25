import { pgTable, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { studentsTable } from "./students";
import { programmeCohortsTable } from "./programme_cohorts";
import { usersTable } from "./users";

export const lmsAiSummariesTable = pgTable("lms_ai_summaries", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id),
  studentId: text("student_id").references(() => studentsTable.id), // null for cohort-level summaries
  cohortId: text("cohort_id").references(() => programmeCohortsTable.id), // null for per-student summaries
  summaryType: text("summary_type").notNull(), // student_voice_per_student | teacher_reflection_per_student | cohort_student_voice | cohort_coach_summary | cohort_teacher_summary
  generatedText: text("generated_text"),
  editedText: text("edited_text"),
  wasEdited: boolean("was_edited").notNull().default(false),
  isManual: boolean("is_manual").notNull().default(false),
  aiProvider: text("ai_provider"),
  promptTokens: integer("prompt_tokens"),
  completionTokens: integer("completion_tokens"),
  failed: boolean("failed").notNull().default(false),
  failureReason: text("failure_reason"),
  editedBy: text("edited_by").references(() => usersTable.id),
  editedAt: timestamp("edited_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertLmsAiSummarySchema = createInsertSchema(lmsAiSummariesTable).omit({ createdAt: true });
export type InsertLmsAiSummary = z.infer<typeof insertLmsAiSummarySchema>;
export type LmsAiSummary = typeof lmsAiSummariesTable.$inferSelect;
