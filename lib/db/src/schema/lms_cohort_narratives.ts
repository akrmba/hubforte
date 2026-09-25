import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { programmeCohortsTable } from "./programme_cohorts";
import { usersTable } from "./users";

export const lmsCohortNarrativesTable = pgTable("lms_cohort_narratives", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id),
  cohortId: text("cohort_id").notNull().unique().references(() => programmeCohortsTable.id),
  programmeStrengths: text("programme_strengths"),
  programmeChallenges: text("programme_challenges"),
  overallAssessment: text("overall_assessment"),
  conclusionNarrative: text("conclusion_narrative"),
  featuredStudentQuote: text("featured_student_quote"),
  enteredBy: text("entered_by").notNull().references(() => usersTable.id),
  lastSavedAt: timestamp("last_saved_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertLmsCohortNarrativeSchema = createInsertSchema(lmsCohortNarrativesTable).omit({ createdAt: true, updatedAt: true, lastSavedAt: true });
export type InsertLmsCohortNarrative = z.infer<typeof insertLmsCohortNarrativeSchema>;
export type LmsCohortNarrative = typeof lmsCohortNarrativesTable.$inferSelect;
