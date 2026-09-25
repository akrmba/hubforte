import { pgTable, text, timestamp, pgEnum, jsonb, integer } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

export const exportStatusEnum = pgEnum("export_status", [
  "PENDING", "PROCESSING", "COMPLETE", "FAILED"
]);

export const exportJobsTable = pgTable("export_jobs", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").references(() => tenantsTable.id).notNull(),
  exportType: text("export_type").notNull(), // "full" | entity name
  format: text("format").notNull().default("zip"), // "zip" | "csv" | "json"
  status: exportStatusEnum("status").notNull().default("PENDING"),
  totalRows: integer("total_rows").default(0),
  fileSize: integer("file_size"), // bytes
  downloadToken: text("download_token"),
  expiresAt: timestamp("expires_at"),
  error: text("error"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});
