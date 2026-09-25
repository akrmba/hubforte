import { pgTable, text, timestamp, boolean, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const webhookDeliveryLogTable = pgTable("webhook_delivery_log", {
  id: text("id").primaryKey(),
  webhookId: text("webhook_id").notNull(),
  tenantId: text("tenant_id").notNull(),
  eventType: text("event_type").notNull(),
  success: boolean("success").notNull().default(false),
  statusCode: integer("status_code"),
  requestBody: jsonb("request_body"),
  responseBody: text("response_body"),
  attemptCount: integer("attempt_count").notNull().default(1),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertWebhookDeliveryLogSchema = createInsertSchema(webhookDeliveryLogTable).omit({ createdAt: true });
export type InsertWebhookDeliveryLog = z.infer<typeof insertWebhookDeliveryLogSchema>;
export type WebhookDeliveryLog = typeof webhookDeliveryLogTable.$inferSelect;
