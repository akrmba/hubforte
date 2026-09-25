/**
 * YesFutures default configuration seed — Task 9.5
 * Enables the correct modules and sets up default record types for YesFutures.
 * Run once during onboarding for the YesFutures tenant.
 */
import { db, tenantFeatureFlagsTable, recordTypeConfigsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { generateId } from "../lib/id";

const YES_FUTURES_MODULES = [
  "organisations", "contacts", "programmes", "cohorts", "sessions",
  "students", "outcomes", "volunteers", "placements", "funders",
  "pipeline", "outreach", "reports", "safeguarding", "consent_management",
  "school_enrichment", "attachments", "automation", "field_history",
];

const YES_FUTURES_RECORD_TYPES = [
  { entityType: "organizations", recordType: "SCHOOL", displayName: "School", isDefault: true },
  { entityType: "organizations", recordType: "TRUST", displayName: "Multi-Academy Trust", isDefault: false },
  { entityType: "organizations", recordType: "SPONSOR", displayName: "Corporate Sponsor", isDefault: false },
  { entityType: "programmes", recordType: "MENTORING", displayName: "Mentoring Programme", isDefault: true },
  { entityType: "programmes", recordType: "WORKSHOP", displayName: "Workshop Series", isDefault: false },
  { entityType: "programmes", recordType: "PLACEMENT", displayName: "Work Placement", isDefault: false },
];

export async function seedYesFuturesConfig(tenantId: string) {
  // Enable modules
  for (const moduleKey of YES_FUTURES_MODULES) {
    const [existing] = await db.select({ id: tenantFeatureFlagsTable.id })
      .from(tenantFeatureFlagsTable)
      .where(and(
        eq(tenantFeatureFlagsTable.tenantId, tenantId),
        eq(tenantFeatureFlagsTable.module, moduleKey),
      ))
      .limit(1);

    if (existing) {
      await db.update(tenantFeatureFlagsTable)
        .set({ enabled: true })
        .where(eq(tenantFeatureFlagsTable.id, existing.id));
    } else {
      await db.insert(tenantFeatureFlagsTable).values({
        id: generateId("tff"),
        tenantId,
        module: moduleKey,
        enabled: true,
      });
    }
  }

  // Seed record types
  for (const rt of YES_FUTURES_RECORD_TYPES) {
    const [existing] = await db.select({ id: recordTypeConfigsTable.id })
      .from(recordTypeConfigsTable)
      .where(and(
        eq(recordTypeConfigsTable.tenantId, tenantId),
        eq(recordTypeConfigsTable.entityType, rt.entityType),
        eq(recordTypeConfigsTable.recordType, rt.recordType),
      )).limit(1);

    if (!existing) {
      await db.insert(recordTypeConfigsTable).values({
        id: generateId("rtc"),
        tenantId,
        entityType: rt.entityType,
        recordType: rt.recordType,
        displayName: rt.displayName,
        isDefault: rt.isDefault,
        isActive: true,
        sortOrder: 0,
      });
    }
  }

  console.log(`YesFutures config seeded for tenant ${tenantId}`);
}
