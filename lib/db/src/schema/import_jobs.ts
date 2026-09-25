import { pgTable, text, timestamp, pgEnum, jsonb, integer } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

export const importStatusEnum = pgEnum("import_status", [
  "PENDING", "VALIDATING", "PROCESSING", "COMPLETE", "FAILED"
]);

export const importJobsTable = pgTable("import_jobs", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").references(() => tenantsTable.id).notNull(),
  entityType: text("entity_type").notNull(),
  source: text("source").default("csv"),
  fileName: text("file_name"),
  status: importStatusEnum("status").notNull().default("PENDING"),
  totalRows: integer("total_rows").default(0),
  processedRows: integer("processed_rows").default(0),
  successRows: integer("success_rows").default(0),
  errorRows: integer("error_rows").default(0),
  skippedRows: integer("skipped_rows").default(0),
  duplicateAction: text("duplicate_action").default("skip"),
  fieldMapping: jsonb("field_mapping"),
  errors: jsonb("errors"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});
