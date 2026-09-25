import { pgTable, text, timestamp, pgEnum, jsonb, real, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { organizationsTable } from "./organizations";
import { contactsTable } from "./contacts";

export const dbsStatusEnum = pgEnum("dbs_status", ["CLEAR", "PENDING", "EXPIRED", "NOT_CHECKED", "NOT_STARTED"]);
export const referenceStatusEnum = pgEnum("reference_status", ["NOT_STARTED", "REQUESTED", "RECEIVED", "VERIFIED"]);
export const recruitmentStageEnum = pgEnum("recruitment_stage", ["ENQUIRY", "APPLICATION", "INTERVIEW", "REFERENCES", "DBS", "TRAINING", "READY", "ACTIVE", "INACTIVE"]);

export const volunteersTable = pgTable("volunteers", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").references(() => tenantsTable.id),
  organizationId: text("organization_id").references(() => organizationsTable.id),
  contactId: text("contact_id").references(() => contactsTable.id),
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email"),
  phone: text("phone"),
  postcode: text("postcode"),
  region: text("region"),
  
  // Professional fields
  employer: text("employer"),
  industryBackground: text("industry_background"),
  skills: text("skills").array().notNull().default([]),
  preferredAgePhase: text("preferred_age_phase"),
  preferredRegion: text("preferred_region"),
  travelLimit: text("travel_limit"),
  
  // Compliance fields
  dbsStatus: dbsStatusEnum("dbs_status").notNull().default("NOT_CHECKED"),
  dbsCertificateNumber: text("dbs_certificate_number"),
  dbsIssueDate: text("dbs_issue_date"),
  dbsExpiryDate: text("dbs_expiry_date"),
  dbsCheckedAt: timestamp("dbs_checked_at", { withTimezone: true }),
  dbsExpiresAt: timestamp("dbs_expires_at", { withTimezone: true }),
  safeguardingTrainingDate: text("safeguarding_training_date"),
  safeguardingTrainingExpiry: text("safeguarding_training_expiry"),
  referenceStatus: referenceStatusEnum("reference_status"),
  inductionDate: text("induction_date"),
  inductionCompleted: boolean("induction_completed").default(false),
  
  // Recruitment pipeline
  recruitmentStage: recruitmentStageEnum("recruitment_stage"),
  recruitmentSource: text("recruitment_source"),
  
  // Availability
  availability: jsonb("availability").default({}),
  
  // Assignment
  assignedCoordinatorId: text("assigned_coordinator_id"),
  
  // Engagement metrics
  hoursCommitted: real("hours_committed"),
  hoursCompleted: real("hours_completed"),
  attendanceRate: real("attendance_rate"),
  feedbackScore: real("feedback_score"),
  reengagementInterest: boolean("reengagement_interest").default(false),
  
  // Emergency contact
  emergencyContactName: text("emergency_contact_name"),
  emergencyContactPhone: text("emergency_contact_phone"),
  
  // Status & notes
  status: text("status"),
  metadata: jsonb("metadata").default({}),
  tags: text("tags").array(),
  notes: text("notes"),
  internalNotes: text("internal_notes"),
  references: text("references").array().notNull().default([]),
  
  // Audit
  createdBy: text("created_by"),
  sourceTable: text("source_table"),
  sourceId: text("source_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertVolunteerSchema = createInsertSchema(volunteersTable).omit({ createdAt: true, updatedAt: true });
export type InsertVolunteer = z.infer<typeof insertVolunteerSchema>;
export type Volunteer = typeof volunteersTable.$inferSelect;
