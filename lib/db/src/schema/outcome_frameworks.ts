import { pgTable, text, boolean, timestamp, pgEnum, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { programmesTable } from "./programmes";

export const scoringMethodEnum = pgEnum("scoring_method", ["RUBRIC", "LIKERT", "BINARY", "NUMERIC"]);
export const outcomeFrameworkStatusEnum = pgEnum("outcome_framework_status", ["DRAFT", "ACTIVE", "ARCHIVED"]);

export const outcomeFrameworksTable = pgTable("outcome_frameworks", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").references(() => tenantsTable.id),
  name: text("name").notNull(),
  description: text("description"),
  programmeId: text("programme_id").references(() => programmesTable.id),
  isPlatformDefault: boolean("is_platform_default").default(false),
  dimensions: jsonb("dimensions").default([]),
  metrics: jsonb("metrics").default([]),
  scoringMethod: scoringMethodEnum("scoring_method").notNull(),
  status: outcomeFrameworkStatusEnum("status").default("DRAFT"),
  metadata: jsonb("metadata").default({}),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertOutcomeFrameworkSchema = createInsertSchema(outcomeFrameworksTable).omit({ createdAt: true, updatedAt: true });
export type InsertOutcomeFramework = z.infer<typeof insertOutcomeFrameworkSchema>;
export type OutcomeFramework = typeof outcomeFrameworksTable.$inferSelect;