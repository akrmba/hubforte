import { pgTable, text, integer, boolean, timestamp, pgEnum, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { organizationsTable } from "./organizations";
import { programmesTable } from "./programmes";
import { usersTable } from "./users";

export const senStageEnum = pgEnum("sen_stage", ["NONE", "SEN_SUPPORT", "EHCP"]);
export const attendanceBandEnum = pgEnum("attendance_band", ["HIGH", "MEDIUM", "LOW", "PERSISTENT_ABSENCE"]);
export const studentConsentStatusEnum = pgEnum("student_consent_status", ["OBTAINED", "PENDING", "WITHDRAWN", "NOT_REQUIRED"]);
export const safeguardingLevelEnum = pgEnum("safeguarding_level", ["NONE", "MONITORING", "ACTIVE", "ESCALATED"]);
export const completionStatusEnum = pgEnum("completion_status", ["ENROLLED", "ACTIVE", "COMPLETED", "WITHDRAWN", "TRANSFERRED"]);

export const studentsTable = pgTable("students", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").references(() => tenantsTable.id),
  organizationId: text("organization_id").notNull().references(() => organizationsTable.id),
  programmeId: text("programme_id").references(() => programmesTable.id),
  cohortId: text("cohort_id"),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  yearGroup: text("year_group"),
  age: integer("age"),
  gender: text("gender"),
  postcodePrefix: text("postcode_prefix"),
  
  // Need indicators
  fsmFlag: boolean("fsm_flag").default(false),
  pupilPremiumFlag: boolean("pupil_premium_flag").default(false),
  ealFlag: boolean("eal_flag").default(false),
  senStage: senStageEnum("sen_stage"),
  primaryNeed: text("primary_need"),
  attendanceBand: attendanceBandEnum("attendance_band"),
  behaviourFlag: boolean("behaviour_flag").default(false),
  lookedAfterFlag: boolean("looked_after_flag").default(false),
  youngCarerFlag: boolean("young_carer_flag").default(false),
  
  // Referral
  referralReason: text("referral_reason"),
  referralSource: text("referral_source"),
  referralDate: text("referral_date"),
  
  // Consent
  consentStatus: studentConsentStatusEnum("student_consent_status").default("PENDING"),
  consentDate: timestamp("consent_date", { withTimezone: true }),
  consentGivenBy: text("consent_given_by"),
  consentRelationship: text("consent_relationship"),
  mediaConsent: boolean("media_consent").default(false),
  consentWithdrawalDate: timestamp("consent_withdrawal_date", { withTimezone: true }),
  consentWithdrawalReason: text("consent_withdrawal_reason"),
  
  // Attendance (existing)
  attendanceCount: integer("attendance_count").default(0),
  
  // Safeguarding
  safeguardingFlag: boolean("safeguarding_flag").default(false),
  safeguardingLevel: safeguardingLevelEnum("safeguarding_level"),
  supportNotes: text("support_notes"),
  
  // Progress
  startDate: text("start_date"),
  endDate: text("end_date"),
  completionStatus: completionStatusEnum("completion_status").default("ENROLLED"),
  withdrawalReason: text("withdrawal_reason"),
  destination: text("destination"),
  
  // Extensible fields
  metadata: jsonb("metadata").default({}),
  tags: text("tags").array(),
  notes: text("notes"),
  
  // Audit
  createdBy: text("created_by"),
  sourceTable: text("source_table"),
  sourceId: text("source_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),

  // LMS extensions (0013 migration — nullable for zero-downtime deploy)
  coachId: text("coach_id").references(() => usersTable.id),
  careExperiencedFlag: boolean("care_experienced_flag").default(false),
  personalAccessCode: text("personal_access_code"), // UNIQUE (tenant_id, personal_access_code) enforced in migration 0013
  withdrawnAtSession: text("withdrawn_at_session"),
});

export const insertStudentSchema = createInsertSchema(studentsTable).omit({ createdAt: true, updatedAt: true });
export type InsertStudent = z.infer<typeof insertStudentSchema>;
export type Student = typeof studentsTable.$inferSelect;
