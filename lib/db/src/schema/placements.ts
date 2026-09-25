import { pgTable, text, real, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { volunteersTable } from "./volunteers";
import { programmesTable } from "./programmes";
import { organizationsTable } from "./organizations";

export const placementStatusEnum = pgEnum("placement_status", ["CONFIRMED", "ACTIVE", "COMPLETED", "WITHDRAWN"]);

export const placementsTable = pgTable("placements", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").references(() => tenantsTable.id),
  volunteerId: text("volunteer_id").notNull().references(() => volunteersTable.id),
  programmeId: text("programme_id").notNull().references(() => programmesTable.id),
  cohortId: text("cohort_id"),
  organizationId: text("organization_id").references(() => organizationsTable.id),
  startDate: text("start_date"),
  endDate: text("end_date"),
  hoursCommitted: real("hours_committed"),
  hoursDelivered: real("hours_delivered").default(0),
  status: placementStatusEnum("status").default("CONFIRMED"),
  notes: text("notes"),
  createdBy: text("created_by"),
  sourceTable: text("source_table"),
  sourceId: text("source_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPlacementSchema = createInsertSchema(placementsTable).omit({ createdAt: true, updatedAt: true });
export type InsertPlacement = z.infer<typeof insertPlacementSchema>;
export type Placement = typeof placementsTable.$inferSelect;
