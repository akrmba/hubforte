import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const incidentsTable = pgTable("incidents", {
  id: text("id").primaryKey(),
  severity: text("severity").notNull(), // P1 | P2 | P3 | P4
  condition: text("condition").notNull(), // machine-readable condition key
  message: text("message").notNull(),
  detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
  notificationsSent: jsonb("notifications_sent").notNull().default([]),
  tenantIdsAffected: jsonb("tenant_ids_affected").notNull().default([]),
  statusPageIncidentId: text("status_page_incident_id"),
});

export const insertIncidentSchema = createInsertSchema(incidentsTable).omit({ detectedAt: true });
export type InsertIncident = z.infer<typeof insertIncidentSchema>;
export type Incident = typeof incidentsTable.$inferSelect;
