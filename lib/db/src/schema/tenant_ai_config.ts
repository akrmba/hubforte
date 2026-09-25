import { pgTable, text, timestamp, real, boolean } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

export const tenantAiConfigTable = pgTable("tenant_ai_config", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().unique().references(() => tenantsTable.id),
  provider: text("provider").notNull(), // openai | anthropic | openrouter
  encryptedApiKey: text("encrypted_api_key").notNull(),
  model: text("model").notNull(),
  monthlyBudgetUSD: real("monthly_budget_usd").notNull().default(10),
  usageThisMonth: real("usage_this_month").notNull().default(0),
  usageResetAt: timestamp("usage_reset_at", { withTimezone: true }).notNull().defaultNow(),
  // Feature toggles
  emailComposerEnabled: boolean("email_composer_enabled").notNull().default(true),
  contactSummaryEnabled: boolean("contact_summary_enabled").notNull().default(true),
  leadScoreEnabled: boolean("lead_score_enabled").notNull().default(true),
  nextBestActionEnabled: boolean("next_best_action_enabled").notNull().default(true),
  navHelperEnabled: boolean("nav_helper_enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
