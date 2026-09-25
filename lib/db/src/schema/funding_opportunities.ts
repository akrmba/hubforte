import { pgTable, text, timestamp, pgEnum, numeric, unique, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { fundersTable } from "./funders";

export const fundingTypeEnum = pgEnum("funding_type", ["GRANT", "CSR", "CONTRACT", "IN_KIND", "S106", "DONATION", "OTHER"]);
export const fundingStageEnum = pgEnum("funding_stage", ["PROSPECT", "APPROACH", "PROPOSAL_SENT", "APPLIED", "AWARDED", "ACTIVE", "COMPLETED", "DECLINED", "LOST"]);
export const claimStatusEnum = pgEnum("claim_status", ["NOT_STARTED", "IN_PROGRESS", "SUBMITTED", "APPROVED"]);

export const fundingOpportunitiesTable = pgTable("funding_opportunities", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").references(() => tenantsTable.id),
  funderId: text("funder_id").references(() => fundersTable.id),
  name: text("name").notNull(),
  
  // Financial fields
  fundingType: fundingTypeEnum("funding_type"),
  amountExpected: numeric("amount_expected", { precision: 15, scale: 2 }),
  amountReceived: numeric("amount_received", { precision: 15, scale: 2 }),
  restrictedFlag: boolean("restricted_flag").default(false),
  restrictionSummary: text("restriction_summary"),
  
  // Pipeline fields
  stage: fundingStageEnum("stage").notNull().default("PROSPECT"),
  expectedCloseDate: timestamp("expected_close_date", { withTimezone: true }),
  actualCloseDate: timestamp("actual_close_date", { withTimezone: true }),
  ownerId: text("owner_id").notNull(),
  
  // Grant management fields
  grantReference: text("grant_reference"),
  periodStart: text("period_start"),
  periodEnd: text("period_end"),
  applicationDeadline: text("application_deadline"),
  decisionDate: text("decision_date"),
  conditions: jsonb("conditions").default([]),
  
  // Reporting fields
  reportingRequired: boolean("reporting_required").default(false),
  reportingDeadline: text("reporting_deadline"),
  reportDueDate: text("report_due_date"),
  reportSubmittedDate: text("report_submitted_date"),
  claimStatus: claimStatusEnum("claim_status"),
  evidenceRequired: text("evidence_required"),
  
  // Programme linkage
  programmeIds: text("programme_ids").array(),
  
  // Renewal tracking
  renewalDate: text("renewal_date"),
  
  // Status & notes
  notes: text("notes"),
  metadata: jsonb("metadata").default({}),
  tags: text("tags").array(),
  
  // Audit
  createdBy: text("created_by"),
  sourceTable: text("source_table"),
  sourceId: text("source_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// DEPRECATED: This junction table is no longer used in application code.
// Activities are linked to funding opportunities via the `fundingOpportunityId` column on the activities table.
// Kept here to avoid dropping the table from the database.
export const fundingOpportunityActivitiesTable = pgTable("funding_opportunity_activities", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").references(() => tenantsTable.id),
  fundingOpportunityId: text("funding_opportunity_id").notNull().references(() => fundingOpportunitiesTable.id),
  activityId: text("activity_id").notNull(),
}, (t) => [unique().on(t.fundingOpportunityId, t.activityId)]);

export const insertFundingOpportunitySchema = createInsertSchema(fundingOpportunitiesTable).omit({ createdAt: true, updatedAt: true });
export type InsertFundingOpportunity = z.infer<typeof insertFundingOpportunitySchema>;
export type FundingOpportunity = typeof fundingOpportunitiesTable.$inferSelect;

export const insertFundingOpportunityActivitySchema = createInsertSchema(fundingOpportunityActivitiesTable);
export type InsertFundingOpportunityActivity = z.infer<typeof insertFundingOpportunityActivitySchema>;
export type FundingOpportunityActivity = typeof fundingOpportunityActivitiesTable.$inferSelect;
