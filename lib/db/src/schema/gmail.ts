import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const gmailCredentialsTable = pgTable("gmail_credentials", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").references(() => tenantsTable.id),
  userId: text("user_id").notNull().unique(),
  refreshToken: text("refresh_token").notNull(),
  accessToken: text("access_token"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertGmailCredentialSchema = createInsertSchema(gmailCredentialsTable).omit({ connectedAt: true, updatedAt: true });
export type InsertGmailCredential = z.infer<typeof insertGmailCredentialSchema>;
export type GmailCredential = typeof gmailCredentialsTable.$inferSelect;
