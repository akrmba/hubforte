import { pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { studentsTable } from "./students";
import { usersTable } from "./users";

export const lmsCoachNarrativesTable = pgTable("lms_coach_narratives", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id),
  studentId: text("student_id").notNull().unique().references(() => studentsTable.id),
  overallEngagement: text("overall_engagement"), // exceptional | strong | good | developing | limited
  attendanceComment: text("attendance_comment"),
  itwReflection: text("itw_reflection"),
  wowReflection: text("wow_reflection"),
  talentProgressSummary: text("talent_progress_summary"),
  overallProgressSummary: text("overall_progress_summary"),
  nextSteps: text("next_steps"),
  submittedBy: text("submitted_by").notNull().references(() => usersTable.id),
  isComplete: boolean("is_complete").notNull().default(false),
  lastSavedAt: timestamp("last_saved_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertLmsCoachNarrativeSchema = createInsertSchema(lmsCoachNarrativesTable).omit({ createdAt: true, updatedAt: true });
export type InsertLmsCoachNarrative = z.infer<typeof insertLmsCoachNarrativeSchema>;
export type LmsCoachNarrative = typeof lmsCoachNarrativesTable.$inferSelect;
