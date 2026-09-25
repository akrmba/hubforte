import { pgTable, text, integer, boolean, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { studentsTable } from "./students";
import { usersTable } from "./users";

export const lmsTalentScoresTable = pgTable("lms_talent_scores", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id),
  studentId: text("student_id").notNull().references(() => studentsTable.id),
  raterType: text("rater_type").notNull(), // student | coach | teacher
  timePoint: text("time_point").notNull(), // pre | end | forward_to_future
  confidence: integer("confidence"),
  resilience: integer("resilience"),
  communication: integer("communication"),
  selfAwareness: integer("self_awareness"),
  submittedBy: text("submitted_by").references(() => usersTable.id),
  submittedViaToken: text("submitted_via_token"), // FK to lms_access_tokens.id — no circular ref at schema level
  isComplete: boolean("is_complete").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  unique("lms_talent_scores_student_rater_timepoint").on(t.studentId, t.raterType, t.timePoint),
]);

export const insertLmsTalentScoreSchema = createInsertSchema(lmsTalentScoresTable).omit({ createdAt: true, updatedAt: true });
export type InsertLmsTalentScore = z.infer<typeof insertLmsTalentScoreSchema>;
export type LmsTalentScore = typeof lmsTalentScoresTable.$inferSelect;
