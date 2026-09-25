import { pgTable, text, timestamp, pgEnum, jsonb, integer, real, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const orgTypeEnum = pgEnum("org_type", ["SCHOOL", "COMPANY", "TRUST", "CHARITY", "GOVERNMENT", "SPONSOR", "PARTNER", "OTHER"]);
export const orgStatusEnum = pgEnum("org_status", ["ACTIVE", "INACTIVE", "PROSPECT"]);

export const organizationsTable = pgTable("organizations", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").references(() => tenantsTable.id),
  name: text("name").notNull(),
  type: orgTypeEnum("type").notNull(),
  status: orgStatusEnum("status").notNull().default("PROSPECT"),
  location: text("location"),
  ownerId: text("owner_id").notNull(),
  notes: text("notes"),
  website: text("website"),
  phone: text("phone"),
  address: text("address"),
  postcode: text("postcode"),
  region: text("region"),
  email: text("email"),
  relationshipStatus: text("relationship_status"),
  metadata: jsonb("metadata").default({}),
  parentOrgId: text("parent_org_id"),
  createdBy: text("created_by"),
  sourceTable: text("source_table"),
  sourceId: text("source_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  // New fields from architecture plan
  orgSubtype: text("org_subtype"),
  urn: text("urn"),
  ukprn: text("ukprn"),
  charityNumber: text("charity_number"),
  companiesHouseNumber: text("companies_house_number"),
  localAuthority: text("local_authority"),
  country: text("country"),
  phase: text("phase"),
  ageRangeLow: integer("age_range_low"),
  ageRangeHigh: integer("age_range_high"),
  hasSixthForm: boolean("has_sixth_form"),
  sixthFormType: text("sixth_form_type"),
  numberOnRoll: integer("number_on_roll"),
  ofstedRating: text("ofsted_rating"),
  lastInspectionDate: text("last_inspection_date"),
  fsmPercent: real("fsm_percent"),
  senSupportPercent: real("sen_support_percent"),
  ehcpPercent: real("ehcp_percent"),
  attendancePercent: real("attendance_percent"),
  persistentAbsencePercent: real("persistent_absence_percent"),
  suspensionPercent: real("suspension_percent"),
  permanentExclusionPercent: real("permanent_exclusion_percent"),
  resourcedProvisionFlag: boolean("resourced_provision_flag"),
  senUnitFlag: boolean("sen_unit_flag"),
  alternativeProvisionFlag: boolean("alternative_provision_flag"),
  trustType: text("trust_type"),
  numberOfSchools: integer("number_of_schools"),
  ceo: text("ceo"),
  educationLead: text("education_lead"),
  safeguardingLead: text("safeguarding_lead"),
  sector: text("sector"),
  csrPriority: text("csr_priority"),
  employeeVolunteeringInterest: boolean("employee_volunteering_interest"),
  deliveryStatus: text("delivery_status"),
  engagementScore: integer("engagement_score"),
  priority: text("priority"),
  headteacher: text("headteacher"),
  dsl: text("dsl"),
  senco: text("senco"),
  headOfSixthForm: text("head_of_sixth_form"),
  careersLead: text("careers_lead"),
  tags: text("tags").array(),
  source: text("source"),
  needsSummary: text("needs_summary"),
  distanceFromProjectSite: real("distance_from_project_site"),
}, (table) => ({
  idxName: index("idx_organizations_name").on(table.tenantId, table.name),
}));

export const insertOrganizationSchema = createInsertSchema(organizationsTable).omit({ createdAt: true, updatedAt: true });
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type Organization = typeof organizationsTable.$inferSelect;
