/**
 * Import Routes — Phase 9 (Tasks 9.1, 9.2, 9.3) + Phase 2A (Client Import System)
 * GIAS bulk import, Ofsted enrichment, generic CSV import, file upload wizard
 */
import { Router, type IRouter } from "express";
import { db, organizationsTable, contactsTable, studentsTable, volunteersTable, importJobsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { authMiddleware, requireRole, denyDevRoles } from "../lib/auth";
import { generateId } from "../lib/id";
import { sanitiseInput } from "../lib/sanitise";
import { checkModuleEnabled } from "../lib/featureFlags";
import { createNotification } from "../lib/notifications";
import { autoMapHeaders, ENTITY_REQUIRED_FIELDS, ENTITY_FIELDS, IMPORT_PRESETS } from "../lib/importMappings";
import multer from "multer";
import { parse } from "csv-parse/sync";
import * as fs from "fs";
import * as path from "path";

const router: IRouter = Router();

// ── Field whitelists — prevent caller-supplied crmField from touching protected columns ──
const ALLOWED_CONTACT_FIELDS = [
  'firstName', 'lastName', 'email', 'phone', 'mobile', 'role',
  'department', 'status', 'notes',
  'organizationId', 'ownerId', 'organizationName',
];
const ALLOWED_ORGANIZATION_FIELDS = [
  'name', 'type', 'website', 'phone', 'email', 'region',
  'notes', 'address', 'country', 'postcode', 'status',
];
const ALLOWED_DEAL_FIELDS = [
  'name', 'value', 'stage', 'status', 'expectedCloseDate', 'probability',
  'notes', 'organizationId', 'contactId', 'ownerId', 'organizationName',
];
const ALLOWED_ACTIVITY_FIELDS = [
  'type', 'subject', 'notes', 'dueDate', 'status',
  'contactId', 'organizationId', 'dealId', 'ownerId',
];
const ALLOWED_STUDENT_FIELDS = [
  'firstName', 'lastName', 'email', 'phone', 'status', 'notes',
  'yearGroup', 'gender', 'postcodePrefix', 'primaryNeed',
  'referralReason', 'referralSource', 'referralDate',
  'organizationId', 'organizationName', 'ownerId',
];
const ALLOWED_VOLUNTEER_FIELDS = [
  'firstName', 'lastName', 'email', 'phone', 'status', 'notes',
  'postcode', 'region', 'employer', 'industryBackground',
  'organizationId', 'organizationName', 'ownerId',
];
const PROTECTED_FIELDS = ['tenantId', 'id', 'createdAt', 'updatedAt', 'deletedAt', 'isDeleted'];

const ALLOWED_FIELDS_BY_ENTITY: Record<string, string[]> = {
  contacts: ALLOWED_CONTACT_FIELDS,
  organizations: ALLOWED_ORGANIZATION_FIELDS,
  deals: ALLOWED_DEAL_FIELDS,
  activities: ALLOWED_ACTIVITY_FIELDS,
  students: ALLOWED_STUDENT_FIELDS,
  volunteers: ALLOWED_VOLUNTEER_FIELDS,
};

function sanitiseFieldMapping(
  fieldMapping: Array<{ csvColumn: string; crmField: string }>,
  entityType: string,
): Array<{ csvColumn: string; crmField: string }> {
  const allowed = ALLOWED_FIELDS_BY_ENTITY[entityType] ?? [];
  const blocked: string[] = [];
  const safe = fieldMapping.filter(m => {
    if (PROTECTED_FIELDS.includes(m.crmField)) { blocked.push(m.crmField); return false; }
    return allowed.includes(m.crmField);
  });
  if (blocked.length > 0) {
    console.warn(`[import] SECURITY: blocked attempt to map protected fields: ${blocked.join(', ')} (entityType=${entityType})`);
  }
  return safe;
}

const upload = multer({
  dest: "uploads/imports/",
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, ext === ".csv");
  },
});

const uploadStore = new Map<string, { filePath: string; headers: string[]; rows: any[]; fileName: string; tenantId: string; createdAt: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of uploadStore) {
    if (now - entry.createdAt > 30 * 60 * 1000) {
      try { fs.unlinkSync(entry.filePath); } catch {}
      uploadStore.delete(id);
    }
  }
}, 5 * 60 * 1000);

// ── 2A: Upload file and parse headers ──────────────────────────────────────
router.post("/upload", authMiddleware, denyDevRoles, requireRole("ADMIN"), upload.single("file"), async (req, res): Promise<void> => {
  const user = req.user!;
  if (!user.tenantId) { res.status(403).json({ error: "No tenant assigned" }); return; }
  if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }

  try {
    const content = fs.readFileSync(req.file.path, "utf-8");
    const rows = parse(content, { columns: true, skip_empty_lines: true, trim: true, relax_column_count: true }) as any[];

    if (!rows.length) {
      fs.unlinkSync(req.file.path);
      res.status(400).json({ error: "File is empty or has no data rows" });
      return;
    }

    const headers = Object.keys(rows[0]);
    const fileId = generateId("imp");

    uploadStore.set(fileId, {
      filePath: req.file.path,
      headers,
      rows,
      fileName: req.file.originalname,
      tenantId: user.tenantId,
      createdAt: Date.now(),
    });

    res.json({
      fileId,
      headers,
      preview: rows.slice(0, 5),
      totalRows: rows.length,
      fileName: req.file.originalname,
    });
  } catch (err: any) {
    try { fs.unlinkSync(req.file.path); } catch {}
    res.status(400).json({ error: `Failed to parse file: ${err.message}` });
  }
});

// ── 2A: Get mapping presets ────────────────────────────────────────────────
router.get("/presets", authMiddleware, denyDevRoles, async (_req, res): Promise<void> => {
  res.json(IMPORT_PRESETS.map(p => ({ name: p.name, slug: p.slug, description: p.description })));
});

// ── 2A: Auto-map headers ───────────────────────────────────────────────────
router.post("/auto-map", authMiddleware, denyDevRoles, async (req, res): Promise<void> => {
  const { fileId, entityType, presetSlug } = req.body;
  const entry = uploadStore.get(fileId);
  if (!entry) { res.status(404).json({ error: "File not found or expired. Please re-upload." }); return; }

  const mappings = autoMapHeaders(entry.headers, entityType, presetSlug);
  const availableFields = ENTITY_FIELDS[entityType] || [];
  const requiredFields = ENTITY_REQUIRED_FIELDS[entityType] || [];

  res.json({ mappings, availableFields, requiredFields });
});

// ── 2A: Validate import data ───────────────────────────────────────────────
router.post("/validate", authMiddleware, denyDevRoles, requireRole("ADMIN"), async (req, res): Promise<void> => {
  const user = req.user!;
  if (!user.tenantId) { res.status(403).json({ error: "No tenant assigned" }); return; }

  const { fileId, entityType, fieldMapping } = req.body as {
    fileId: string;
    entityType: string;
    fieldMapping: Array<{ csvColumn: string; crmField: string }>;
  };

  const entry = uploadStore.get(fileId);
  if (!entry) { res.status(404).json({ error: "File not found or expired. Please re-upload." }); return; }
  if (entry.tenantId !== user.tenantId) { res.status(403).json({ error: "Access denied" }); return; }

  const required = ENTITY_REQUIRED_FIELDS[entityType];
  if (!required) { res.status(400).json({ error: `Unsupported entity type: ${entityType}` }); return; }

  const mappedFields = new Set(fieldMapping.map(m => m.crmField));
  const missingRequired = required.filter(f => !mappedFields.has(f));
  if (missingRequired.length > 0) {
    res.status(400).json({ error: `Required fields not mapped: ${missingRequired.join(", ")}` });
    return;
  }

  const errors: Array<{ row: number; field: string; message: string }> = [];
  const duplicates: Array<{ row: number; matchedField: string; value: string }> = [];
  let validRows = 0;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const dateFields = new Set(["expectedCloseDate", "dueDate", "date", "lastInspectionDate"]);

  for (let i = 0; i < entry.rows.length; i++) {
    const raw = entry.rows[i];
    let rowValid = true;

    const mapped: Record<string, string> = {};
    for (const fm of fieldMapping) {
      mapped[fm.crmField] = raw[fm.csvColumn]?.toString().trim() || "";
    }

    for (const rf of required) {
      if (!mapped[rf]) {
        errors.push({ row: i + 1, field: rf, message: `Required field "${rf}" is empty` });
        rowValid = false;
      }
    }

    if (mapped.email && !emailRegex.test(mapped.email)) {
      errors.push({ row: i + 1, field: "email", message: `Invalid email format: "${mapped.email}"` });
      rowValid = false;
    }

    for (const [field, value] of Object.entries(mapped)) {
      if (value && dateFields.has(field)) {
        const d = new Date(value);
        if (isNaN(d.getTime())) {
          errors.push({ row: i + 1, field, message: `Invalid date format for "${field}": "${value}"` });
          rowValid = false;
        }
      }
    }

    if (mapped.email && entityType === "contacts") {
      const [existing] = await db.select({ id: contactsTable.id })
        .from(contactsTable)
        .where(and(eq(contactsTable.tenantId, user.tenantId!), eq(contactsTable.email, mapped.email)))
        .limit(1);
      if (existing) {
        duplicates.push({ row: i + 1, matchedField: "email", value: mapped.email });
      }
    }

    if (mapped.name && entityType === "organizations") {
      const [existing] = await db.select({ id: organizationsTable.id })
        .from(organizationsTable)
        .where(and(eq(organizationsTable.tenantId, user.tenantId!), eq(organizationsTable.name, mapped.name)))
        .limit(1);
      if (existing) {
        duplicates.push({ row: i + 1, matchedField: "name", value: mapped.name });
      }
    }

    // For students: verify organizationName resolves to a real org in this tenant
    if (entityType === "students" && mapped.organizationName) {
      const [org] = await db.select({ id: organizationsTable.id })
        .from(organizationsTable)
        .where(and(eq(organizationsTable.tenantId, user.tenantId!), eq(organizationsTable.name, mapped.organizationName)))
        .limit(1);
      if (!org) {
        errors.push({ row: i + 1, field: "organizationName", message: `Organisation "${mapped.organizationName}" not found in your account. Import the organisation first.` });
        rowValid = false;
      }
    }

    if (rowValid) validRows++;
  }

  res.json({
    totalRows: entry.rows.length,
    validRows,
    errorRows: errors.length,
    duplicateRows: duplicates.length,
    errors: errors.slice(0, 50),
    duplicates: duplicates.slice(0, 50),
  });
});

// ── 2A: Execute import ─────────────────────────────────────────────────────
router.post("/execute", authMiddleware, denyDevRoles, requireRole("ADMIN"), async (req, res): Promise<void> => {
  const user = req.user!;
  if (!user.tenantId) { res.status(403).json({ error: "No tenant assigned" }); return; }

  const { fileId, entityType, fieldMapping: rawFieldMapping, duplicateAction = "skip" } = req.body as {
    fileId: string;
    entityType: string;
    fieldMapping: Array<{ csvColumn: string; crmField: string }>;
    duplicateAction: "skip" | "update" | "create";
  };

  const entry = uploadStore.get(fileId);
  if (!entry) { res.status(404).json({ error: "File not found or expired. Please re-upload." }); return; }
  if (entry.tenantId !== user.tenantId) { res.status(403).json({ error: "Access denied" }); return; }

  // FIX 1: sanitise field mapping against server-side whitelist before any DB operation
  const fieldMapping = sanitiseFieldMapping(rawFieldMapping, entityType);

  const MAX_IMPORT_ROWS = parseInt(process.env.MAX_IMPORT_ROWS || "5000");
  if (entry.rows.length > MAX_IMPORT_ROWS) {
    res.status(413).json({
      error: true,
      code: "IMPORT_TOO_LARGE",
      message: `This import contains ${entry.rows.length.toLocaleString()} rows, which exceeds the current limit of ${MAX_IMPORT_ROWS.toLocaleString()} rows. Please split your file into smaller batches and import each one separately. Contact support if you need to import larger datasets.`,
    });
    return;
  }

  const jobId = generateId("job");

  await db.insert(importJobsTable).values({
    id: jobId,
    tenantId: user.tenantId,
    entityType,
    source: "csv",
    fileName: entry.fileName,
    status: "PROCESSING",
    totalRows: entry.rows.length,
    duplicateAction,
    fieldMapping: fieldMapping as any,
    createdBy: user.id,
  });

  res.json({ jobId });

  // Process in background (non-blocking)
  processImport(jobId, entry, entityType, fieldMapping, duplicateAction, user).catch(() => {});
});

async function processImport(
  jobId: string,
  entry: { rows: any[]; tenantId: string },
  entityType: string,
  fieldMapping: Array<{ csvColumn: string; crmField: string }>,
  duplicateAction: string,
  user: { id: string; tenantId: string | null },
) {
  const SUPPORTED = ["organizations", "contacts", "students", "volunteers"];
  if (!SUPPORTED.includes(entityType)) {
    await db.update(importJobsTable)
      .set({ status: "FAILED", errors: [{ message: `Entity type "${entityType}" is not supported for import yet.` }] as any, completedAt: new Date() })
      .where(eq(importJobsTable.id, jobId));
    return;
  }

  const tableMap: Record<string, any> = {
    organizations: organizationsTable,
    contacts: contactsTable,
    students: studentsTable,
    volunteers: volunteersTable,
  };
  const table = tableMap[entityType];

  let processed = 0, success = 0, errorCount = 0, skipped = 0;
  const errors: Array<{ row: number; message: string }> = [];

  for (let i = 0; i < entry.rows.length; i++) {
    const raw = entry.rows[i];
    const mapped: Record<string, any> = {};
    for (const fm of fieldMapping) {
      const val = raw[fm.csvColumn]?.toString().trim();
      if (val) mapped[fm.crmField] = val;
    }

    try {
      // Resolve organizationName → organizationId for contacts
      if (entityType === "contacts" && mapped.organizationName) {
        const [org] = await db.select({ id: organizationsTable.id })
          .from(organizationsTable)
          .where(and(eq(organizationsTable.tenantId, user.tenantId!), eq(organizationsTable.name, mapped.organizationName)))
          .limit(1);
        if (org) {
          mapped.organizationId = org.id;
        } else {
          errorCount++;
          errors.push({ row: i + 1, message: `Organisation not found: "${mapped.organizationName}". Import organisations first.` });
          processed++;
          continue;
        }
        delete mapped.organizationName;
      } else if (entityType !== "students" && entityType !== "volunteers") {
        // Strip organizationName for any other entity type that doesn't use it
        if (mapped.organizationName) delete mapped.organizationName;
      }

      // Duplicate detection using application logic (not relying on DB constraint)
      let existingId: string | null = null;
      if (entityType === "contacts" && mapped.email) {
        const [ex] = await db.select({ id: contactsTable.id })
          .from(contactsTable)
          .where(and(eq(contactsTable.tenantId, user.tenantId!), eq(contactsTable.email, mapped.email)))
          .limit(1);
        if (ex) existingId = ex.id;
      } else if (entityType === "organizations" && mapped.name) {
        const [ex] = await db.select({ id: organizationsTable.id })
          .from(organizationsTable)
          .where(and(eq(organizationsTable.tenantId, user.tenantId!), eq(organizationsTable.name, mapped.name)))
          .limit(1);
        if (ex) existingId = ex.id;
      }

      if (existingId) {
        if (duplicateAction === "skip") {
          skipped++;
          processed++;
          continue;
        } else if (duplicateAction === "update") {
          const sanitised = sanitiseInput(mapped);
          await db.update(table).set({ ...sanitised, updatedAt: new Date() } as any).where(eq(table.id, existingId));
          success++;
          processed++;
          if (processed % 100 === 0) {
            await db.update(importJobsTable)
              .set({ processedRows: processed, successRows: success, errorRows: errorCount, skippedRows: skipped })
              .where(eq(importJobsTable.id, jobId));
          }
          continue;
        }
        // duplicateAction === "create" falls through to insert below
      }

      const sanitised = sanitiseInput(mapped);

      // Supply required defaults for organizations
      const insertValues: Record<string, any> = {
        ...sanitised,
        id: generateId(entityType.slice(0, 3)),
        tenantId: user.tenantId,
        createdBy: user.id,
      };
      if (entityType === "organizations") {
        if (!insertValues.type) insertValues.type = "OTHER";
        if (!insertValues.ownerId) insertValues.ownerId = user.id;
      }
      // Resolve organizationName → organizationId for students/volunteers
      if ((entityType === "students" || entityType === "volunteers") && insertValues.organizationName) {
        const [org] = await db.select({ id: organizationsTable.id })
          .from(organizationsTable)
          .where(and(eq(organizationsTable.tenantId, user.tenantId!), eq(organizationsTable.name, insertValues.organizationName)))
          .limit(1);
        if (org) {
          insertValues.organizationId = org.id;
        } else {
          // students.organizationId is NOT NULL — must resolve or fail the row explicitly
          const [anyOrg] = await db.select({ id: organizationsTable.id })
            .from(organizationsTable)
            .where(eq(organizationsTable.tenantId, user.tenantId!))
            .limit(1);
          if (anyOrg) {
            errorCount++;
            errors.push({ row: i + 1, message: `Organisation not found: "${insertValues.organizationName}". Import organisations first.` });
            processed++;
            continue;
          }
          // Fresh tenant with no orgs — fail the row; students require an org
          errorCount++;
          errors.push({ row: i + 1, message: `Organisation not found: "${insertValues.organizationName}". No organisations exist yet — import organisations first.` });
          processed++;
          continue;
        }
        delete insertValues.organizationName;
      }

      await db.insert(table).values(insertValues);
      success++;
    } catch (err: any) {
      errorCount++;
      errors.push({ row: i + 1, message: err.message });
    }

    processed++;

    if (processed % 100 === 0) {
      await db.update(importJobsTable)
        .set({ processedRows: processed, successRows: success, errorRows: errorCount, skippedRows: skipped })
        .where(eq(importJobsTable.id, jobId));
    }
  }

  await db.update(importJobsTable)
    .set({
      status: errorCount > 0 && success === 0 ? "FAILED" : "COMPLETE",
      processedRows: processed,
      successRows: success,
      errorRows: errorCount,
      skippedRows: skipped,
      errors: errors.slice(0, 100) as any,
      completedAt: new Date(),
    })
    .where(eq(importJobsTable.id, jobId));

  await createNotification({
    userId: user.id,
    tenantId: user.tenantId!,
    title: `Import complete: ${entityType}`,
    message: `${success} imported, ${skipped} skipped, ${errorCount} errors out of ${entry.rows.length} rows`,
    type: errorCount > 0 ? "WARNING" : "INFO",
  });
}

// ── 2A: Get import job status ──────────────────────────────────────────────
// FIX 2: alias /status/:jobId so both documented paths work
async function getImportJobStatusHandler(req: any, res: any): Promise<void> {
  const user = req.user!;
  if (!user.tenantId) { res.status(403).json({ error: "No tenant assigned" }); return; }

  const [job] = await db.select()
    .from(importJobsTable)
    .where(and(eq(importJobsTable.id, String(req.params.jobId)), user.tenantId ? eq(importJobsTable.tenantId, user.tenantId) : undefined))
    .limit(1);

  if (!job) { res.status(404).json({ error: "Import job not found" }); return; }

  res.json({
    id: job.id,
    status: job.status,
    entityType: job.entityType,
    fileName: job.fileName,
    totalRows: job.totalRows,
    processedRows: job.processedRows,
    successRows: job.successRows,
    errorRows: job.errorRows,
    skippedRows: job.skippedRows,
    errors: job.errors,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
  });
}

router.get("/jobs/:jobId", authMiddleware, denyDevRoles, getImportJobStatusHandler);
router.get("/status/:jobId", authMiddleware, denyDevRoles, getImportJobStatusHandler);

// ── 2A: Import history ─────────────────────────────────────────────────────
router.get("/history", authMiddleware, denyDevRoles, async (req, res): Promise<void> => {
  const user = req.user!;
  if (!user.tenantId) { res.status(403).json({ error: "No tenant assigned" }); return; }

  const jobs = await db.select()
    .from(importJobsTable)
    .where(eq(importJobsTable.tenantId, user.tenantId))
    .orderBy(desc(importJobsTable.createdAt))
    .limit(20);

  res.json(jobs.map(j => ({
    id: j.id,
    entityType: j.entityType,
    fileName: j.fileName,
    status: j.status,
    totalRows: j.totalRows,
    successRows: j.successRows,
    errorRows: j.errorRows,
    skippedRows: j.skippedRows,
    createdAt: j.createdAt,
    completedAt: j.completedAt,
  })));
});

export default router;
