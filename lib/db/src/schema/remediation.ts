import { pgTable, text, boolean, integer, timestamp, pgEnum, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const remediationStatusEnum = pgEnum("remediation_status", ["PENDING_APPROVAL", "APPROVED", "REJECTED", "EXECUTED", "FAILED", "SKIPPED"]);

export const remediationPoliciesTable = pgTable("remediation_policies", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").references(() => tenantsTable.id),
  name: text("name").notNull().unique(),
  description: text("description").notNull(),
  trigger: text("trigger").notNull(),
  action: text("action").notNull(),
  isEnabled: boolean("is_enabled").notNull().default(false),
  requiresApproval: boolean("requires_approval").notNull().default(true),
  maxAutoRunsPerDay: integer("max_auto_runs_per_day").notNull().default(0),
  createdById: text("created_by_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const remediationRunsTable = pgTable("remediation_runs", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").references(() => tenantsTable.id),
  policyId: text("policy_id").notNull(),
  triggeredById: text("triggered_by_id"),
  status: remediationStatusEnum("status").notNull(),
  input: jsonb("input"),
  output: jsonb("output"),
  approvedById: text("approved_by_id"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  executedAt: timestamp("executed_at", { withTimezone: true }),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRemediationPolicySchema = createInsertSchema(remediationPoliciesTable).omit({ createdAt: true, updatedAt: true });
export type InsertRemediationPolicy = z.infer<typeof insertRemediationPolicySchema>;
export type RemediationPolicy = typeof remediationPoliciesTable.$inferSelect;

export const insertRemediationRunSchema = createInsertSchema(remediationRunsTable).omit({ createdAt: true });
export type InsertRemediationRun = z.infer<typeof insertRemediationRunSchema>;
export type RemediationRun = typeof remediationRunsTable.$inferSelect;
