/**
 * Field History Middleware — Task 7.4
 * Tracks field-level changes for configured entities.
 * Only tracks fields listed in TRACKED_FIELDS per entity type.
 */
import { db, fieldHistoryTable } from "@workspace/db";
import { generateId } from "./id";

// Fields tracked per entity type — safeguarding fields excluded (handled by dedicated routes)
const TRACKED_FIELDS: Record<string, string[]> = {
  organizations: ["name", "status", "relationshipStatus", "engagementScore", "ofstedRating"],
  contacts: ["status", "email", "phone", "jobTitle", "relationshipStrength"],
  students: ["completionStatus", "consentStatus"],
  volunteers: ["dbsStatus", "recruitmentStage", "active"],
  funding_opportunities: ["status", "amount", "deadline", "pipelineStage"],
  consent_records: ["status", "withdrawnDate", "expiryDate"],
};

export async function recordFieldHistory(opts: {
  tenantId: string;
  entityType: string;
  entityId: string;
  oldRecord: Record<string, any>;
  newRecord: Record<string, any>;
  changedBy: string;
}): Promise<void> {
  const fields = TRACKED_FIELDS[opts.entityType];
  if (!fields) return;

  const inserts: Array<{
    id: string; tenantId: string; entityType: string; entityId: string;
    fieldName: string; oldValue: string | null; newValue: string | null; changedBy: string;
  }> = [];
  for (const field of fields) {
    const oldVal = opts.oldRecord[field];
    const newVal = opts.newRecord[field];
    if (oldVal !== newVal && newVal !== undefined) {
      inserts.push({
        id: generateId("fh"),
        tenantId: opts.tenantId,
        entityType: opts.entityType,
        entityId: opts.entityId,
        fieldName: field,
        oldValue: oldVal != null ? String(oldVal) : null,
        newValue: newVal != null ? String(newVal) : null,
        changedBy: opts.changedBy,
      });
    }
  }

  if (inserts.length > 0) {
    // Fire-and-forget — never block the caller
    setImmediate(async () => {
      try {
        for (const insert of inserts) {
          await db.insert(fieldHistoryTable).values(insert);
        }
      } catch {
        // Field history failure must never affect the original operation
      }
    });
  }
}
