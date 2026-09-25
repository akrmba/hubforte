import { pgTable, text, timestamp, pgEnum, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { studentsTable } from "./students";
import { usersTable } from "./users";

export const safeguardingCategoryEnum = pgEnum("safeguarding_category", ["CONCERN", "INCIDENT", "DISCLOSURE", "MEDICAL", "BEHAVIORAL", "OTHER"]);
export const severityLevelEnum = pgEnum("severity_level", ["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export const safeguardingStatusEnum = pgEnum("safeguarding_status", ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED", "ESCALATED"]);
export const confidentialityLevelEnum = pgEnum("confidentiality_level", ["STANDARD", "RESTRICTED", "HIGHLY_RESTRICTED"]);

export const safeguardingNotesTable = pgTable("safeguarding_notes", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").references(() => tenantsTable.id),
  studentId: text("student_id").notNull().references(() => studentsTable.id),
  title: text("title").notNull(),
  content: text("content").notNull(),
  category: safeguardingCategoryEnum("category").notNull(),
  severity: severityLevelEnum("severity").notNull().default("MEDIUM"),
  status: safeguardingStatusEnum("status").notNull().default("OPEN"),
  confidentialityLevel: confidentialityLevelEnum("confidentiality_level").notNull().default("STANDARD"),
  reportedDate: text("reported_date").notNull(),
  reportedByUserId: text("reported_by_user_id").references(() => usersTable.id),
  assignedToUserId: text("assigned_to_user_id").references(() => usersTable.id),
  nextReviewDate: text("next_review_date"),
  resolutionNotes: text("resolution_notes"),
  resolutionDate: text("resolution_date"),
  relatedEntities: jsonb("related_entities").default([]),
  attachments: jsonb("attachments").default([]),
  metadata: jsonb("metadata").default({}),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSafeguardingNoteSchema = createInsertSchema(safeguardingNotesTable).omit({ createdAt: true, updatedAt: true });
export type InsertSafeguardingNote = z.infer<typeof insertSafeguardingNoteSchema>;
export type SafeguardingNote = typeof safeguardingNotesTable.$inferSelect;