import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { programmeCohortsTable } from "./programme_cohorts";
import { studentsTable } from "./students";
import { usersTable } from "./users";
import { lmsImpactSnapshotsTable } from "./lms_impact_snapshots";

export const lmsReportsTable = pgTable("lms_reports", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id),
  cohortId: text("cohort_id").notNull().references(() => programmeCohortsTable.id),
  studentId: text("student_id").references(() => studentsTable.id), // null for school report rows
  reportType: text("report_type").notNull(), // school_ofsted | student_personal | internal_summary | forward_to_future
  snapshotId: text("snapshot_id").notNull().references(() => lmsImpactSnapshotsTable.id),
  status: text("status").notNull().default("generating"), // generating | ready | sent | archived
  fileReference: text("file_reference"),
  version: integer("version").notNull().default(1),
  generatedBy: text("generated_by").notNull().references(() => usersTable.id),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertLmsReportSchema = createInsertSchema(lmsReportsTable).omit({ createdAt: true });
export type InsertLmsReport = z.infer<typeof insertLmsReportSchema>;
export type LmsReport = typeof lmsReportsTable.$inferSelect;
