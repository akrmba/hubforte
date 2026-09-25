import { pgTable, text, integer, boolean, timestamp, pgEnum, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { usersTable } from "./users";

export const storageProviderEnum = pgEnum("storage_provider", ["LOCAL", "S3", "AZURE_BLOB", "GOOGLE_CLOUD_STORAGE"]);
export const attachmentCategoryEnum = pgEnum("attachment_category", ["DOCUMENT", "IMAGE", "AUDIO", "VIDEO", "ARCHIVE", "OTHER"]);

export const attachmentsTable = pgTable("attachments", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").references(() => tenantsTable.id),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  fileName: text("file_name").notNull(),
  fileType: text("file_type").notNull(),
  fileSize: integer("file_size").notNull(),
  storagePath: text("storage_path").notNull(),
  storageProvider: storageProviderEnum("storage_provider").notNull().default("LOCAL"),
  category: attachmentCategoryEnum("category").notNull().default("DOCUMENT"),
  description: text("description"),
  uploadedByUserId: text("uploaded_by_user_id").notNull().references(() => usersTable.id),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  isPublic: boolean("is_public").default(false),
  accessControl: jsonb("access_control").default({}),
  metadata: jsonb("metadata").default({}),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAttachmentSchema = createInsertSchema(attachmentsTable).omit({ createdAt: true, updatedAt: true });
export type InsertAttachment = z.infer<typeof insertAttachmentSchema>;
export type Attachment = typeof attachmentsTable.$inferSelect;