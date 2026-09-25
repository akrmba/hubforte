import { pgTable, text, timestamp, pgEnum, integer, unique, jsonb, real, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { organizationsTable } from "./organizations";

export const funderTypeEnum = pgEnum("funder_type", ["TRUST", "FOUNDATION", "CORPORATE", "GOVERNMENT", "INDIVIDUAL", "LOTTERY", "DEVELOPER_S106", "CSR"]);
export const funderStatusEnum = pgEnum("funder_status", ["ACTIVE", "INACTIVE", "PROSPECT"]);
export const relationshipStatusEnum = pgEnum("relationship_status", ["PROSPECT", "CONTACTED", "MEETING_HELD", "PROPOSAL_SENT", "ACTIVE", "LAPSED"]);

export const fundersTable = pgTable("funders", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").references(() => tenantsTable.id),
  organizationId: text("organization_id").references(() => organizationsTable.id),
  name: text("name").notNull(),
  type: funderTypeEnum("type").notNull(),
  fundingAreas: text("funding_areas").array().notNull().default([]),
  geographicScope: text("geographic_scope"),
  typicalGrantMin: integer("typical_grant_min"),
  typicalGrantMax: integer("typical_grant_max"),
  applicationDeadlines: text("application_deadlines"),
  reportingRequirements: text("reporting_requirements"),
  focusArea: text("focus_area"),
  
  // Relationship fields
  relationshipStatus: relationshipStatusEnum("relationship_status"),
  relationshipOwnerId: text("relationship_owner_id").notNull(),
  renewalProbability: real("renewal_probability"),
  
  // S106/Developer fields (field-gated)
  schemeName: text("scheme_name"),
  schemeScale: text("scheme_scale"),
  communityHooks: text("community_hooks"),
  partnershipAngle: text("partnership_angle"),
  
  // Sponsor-origin fields
  sector: text("sector"),
  csrPriority: text("csr_priority"),
  employeeVolunteeringInterest: boolean("employee_volunteering_interest").default(false),
  region: text("region"),
  
  // Status & notes
  website: text("website"),
  notes: text("notes"),
  status: funderStatusEnum("status").notNull().default("ACTIVE"),
  
  // Extensible fields
  metadata: jsonb("metadata").default({}),
  tags: text("tags").array(),
  
  // Audit
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const funderContactsTable = pgTable("funder_contacts", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").references(() => tenantsTable.id),
  funderId: text("funder_id").notNull().references(() => fundersTable.id),
  contactId: text("contact_id").notNull(),
}, (t) => [unique().on(t.funderId, t.contactId)]);

export const insertFunderSchema = createInsertSchema(fundersTable).omit({ createdAt: true, updatedAt: true });
export type InsertFunder = z.infer<typeof insertFunderSchema>;
export type Funder = typeof fundersTable.$inferSelect;

export const insertFunderContactSchema = createInsertSchema(funderContactsTable);
export type InsertFunderContact = z.infer<typeof insertFunderContactSchema>;
export type FunderContact = typeof funderContactsTable.$inferSelect;
