import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const errorKnowledgeBaseTable = pgTable("error_knowledge_base", {
  id: text("id").primaryKey(),
  errorLogId: text("error_log_id"),
  errorPattern: text("error_pattern").notNull(),
  plainEnglish: text("plain_english"),
  fixSteps: text("fix_steps"),
  status: text("status").notNull().default("needs_investigation"),
  module: text("module"),
  occurrenceCount: integer("occurrence_count").notNull().default(1),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  fixedInVersion: text("fixed_in_version"),
  autoFixed: text("auto_fixed").default("no"),
  shareToken: text("share_token"),
  shareTokenCreatedAt: timestamp("share_token_created_at", { withTimezone: true }),
  sharedWithUserId: text("shared_with_user_id"),
  markedFixedAt: timestamp("marked_fixed_at", { withTimezone: true }),
  markedFixedBy: text("marked_fixed_by"),
  ownerNotifiedAt: timestamp("owner_notified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertErrorKnowledgeBaseSchema = createInsertSchema(errorKnowledgeBaseTable).omit({ createdAt: true, updatedAt: true });
export type InsertErrorKnowledgeBase = z.infer<typeof insertErrorKnowledgeBaseSchema>;
export type ErrorKnowledgeBase = typeof errorKnowledgeBaseTable.$inferSelect;
