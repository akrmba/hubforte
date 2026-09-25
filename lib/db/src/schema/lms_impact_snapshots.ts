import { pgTable, text, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { programmeCohortsTable } from "./programme_cohorts";
import { usersTable } from "./users";

export const lmsImpactSnapshotsTable = pgTable("lms_impact_snapshots", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id),
  cohortId: text("cohort_id").notNull().references(() => programmeCohortsTable.id),
  snapshotVersion: integer("snapshot_version").notNull(),
  calculatedBy: text("calculated_by").notNull().references(() => usersTable.id),
  resultsJson: jsonb("results_json").notNull().default({}),
  weightsJson: jsonb("weights_json").notNull().default({}),
  isLatest: boolean("is_latest").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertLmsImpactSnapshotSchema = createInsertSchema(lmsImpactSnapshotsTable).omit({ createdAt: true });
export type InsertLmsImpactSnapshot = z.infer<typeof insertLmsImpactSnapshotSchema>;
export type LmsImpactSnapshot = typeof lmsImpactSnapshotsTable.$inferSelect;
