/**
 * Export Routes — Part 2B (Universal Data Export)
 * Full ZIP export, per-entity export, download, and history.
 */
import { Router, type IRouter } from "express";
import {
  db,
  contactsTable,
  organizationsTable,
  volunteersTable,
  studentsTable,
  activitiesTable,
  notesTable,
  tasksTable,
  campaignsTable,
  fundersTable,
  fundingOpportunitiesTable,
  supportTicketsTable,
  programmesTable,
  programmeCohortsTable,
  outcomeRecordsTable,
  attachmentsTable,
  automationRulesTable,
  savedReportsTable,
  exportJobsTable,
} from "@workspace/db";
import { and, eq, desc, isNotNull, sql, count } from "drizzle-orm";
import { authMiddleware, requireRole, denyDevRoles } from "../lib/auth";
import { generateId } from "../lib/id";
import { createNotification } from "../lib/notifications";
import { logger } from "../lib/logger";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import archiver from "archiver";
import ExcelJS from "exceljs";

const router: IRouter = Router();

const EXPORTS_DIR = path.join(process.cwd(), "uploads", "exports");
if (!fs.existsSync(EXPORTS_DIR)) fs.mkdirSync(EXPORTS_DIR, { recursive: true });

const SMALL_EXPORT_THRESHOLD = 5000;

// ── Helpers ────────────────────────────────────────────────────────────────

function toCSV(rows: Record<string, any>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: any) => {
    if (v === null || v === undefined) return "";
    const s = String(v).replace(/"/g, '""');
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s}"` : s;
  };
  return [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ].join("\n");
}

async function toXLSX(rows: Record<string, any>[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Export");
  if (rows.length > 0) {
    ws.columns = Object.keys(rows[0]).map((key) => ({ header: key, key }));
    ws.addRows(rows);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function stripSafeguarding<T extends Record<string, any>>(row: T): T {
  const out = { ...row };
  delete out.safeguardingNotes;
  delete out.safeguarding_notes;
  delete out.isSafeguardingRelevant;
  return out as T;
}

const FULL_ENTITIES = [
  "contacts",
  "organizations",
  "activities",
  "notes",
  "tasks",
  "campaigns",
  "funders",
  "volunteers",
  "students",
  "opportunities",
  "support_tickets",
  "programmes",
  "cohorts",
  "outcomes",
  "attachments",
  "automation_rules",
  "saved_reports",
] as const;

type EntityName = typeof FULL_ENTITIES[number];

async function fetchEntity(entity: EntityName, tenantId: string): Promise<Record<string, any>[]> {
  const scope = (t: any) => eq(t.tenantId, tenantId);
  switch (entity) {
    case "contacts":      return (await db.select().from(contactsTable).where(scope(contactsTable))).map(stripSafeguarding);
    case "organizations": return (await db.select().from(organizationsTable).where(scope(organizationsTable))).map(stripSafeguarding);
    case "activities":    return (await db.select().from(activitiesTable).where(scope(activitiesTable))).map(stripSafeguarding);
    case "notes":         return (await db.select().from(notesTable).where(scope(notesTable))).map(stripSafeguarding);
    case "tasks":         return (await db.select().from(tasksTable).where(scope(tasksTable))).map(stripSafeguarding);
    case "campaigns":     return (await db.select().from(campaignsTable).where(scope(campaignsTable))).map(stripSafeguarding);
    case "funders":       return (await db.select().from(fundersTable).where(scope(fundersTable))).map(stripSafeguarding);
    case "volunteers":    return (await db.select().from(volunteersTable).where(scope(volunteersTable))).map(stripSafeguarding);
    case "students":      return (await db.select().from(studentsTable).where(scope(studentsTable))).map(stripSafeguarding);
    case "opportunities":    return (await db.select().from(fundingOpportunitiesTable).where(scope(fundingOpportunitiesTable))).map(stripSafeguarding);
    case "support_tickets":  return (await db.select().from(supportTicketsTable).where(scope(supportTicketsTable))).map(stripSafeguarding);
    case "programmes":       return (await db.select().from(programmesTable).where(scope(programmesTable))).map(stripSafeguarding);
    case "cohorts":          return (await db.select().from(programmeCohortsTable).where(scope(programmeCohortsTable))).map(stripSafeguarding);
    case "outcomes":         return (await db.select().from(outcomeRecordsTable).where(scope(outcomeRecordsTable))).map(stripSafeguarding);
    case "attachments":      return (await db.select().from(attachmentsTable).where(scope(attachmentsTable))).map(stripSafeguarding);
    case "automation_rules": return (await db.select().from(automationRulesTable).where(scope(automationRulesTable))).map(stripSafeguarding);
    case "saved_reports":    return (await db.select().from(savedReportsTable).where(scope(savedReportsTable))).map(stripSafeguarding);
  }
}

async function countEntity(entity: EntityName, tenantId: string): Promise<number> {
  const scope = (t: any) => eq(t.tenantId, tenantId);
  const tableMap: Record<EntityName, any> = {
    contacts: contactsTable, organizations: organizationsTable, activities: activitiesTable,
    notes: notesTable, tasks: tasksTable, campaigns: campaignsTable,
    funders: fundersTable, volunteers: volunteersTable, students: studentsTable,
    opportunities: fundingOpportunitiesTable, support_tickets: supportTicketsTable,
    programmes: programmesTable, cohorts: programmeCohortsTable, outcomes: outcomeRecordsTable,
    attachments: attachmentsTable, automation_rules: automationRulesTable, saved_reports: savedReportsTable,
  };
  const [row] = await db.select({ n: count() }).from(tableMap[entity]).where(scope(tableMap[entity]));
  return row?.n ?? 0;
}

const SCHEMA_JSON = {
  version: "1.0",
  description: "Hubforte data export schema",
  entities: {
    contacts: { description: "People associated with your organisations", keyFields: ["id", "firstName", "lastName", "email", "organizationId", "status", "createdAt"] },
    organizations: { description: "Schools, trusts, charities, and other organisations", keyFields: ["id", "name", "type", "status", "location", "email", "createdAt"] },
    activities: { description: "Logged interactions and touchpoints", keyFields: ["id", "type", "summary", "date", "contactId", "organizationId", "userId"] },
    notes: { description: "Free-text notes on contacts and organisations", keyFields: ["id", "content", "contactId", "organizationId", "createdBy", "createdAt"] },
    tasks: { description: "Action items and follow-ups", keyFields: ["id", "title", "status", "dueDate", "assignedTo", "contactId", "organizationId"] },
    campaigns: { description: "Email outreach campaigns", keyFields: ["id", "name", "status", "subject", "createdAt"] },
    funders: { description: "Funding organisations and grant bodies", keyFields: ["id", "name", "type", "status", "createdAt"] },
    volunteers: { description: "Volunteers linked to your programme", keyFields: ["id", "firstName", "lastName", "email", "organizationId", "dbsStatus"] },
    students: { description: "Students enrolled in programmes", keyFields: ["id", "firstName", "lastName", "yearGroup", "organizationId", "programmeId", "consentStatus"] },
    opportunities: { description: "Funding opportunities and pipeline deals", keyFields: ["id", "title", "status", "value", "organizationId", "createdAt"] },
    support_tickets: { description: "Support tickets raised by users", keyFields: ["id", "title", "status", "priority", "createdBy", "createdAt"] },
    programmes: { description: "Programmes delivered to students", keyFields: ["id", "name", "status", "startDate", "endDate", "createdAt"] },
    cohorts: { description: "Programme cohorts grouping students", keyFields: ["id", "name", "programmeId", "startDate", "endDate", "createdAt"] },
    outcomes: { description: "Outcome records linked to students or contacts", keyFields: ["id", "frameworkId", "contactId", "studentId", "value", "recordedAt"] },
    attachments: { description: "File attachments linked to records", keyFields: ["id", "fileName", "fileType", "fileSize", "linkedEntityType", "linkedEntityId", "createdAt"] },
    automation_rules: { description: "Automation rules and triggers", keyFields: ["id", "name", "triggerType", "isActive", "createdAt"] },
    saved_reports: { description: "Saved report configurations", keyFields: ["id", "name", "reportType", "filters", "createdBy", "createdAt"] },
  },
  notes: [
    "Safeguarding notes are excluded from standard exports.",
    "All IDs are opaque strings — use them to join records across files.",
    "Timestamps are in UTC ISO 8601 format.",
  ],
};

const README_CONTENT = `# Hubforte Data Export

This ZIP contains a full export of your CRM data.

## Files included

- contacts.csv / contacts.json
- organizations.csv / organizations.json
- activities.csv / activities.json
- notes.csv / notes.json
- tasks.csv / tasks.json
- campaigns.csv / campaigns.json
- funders.csv / funders.json
- volunteers.csv / volunteers.json
- students.csv / students.json
- opportunities.csv / opportunities.json
- support_tickets.csv / support_tickets.json
- programmes.csv / programmes.json
- cohorts.csv / cohorts.json
- outcomes.csv / outcomes.json
- attachments.csv / attachments.json
- automation_rules.csv / automation_rules.json
- saved_reports.csv / saved_reports.json
- schema.json — field descriptions for all entities
- README.md — this file

## How to use this data

Each CSV file has a header row. The JSON files contain the same data as arrays of objects.
Use the \`id\` field to join records across files (e.g. a contact's \`organizationId\` matches
an organisation's \`id\`).

## What is NOT included

Safeguarding notes are excluded from this standard export. They contain sensitive personal
information and must be handled separately under your data protection policy. Contact your
Data Protection Officer or system administrator for a compliant export of these records.

## Importing into another system

Most CRMs accept CSV imports. Use \`schema.json\` to understand what each field means and
map it to the target system's fields. Any developer can read the schema and import the
JSON files into any system.
`;

// ── Background export processor ────────────────────────────────────────────

async function processFullExport(jobId: string, tenantId: string, userId: string) {
  try {
    await db.update(exportJobsTable).set({ status: "PROCESSING" }).where(eq(exportJobsTable.id, jobId));

    const data: Record<string, Record<string, any>[]> = {};
    let totalRows = 0;
    for (const entity of FULL_ENTITIES) {
      const rows = await fetchEntity(entity, tenantId);
      data[entity] = rows;
      totalRows += rows.length;
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const outPath = path.join(EXPORTS_DIR, `${jobId}.zip`);

    await new Promise<void>((resolve, reject) => {
      const output = fs.createWriteStream(outPath);
      const archive = archiver("zip", { zlib: { level: 6 } });
      output.on("close", resolve);
      archive.on("error", reject);
      archive.pipe(output);
      for (const entity of FULL_ENTITIES) {
        archive.append(toCSV(data[entity]), { name: `${entity}.csv` });
        archive.append(JSON.stringify(data[entity], null, 2), { name: `${entity}.json` });
      }
      archive.append(JSON.stringify(SCHEMA_JSON, null, 2), { name: "schema.json" });
      archive.append(README_CONTENT, { name: "README.md" });
      archive.finalize();
    });

    const fileSize = fs.statSync(outPath).size;
    await db.update(exportJobsTable)
      .set({ status: "COMPLETE", totalRows, fileSize, downloadToken: token, expiresAt, completedAt: new Date() })
      .where(eq(exportJobsTable.id, jobId));

    await createNotification({ userId, tenantId, title: "Export ready", message: "Your full data export is ready to download.", type: "SUCCESS", link: "/export" });
  } catch (err: any) {
    logger.error({ jobId, err: err.message }, "Full export job failed");
    await db.update(exportJobsTable).set({ status: "FAILED", error: err.message, completedAt: new Date() }).where(eq(exportJobsTable.id, jobId));
  }
}

async function processEntityExport(jobId: string, tenantId: string, entity: EntityName, format: string, userId: string) {
  try {
    await db.update(exportJobsTable).set({ status: "PROCESSING" }).where(eq(exportJobsTable.id, jobId));

    const rows = await fetchEntity(entity, tenantId);
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const outPath = path.join(EXPORTS_DIR, `${jobId}.zip`);

    const xlsxBuf = format === "xlsx" ? await toXLSX(rows) : null;
    await new Promise<void>((resolve, reject) => {
      const output = fs.createWriteStream(outPath);
      const archive = archiver("zip", { zlib: { level: 6 } });
      output.on("close", resolve);
      archive.on("error", reject);
      archive.pipe(output);
      if (format === "json") {
        archive.append(JSON.stringify(rows, null, 2), { name: `${entity}.json` });
      } else if (format === "xlsx") {
        archive.append(xlsxBuf!, { name: `${entity}.xlsx` });
      } else {
        archive.append(toCSV(rows), { name: `${entity}.csv` });
      }
      archive.finalize();
    });

    const fileSize = fs.statSync(outPath).size;
    await db.update(exportJobsTable)
      .set({ status: "COMPLETE", totalRows: rows.length, fileSize, downloadToken: token, expiresAt, completedAt: new Date() })
      .where(eq(exportJobsTable.id, jobId));

    await createNotification({ userId, tenantId, title: "Export ready", message: `Your ${entity} export is ready to download.`, type: "SUCCESS", link: "/export" });
  } catch (err: any) {
    logger.error({ jobId, err: err.message }, "Entity export job failed");
    await db.update(exportJobsTable).set({ status: "FAILED", error: err.message, completedAt: new Date() }).where(eq(exportJobsTable.id, jobId));
  }
}

// ── POST /export/full ──────────────────────────────────────────────────────

router.post("/full", authMiddleware, denyDevRoles, requireRole("ADMIN"), async (req, res): Promise<void> => {
  const user = req.user!;
  if (!user.tenantId) { res.status(403).json({ error: "No tenant assigned" }); return; }

  const MAX_EXPORT_WARNING_ROWS = parseInt(process.env.MAX_EXPORT_WARNING_ROWS || "10000");

  const [contactCount, orgCount] = await Promise.all([
    db.select({ n: count() }).from(contactsTable).where(eq(contactsTable.tenantId, user.tenantId)),
    db.select({ n: count() }).from(organizationsTable).where(eq(organizationsTable.tenantId, user.tenantId)),
  ]);
  const estimatedRows = Number(contactCount[0]?.n ?? 0) + Number(orgCount[0]?.n ?? 0);

  const jobId = generateId("exp");
  await db.insert(exportJobsTable).values({ id: jobId, tenantId: user.tenantId, exportType: "full", format: "zip", status: "PENDING", createdBy: user.id });
  setImmediate(() => processFullExport(jobId, user.tenantId!, user.id));
  res.json({
    jobId,
    estimatedRows,
    message: estimatedRows > MAX_EXPORT_WARNING_ROWS
      ? "Your export is large and may take several minutes. You will receive an email when it is ready."
      : "Export started. You will receive an email when ready.",
  });
});

// ── POST /export/entity ────────────────────────────────────────────────────

router.post("/entity", authMiddleware, denyDevRoles, requireRole("ADMIN"), async (req, res): Promise<void> => {
  const user = req.user!;
  if (!user.tenantId) { res.status(403).json({ error: "No tenant assigned" }); return; }

  const { entityType, format = "csv" } = req.body as { entityType: string; format?: string };
  if (!FULL_ENTITIES.includes(entityType as EntityName)) {
    res.status(400).json({ error: `entityType must be one of: ${FULL_ENTITIES.join(", ")}` });
    return;
  }
  if (!["csv", "json", "xlsx"].includes(format)) {
    res.status(400).json({ error: "format must be csv, json, or xlsx" });
    return;
  }

  const entity = entityType as EntityName;

  // Fast path: < 5000 rows — return file immediately
  const rowCount = await countEntity(entity, user.tenantId);
  if (rowCount < SMALL_EXPORT_THRESHOLD) {
    const rows = await fetchEntity(entity, user.tenantId);
    if (format === "json") {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="${entity}.json"`);
      res.send(JSON.stringify(rows, null, 2));
    } else if (format === "xlsx") {
      const buf = await toXLSX(rows);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${entity}.xlsx"`);
      res.send(buf);
    } else {
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${entity}.csv"`);
      res.send(toCSV(rows));
    }
    return;
  }

  // Slow path: background job
  const jobId = generateId("exp");
  await db.insert(exportJobsTable).values({ id: jobId, tenantId: user.tenantId, exportType: entity, format, status: "PENDING", createdBy: user.id });
  setImmediate(() => processEntityExport(jobId, user.tenantId!, entity, format, user.id));
  res.json({ jobId });
});

// ── GET /export/counts — record counts per entity for the UI ───────────────

router.get("/counts", authMiddleware, denyDevRoles, requireRole("ADMIN"), async (req, res): Promise<void> => {
  const user = req.user!;
  if (!user.tenantId) { res.status(403).json({ error: "No tenant assigned" }); return; }

  const counts: Record<string, number> = {};
  for (const entity of FULL_ENTITIES) {
    counts[entity] = await countEntity(entity, user.tenantId);
  }
  res.json(counts);
});

// ── GET /export/status/:jobId ──────────────────────────────────────────────

router.get("/status/:jobId", authMiddleware, denyDevRoles, requireRole("ADMIN"), async (req, res): Promise<void> => {
  const user = req.user!;
  const [job] = await db.select()
    .from(exportJobsTable)
    .where(and(eq(exportJobsTable.id, req.params.jobId as string), eq(exportJobsTable.tenantId, user.tenantId!)))
    .limit(1);

  if (!job) { res.status(404).json({ error: "Export job not found" }); return; }
  // Never expose the download token via status — use /download endpoint
  const { downloadToken: _token, ...safe } = job;
  res.json(safe);
});

// ── GET /export/download/:exportId ────────────────────────────────────────

router.get("/download/:exportId", authMiddleware, denyDevRoles, requireRole("ADMIN"), async (req, res): Promise<void> => {
  const user = req.user!;
  const { token } = req.query as { token?: string };

  const [job] = await db.select()
    .from(exportJobsTable)
    .where(and(eq(exportJobsTable.id, req.params.exportId as string), eq(exportJobsTable.tenantId, user.tenantId!)))
    .limit(1);

  if (!job) { res.status(404).json({ error: "Export not found" }); return; }
  if (job.status !== "COMPLETE") { res.status(400).json({ error: "Export is not ready" }); return; }
  if (job.downloadToken !== token) { res.status(403).json({ error: "Invalid download token" }); return; }
  if (job.expiresAt && job.expiresAt < new Date()) { res.status(410).json({ error: "Download link has expired" }); return; }

  const filePath = path.join(EXPORTS_DIR, `${job.id}.zip`);
  if (!fs.existsSync(filePath)) { res.status(404).json({ error: "Export file not found" }); return; }

  const fileName = job.exportType === "full"
    ? `hubforte-full-export-${job.id}.zip`
    : `hubforte-${job.exportType}-export-${job.id}.zip`;

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  fs.createReadStream(filePath).pipe(res);
});

// ── GET /export/history ────────────────────────────────────────────────────

router.get("/history", authMiddleware, denyDevRoles, requireRole("ADMIN"), async (req, res): Promise<void> => {
  const user = req.user!;
  const jobs = await db.select({
    id: exportJobsTable.id,
    exportType: exportJobsTable.exportType,
    format: exportJobsTable.format,
    status: exportJobsTable.status,
    totalRows: exportJobsTable.totalRows,
    fileSize: exportJobsTable.fileSize,
    expiresAt: exportJobsTable.expiresAt,
    error: exportJobsTable.error,
    createdBy: exportJobsTable.createdBy,
    createdAt: exportJobsTable.createdAt,
    completedAt: exportJobsTable.completedAt,
    // downloadToken intentionally omitted — fetched only at download time
  })
    .from(exportJobsTable)
    .where(eq(exportJobsTable.tenantId, user.tenantId!))
    .orderBy(desc(exportJobsTable.createdAt))
    .limit(50);

  res.json(jobs);
});

// ── GET /export/download-link/:exportId — get token for a completed job ───

router.get("/download-link/:exportId", authMiddleware, denyDevRoles, requireRole("ADMIN"), async (req, res): Promise<void> => {
  const user = req.user!;
  const [job] = await db.select({ id: exportJobsTable.id, status: exportJobsTable.status, downloadToken: exportJobsTable.downloadToken, expiresAt: exportJobsTable.expiresAt })
    .from(exportJobsTable)
    .where(and(eq(exportJobsTable.id, req.params.exportId as string), eq(exportJobsTable.tenantId, user.tenantId!)))
    .limit(1);

  if (!job) { res.status(404).json({ error: "Export not found" }); return; }
  if (job.status !== "COMPLETE") { res.status(400).json({ error: "Export is not ready" }); return; }
  if (job.expiresAt && job.expiresAt < new Date()) { res.status(410).json({ error: "Download link has expired" }); return; }

  res.json({ token: job.downloadToken, expiresAt: job.expiresAt });
});

// ── Cleanup expired export files ───────────────────────────────────────────

async function cleanupExpiredExports() {
  try {
    const expired = await db.select({ id: exportJobsTable.id })
      .from(exportJobsTable)
      .where(and(isNotNull(exportJobsTable.expiresAt), sql`${exportJobsTable.expiresAt} < ${new Date()}`));

    for (const job of expired) {
      const filePath = path.join(EXPORTS_DIR, `${job.id}.zip`);
      try { fs.unlinkSync(filePath); } catch {}
    }
  } catch (err: any) {
    logger.error({ err: err.message }, "Export cleanup failed");
  }
}

cleanupExpiredExports();
setInterval(cleanupExpiredExports, 6 * 60 * 60 * 1000);

export default router;
