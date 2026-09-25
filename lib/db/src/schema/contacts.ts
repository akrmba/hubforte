import { pgTable, text, timestamp, pgEnum, jsonb, boolean, integer, real, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const contactStatusEnum = pgEnum("contact_status", ["ACTIVE", "INACTIVE", "PROSPECT", "UNSUBSCRIBED"]);

export const jobTitleGroupEnum = pgEnum("job_title_group", [
  "CEO", "HEADTEACHER", "DEPUTY_HEAD", "DSL", "SENCO", "CAREERS_LEAD",
  "SIXTH_FORM_HEAD", "PASTORAL_LEAD", "FINANCE_CONTACT", "CSR_MANAGER", "TRUSTEE", "OTHER"
]);

export const lawfulBasisEnum = pgEnum("lawful_basis", ["LEGITIMATE_INTEREST", "CONSENT", "CONTRACT"]);

export const preferredContactMethodEnum = pgEnum("preferred_contact_method", ["EMAIL", "PHONE", "WHATSAPP", "IN_PERSON"]);

export const contactsTable = pgTable("contacts", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").references(() => tenantsTable.id),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  role: text("role"),
  email: text("email"),
  phone: text("phone"),
  status: contactStatusEnum("status").notNull().default("PROSPECT"),
  lastContactedAt: timestamp("last_contacted_at", { withTimezone: true }),
  organizationId: text("organization_id"),
  ownerId: text("owner_id"),
  title: text("title"),
  jobTitleGroup: jobTitleGroupEnum("job_title_group"),
  department: text("department"),
  seniorityLevel: text("seniority_level"),
  phoneDirect: text("phone_direct"),
  mobile: text("mobile"),
  preferredContactMethod: preferredContactMethodEnum("preferred_contact_method"),
  preferredContactTime: text("preferred_contact_time"),
  isPrimaryContact: boolean("is_primary_contact").default(false),
  isDecisionMaker: boolean("is_decision_maker").default(false),
  isDeliveryContact: boolean("is_delivery_contact").default(false),
  isSafeguardingRelevant: boolean("is_safeguarding_relevant").default(false),
  isFirstOutreachContact: boolean("is_first_outreach_contact").default(false),
  consentToContact: boolean("consent_to_contact").default(false),
  lawfulBasis: lawfulBasisEnum("lawful_basis"),
  consentDate: timestamp("consent_date", { withTimezone: true }),
  marketingOptOut: boolean("marketing_opt_out").default(false),
  relationshipStrength: integer("relationship_strength"),
  nextFollowUpDate: timestamp("next_follow_up_date", { withTimezone: true }),
  metadata: jsonb("metadata").default({}),
  tags: text("tags").array(),
  notes: text("notes"),
  createdBy: text("created_by"),
  sourceTable: text("source_table"),
  sourceId: text("source_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  // Phase 10: AI lead scoring
  leadScore: integer("lead_score"),
  leadScoreLabel: text("lead_score_label"),
  leadScoreExplanation: text("lead_score_explanation"),
  leadScoreUpdatedAt: timestamp("lead_score_updated_at", { withTimezone: true }),
}, (table) => ({
  idxEmail:     index("idx_contacts_email").on(table.email).where(sql`${table.email} IS NOT NULL`),
  idxStatus:    index("idx_contacts_status").on(table.tenantId, table.status),
  idxCreatedAt: index("idx_contacts_created_at").on(table.tenantId, table.createdAt.desc()),
}));

export const insertContactSchema = createInsertSchema(contactsTable).omit({ createdAt: true, updatedAt: true });
export type InsertContact = z.infer<typeof insertContactSchema>;
export type Contact = typeof contactsTable.$inferSelect;
