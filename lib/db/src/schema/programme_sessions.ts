import { pgTable, text, integer, timestamp, pgEnum, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { programmesTable } from "./programmes";
import { programmeCohortsTable } from "./programme_cohorts";

export const sessionStatusEnum = pgEnum("session_status", ["SCHEDULED", "COMPLETED", "CANCELLED", "RESCHEDULED"]);
export const deliveryFormatEnum = pgEnum("delivery_format", ["IN_PERSON", "VIRTUAL", "HYBRID"]);

export const programmeSessionsTable = pgTable("programme_sessions", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").references(() => tenantsTable.id),
  programmeId: text("programme_id").notNull().references(() => programmesTable.id),
  cohortId: text("cohort_id").references(() => programmeCohortsTable.id),
  sessionNumber: integer("session_number"),
  sessionDate: text("session_date"),
  startTime: text("start_time"),
  endTime: text("end_time"),
  venue: text("venue"),
  deliveryFormat: deliveryFormatEnum("delivery_format"),
  facilitatorId: text("facilitator_id"),
  volunteerIds: text("volunteer_ids").array(),
  topic: text("topic"),
  description: text("description"),
  status: sessionStatusEnum("session_status").default("SCHEDULED"),
  metadata: jsonb("metadata").default({}),
  tags: text("tags").array(),
  notes: text("notes"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),

  // LMS extension (0013 migration — nullable for zero-downtime deploy)
  sessionType: text("session_type"), // welcome | coaching1 | coaching2 | itw | coaching3 | wow | coaching4 | graduation
});

export const insertProgrammeSessionSchema = createInsertSchema(programmeSessionsTable).omit({ createdAt: true, updatedAt: true });
export type InsertProgrammeSession = z.infer<typeof insertProgrammeSessionSchema>;
export type ProgrammeSession = typeof programmeSessionsTable.$inferSelect;
