import { pgTable, text, boolean, jsonb, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { programmeCohortsTable } from "./programme_cohorts";
import { usersTable } from "./users";

export const lmsTripDataTable = pgTable("lms_trip_data", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id),
  cohortId: text("cohort_id").notNull().references(() => programmeCohortsTable.id),
  tripType: text("trip_type").notNull(), // itw | wow
  venueName: text("venue_name"),
  activityHighlights: jsonb("activity_highlights"), // array of 2-3 bullet strings
  featuredStudentQuote: text("featured_student_quote"),
  featuredCoachQuote: text("featured_coach_quote"),
  enteredBy: text("entered_by").notNull().references(() => usersTable.id),
  enteredAt: timestamp("entered_at", { withTimezone: true }).notNull().defaultNow(),
  isComplete: boolean("is_complete").notNull().default(false),
}, (t) => ({
  uniqCohortTripType: unique().on(t.cohortId, t.tripType),
}));

export const insertLmsTripDataSchema = createInsertSchema(lmsTripDataTable).omit({ enteredAt: true });
export type InsertLmsTripData = z.infer<typeof insertLmsTripDataSchema>;
export type LmsTripData = typeof lmsTripDataTable.$inferSelect;
