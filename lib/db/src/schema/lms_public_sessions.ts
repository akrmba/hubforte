import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { lmsAccessTokensTable } from "./lms_access_tokens";

export const lmsPublicSessionsTable = pgTable("lms_public_sessions", {
  id: text("id").primaryKey(), // session ID set in cookie
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id),
  tokenId: text("token_id").references(() => lmsAccessTokensTable.id), // nullable: code-based sessions have no backing token
  tokenType: text("token_type").notNull(),
  scopeType: text("scope_type").notNull(),
  scopeId: text("scope_id").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertLmsPublicSessionSchema = createInsertSchema(lmsPublicSessionsTable).omit({ createdAt: true });
export type InsertLmsPublicSession = z.infer<typeof insertLmsPublicSessionSchema>;
export type LmsPublicSession = typeof lmsPublicSessionsTable.$inferSelect;
