import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const aiConfigTable = pgTable("ai_config", {
  key: text().primaryKey().notNull(),
  value: text().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  updatedBy: text("updated_by"),
});

export type AiConfig = typeof aiConfigTable.$inferSelect;
