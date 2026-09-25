import { pgTable, text, boolean, timestamp, pgEnum, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const roleEnum = pgEnum("role", ["SUPER_ADMIN", "ADMIN", "MANAGER", "OPERATOR", "VIEWER", "DEVELOPER", "PLATFORM_BUILDER"]);

export const usersTable = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email").unique(),
  passwordHash: text("password_hash"),
  emailVerified: timestamp("email_verified", { withTimezone: true }),
  image: text("image"),
  role: roleEnum("role").notNull().default("OPERATOR"),
  active: boolean("active").notNull().default(true),
  gmailRefreshToken: text("gmail_refresh_token"),
  inviteToken: text("invite_token"),
  inviteTokenExpiresAt: timestamp("invite_token_expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  tenantId: text("tenant_id").references(() => tenantsTable.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  // Self-service registration
  verificationToken: text("verification_token"),
  verificationTokenExpiresAt: timestamp("verification_token_expires_at", { withTimezone: true }),
  status: text("status").default("active"),
  // 2FA / TOTP
  totpSecret: text("totp_secret"),
  totpEnabled: boolean("totp_enabled").default(false),
  totpPendingSecret: text("totp_pending_secret"),
  // Display-only job title
  jobTitle: text("job_title"),
  // Break-glass emergency account — suspended by default, activated via token
  isEmergencyAccount: boolean("is_emergency_account").notNull().default(false),
  emergencyActivatedAt: timestamp("emergency_activated_at", { withTimezone: true }),
}, (table) => ({
  idxEmail: index("idx_users_email").on(table.email),
}));

export const insertUserSchema = createInsertSchema(usersTable).omit({ createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
