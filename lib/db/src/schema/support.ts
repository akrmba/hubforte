import { pgTable, text, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const ticketStatusEnum = pgEnum("ticket_status", ["OPEN", "IN_PROGRESS", "WAITING", "RESOLVED", "CLOSED"]);
export const ticketSourceEnum = pgEnum("ticket_source", ["MANUAL", "EMAIL", "VOICE"]);

export const supportTicketsTable = pgTable("support_tickets", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").references(() => tenantsTable.id),
  ticketNumber: text("ticket_number").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: ticketStatusEnum("status").notNull().default("OPEN"),
  priority: text("priority").notNull().default("MEDIUM"),
  source: ticketSourceEnum("source").notNull().default("MANUAL"),
  reportedById: text("reported_by_id").notNull(),
  assignedToId: text("assigned_to_id"),
  contactId: text("contact_id"),
  organizationId: text("organization_id"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolutionNotes: text("resolution_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const ticketUpdatesTable = pgTable("ticket_updates", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").references(() => tenantsTable.id),
  ticketId: text("ticket_id").notNull(),
  authorId: text("author_id").notNull(),
  content: text("content").notNull(),
  isInternal: boolean("is_internal").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const aiTicketDiagnosesTable = pgTable("ai_ticket_diagnoses", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").references(() => tenantsTable.id),
  ticketId: text("ticket_id").notNull(),
  diagnosis: text("diagnosis").notNull(),
  suggestedAction: text("suggested_action").notNull(),
  confidence: text("confidence").notNull(),
  approvedById: text("approved_by_id"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  applied: boolean("applied").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSupportTicketSchema = createInsertSchema(supportTicketsTable).omit({ createdAt: true, updatedAt: true });
export type InsertSupportTicket = z.infer<typeof insertSupportTicketSchema>;
export type SupportTicket = typeof supportTicketsTable.$inferSelect;

export const insertTicketUpdateSchema = createInsertSchema(ticketUpdatesTable).omit({ createdAt: true });
export type InsertTicketUpdate = z.infer<typeof insertTicketUpdateSchema>;
export type TicketUpdate = typeof ticketUpdatesTable.$inferSelect;

export const insertAiTicketDiagnosisSchema = createInsertSchema(aiTicketDiagnosesTable).omit({ createdAt: true });
export type InsertAiTicketDiagnosis = z.infer<typeof insertAiTicketDiagnosisSchema>;
export type AiTicketDiagnosis = typeof aiTicketDiagnosesTable.$inferSelect;
