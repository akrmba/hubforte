import { pgTable, text, boolean, timestamp, pgEnum, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { studentsTable } from "./students";

export const relationshipTypeEnum = pgEnum("relationship_type", ["PARENT", "GUARDIAN", "GRANDPARENT", "SIBLING", "OTHER"]);
export const contactMethodEnum = pgEnum("contact_method", ["EMAIL", "PHONE_MOBILE", "PHONE_HOME", "PHONE_WORK", "POST"]);

export const parentGuardiansTable = pgTable("parent_guardians", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").references(() => tenantsTable.id),
  studentId: text("student_id").notNull().references(() => studentsTable.id),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  relationship: relationshipTypeEnum("relationship").notNull(),
  isPrimaryContact: boolean("is_primary_contact").default(false),
  isEmergencyContact: boolean("is_emergency_contact").default(false),
  email: text("email"),
  phoneMobile: text("phone_mobile"),
  phoneHome: text("phone_home"),
  phoneWork: text("phone_work"),
  addressLine1: text("address_line1"),
  addressLine2: text("address_line2"),
  city: text("city"),
  postcode: text("postcode"),
  preferredContactMethod: contactMethodEnum("preferred_contact_method"),
  preferredContactTime: text("preferred_contact_time"),
  communicationPreferences: jsonb("communication_preferences").default({}),
  notes: text("notes"),
  metadata: jsonb("metadata").default({}),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertParentGuardianSchema = createInsertSchema(parentGuardiansTable).omit({ createdAt: true, updatedAt: true });
export type InsertParentGuardian = z.infer<typeof insertParentGuardianSchema>;
export type ParentGuardian = typeof parentGuardiansTable.$inferSelect;