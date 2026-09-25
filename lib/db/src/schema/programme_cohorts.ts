import { pgTable, text, integer, timestamp, pgEnum, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { programmesTable } from "./programmes";
import { usersTable } from "./users";

export const cohortStatusEnum = pgEnum("cohort_status", ["PLANNED", "OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"]);

export const programmeCohortsTable = pgTable("programme_cohorts", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").references(() => tenantsTable.id),
  programmeId: text("programme_id").notNull().references(() => programmesTable.id),
  cohortName: text("cohort_name").notNull(),
  startDate: text("start_date"),
  endDate: text("end_date"),
  capacity: integer("capacity"),
  enrolledCount: integer("enrolled_count").default(0),
  status: cohortStatusEnum("status").default("PLANNED"),
  metadata: jsonb("metadata").default({}),
  tags: text("tags").array(),
  notes: text("notes"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),

  // LMS extensions (0013 migration — nullable for zero-downtime deploy)
  programmeType: text("programme_type"), // rising_futures | finding_futures | launching_futures
  programmeManagerId: text("programme_manager_id").references(() => usersTable.id),
  leadTeacherName: text("lead_teacher_name"),
  minAttendanceSessions: integer("min_attendance_sessions").default(6),
  lmsLifecycleStatus: text("lms_lifecycle_status"), // setup | data_collection | report_generation | complete
});

export const insertProgrammeCohortSchema = createInsertSchema(programmeCohortsTable).omit({ createdAt: true, updatedAt: true });
export type InsertProgrammeCohort = z.infer<typeof insertProgrammeCohortSchema>;
export type ProgrammeCohort = typeof programmeCohortsTable.$inferSelect;
