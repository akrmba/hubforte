import { pgTable, text, timestamp, pgEnum, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const campaignStatusEnum = pgEnum("campaign_status", ["DRAFT", "SCHEDULED", "SENDING", "SENT", "PAUSED"]);
export const sendStatusEnum = pgEnum("send_status", ["PENDING", "SENT", "FAILED", "REPLIED", "UNSUBSCRIBED"]);

export const campaignsTable = pgTable("campaigns", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").references(() => tenantsTable.id),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  bodyTemplate: text("body_template").notNull(),
  status: campaignStatusEnum("status").notNull().default("DRAFT"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  ownerId: text("owner_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const campaignContactsTable = pgTable("campaign_contacts", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").references(() => tenantsTable.id),
  campaignId: text("campaign_id").notNull(),
  contactId: text("contact_id").notNull(),
  status: sendStatusEnum("status").notNull().default("PENDING"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  error: text("error"),
});

export const outboundEmailsTable = pgTable("outbound_emails", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").references(() => tenantsTable.id),
  campaignId: text("campaign_id"),
  contactId: text("contact_id"),
  userId: text("user_id").notNull(),
  toEmail: text("to_email").notNull(),
  subject: text("subject").notNull(),
  bodySnapshot: text("body_snapshot").notNull(),
  status: sendStatusEnum("status").notNull(),
  gmailMessageId: text("gmail_message_id"),
  gmailThreadId: text("gmail_thread_id"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  error: text("error"),
  attachments: jsonb("attachments").$type<string[]>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCampaignSchema = createInsertSchema(campaignsTable).omit({ createdAt: true, updatedAt: true });
export type InsertCampaign = z.infer<typeof insertCampaignSchema>;
export type Campaign = typeof campaignsTable.$inferSelect;

export const insertCampaignContactSchema = createInsertSchema(campaignContactsTable);
export type InsertCampaignContact = z.infer<typeof insertCampaignContactSchema>;
export type CampaignContact = typeof campaignContactsTable.$inferSelect;

export const insertOutboundEmailSchema = createInsertSchema(outboundEmailsTable).omit({ createdAt: true });
export type InsertOutboundEmail = z.infer<typeof insertOutboundEmailSchema>;
export type OutboundEmail = typeof outboundEmailsTable.$inferSelect;
