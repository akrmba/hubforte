import { pgTable, text, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { programmeSessionsTable } from "./programme_sessions";
import { studentsTable } from "./students";

export const attendanceStatusEnum = pgEnum("attendance_status", ["PRESENT", "ABSENT", "LATE", "EXCUSED", "WITHDRAWN"]);

export const sessionAttendanceTable = pgTable("session_attendance", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").references(() => tenantsTable.id),
  sessionId: text("session_id").notNull().references(() => programmeSessionsTable.id),
  studentId: text("student_id").notNull().references(() => studentsTable.id),
  attended: boolean("attended").default(false),
  attendanceStatus: attendanceStatusEnum("attendance_status").default("ABSENT"),
  notes: text("notes"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSessionAttendanceSchema = createInsertSchema(sessionAttendanceTable).omit({ createdAt: true });
export type InsertSessionAttendance = z.infer<typeof insertSessionAttendanceSchema>;
export type SessionAttendance = typeof sessionAttendanceTable.$inferSelect;
