import { pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const tenantsTable = pgTable("tenants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").unique().notNull(),
  domain: text("domain"),
  status: text("status").notNull().default("active"),
  plan: text("plan").notNull().default("trial"),
  active: boolean("active").notNull().default(true),
  suspended: boolean("suspended").notNull().default(false),
  settings: text("settings"),
  // Owner-controlled flags — only PLATFORM_OWNER / SUPER_ADMIN can enable these
  byokEnabled: boolean("byok_enabled").notNull().default(false),
  aiDiagnosisEnabled: boolean("ai_diagnosis_enabled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Tenant = typeof tenantsTable.$inferSelect;
