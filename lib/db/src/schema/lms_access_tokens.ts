import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { usersTable } from "./users";

export const lmsAccessTokensTable = pgTable("lms_access_tokens", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id),
  tokenHash: text("token_hash").notNull().unique(),
  tokenType: text("token_type").notNull(), // teacher_feedback | student_survey | parent_survey | student_report
  scopeType: text("scope_type").notNull(), // student | organisation
  scopeId: text("scope_id").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdBy: text("created_by").notNull().references(() => usersTable.id),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  useCount: integer("use_count").notNull().default(0),
  maxUses: integer("max_uses").notNull().default(5),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertLmsAccessTokenSchema = createInsertSchema(lmsAccessTokensTable).omit({ createdAt: true });
export type InsertLmsAccessToken = z.infer<typeof insertLmsAccessTokenSchema>;
export type LmsAccessToken = typeof lmsAccessTokensTable.$inferSelect;
