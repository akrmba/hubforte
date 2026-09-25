import { pgTable, text, timestamp, pgEnum, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { studentsTable } from "./students";
import { parentGuardiansTable } from "./parent_guardians";
import { programmesTable } from "./programmes";
import { usersTable } from "./users";

export const consentTypeEnum = pgEnum("consent_type", ["PROGRAMME_PARTICIPATION", "PHOTOGRAPHY", "DATA_SHARING", "MEDICAL", "TRANSPORT", "OTHER"]);
export const consentScopeEnum = pgEnum("consent_scope", ["SINGLE_PROGRAMME", "ALL_PROGRAMMES", "ORGANIZATION_WIDE"]);
export const consentStatusEnum = pgEnum("consent_status", ["PENDING", "OBTAINED", "EXPIRED", "WITHDRAWN", "REVOKED"]);
export const obtainedMethodEnum = pgEnum("obtained_method", ["PAPER_FORM", "DIGITAL_FORM", "VERBAL", "EMAIL", "OTHER"]);

export const consentRecordsTable = pgTable("consent_records", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").references(() => tenantsTable.id),
  studentId: text("student_id").notNull().references(() => studentsTable.id),
  parentGuardianId: text("parent_guardian_id").references(() => parentGuardiansTable.id),
  consentType: consentTypeEnum("consent_type").notNull(),
  consentScope: consentScopeEnum("consent_scope").notNull().default("SINGLE_PROGRAMME"),
  programmeId: text("programme_id").references(() => programmesTable.id),
  status: consentStatusEnum("status").notNull().default("PENDING"),
  obtainedDate: text("obtained_date"),
  obtainedByUserId: text("obtained_by_user_id").references(() => usersTable.id),
  obtainedMethod: obtainedMethodEnum("obtained_method"),
  expiryDate: text("expiry_date"),
  withdrawnDate: text("withdrawn_date"),
  withdrawnReason: text("withdrawn_reason"),
  documentUrl: text("document_url"),
  notes: text("notes"),
  metadata: jsonb("metadata").default({}),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertConsentRecordSchema = createInsertSchema(consentRecordsTable).omit({ createdAt: true, updatedAt: true });
export type InsertConsentRecord = z.infer<typeof insertConsentRecordSchema>;
export type ConsentRecord = typeof consentRecordsTable.$inferSelect;