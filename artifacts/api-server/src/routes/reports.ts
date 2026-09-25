import { Router, type IRouter } from "express";
import { db, reportTypesTable, savedReportsTable, dashboardsTable, reportSchedulesTable, usersTable, organizationsTable, contactsTable, tasksTable, activitiesTable, notesTable, volunteersTable, fundersTable, fundingOpportunitiesTable, programmesTable, studentsTable, placementsTable, programmeCohortsTable, programmeSessionsTable, sessionAttendanceTable, outcomeFrameworksTable, outcomeRecordsTable, safeguardingNotesTable, consentRecordsTable, parentGuardiansTable } from "@workspace/db";
import { eq, and, desc, count, sql, inArray, gte, lte, isNotNull, isNull, ilike, or } from "drizzle-orm";
import { authMiddleware, requireRole, denyDevRoles } from "../lib/auth";
import { generateId } from "../lib/id";
import { sanitiseInput } from "../lib/sanitise";
import { checkModuleEnabled } from "../lib/featureFlags";
import { gzipSync } from "zlib";

function toCsv(rows: Record<string, any>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const FORMULA_PREFIXES = ["=", "+", "-", "@", "\t", "\r"];
  const escape = (v: any) => {
    let s = v == null ? "" : String(v);
    // Neutralise spreadsheet formula injection
    if (FORMULA_PREFIXES.some(p => s.startsWith(p))) s = "'" + s;
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map(r => headers.map(h => escape(r[h])).join(","))].join("\n");
}

const router: IRouter = Router();

const entityTables: Record<string, any> = {
  organizations: organizationsTable,
  contacts: contactsTable,
  tasks: tasksTable,
  activities: activitiesTable,
  notes: notesTable,
  volunteers: volunteersTable,
  funders: fundersTable,
  funding_opportunities: fundingOpportunitiesTable,
  programmes: programmesTable,
  students: studentsTable,
  placements: placementsTable,
  programme_cohorts: programmeCohortsTable,
  programme_sessions: programmeSessionsTable,
  session_attendance: sessionAttendanceTable,
  outcome_frameworks: outcomeFrameworksTable,
  outcome_records: outcomeRecordsTable,
  consent_records: consentRecordsTable,
  parent_guardians: parentGuardiansTable,
};

// GET /reports/types
router.get("/types", authMiddleware, denyDevRoles, checkModuleEnabled("reports"), async (req, res): Promise<void> => {
  const tenantId = req.user!.tenantId;
  const reportTypes = await db.select().from(reportTypesTable)
    .where(tenantId ? or(eq(reportTypesTable.tenantId, tenantId), isNull(reportTypesTable.tenantId)) : isNull(reportTypesTable.tenantId))
    .orderBy(desc(reportTypesTable.createdAt));
  res.json({ data: reportTypes.filter((rt) => rt.entityType !== "safeguarding_notes") });
});

// GET /reports/types/:id
router.get("/types/:id", authMiddleware, denyDevRoles, checkModuleEnabled("reports"), async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const tenantId = req.user!.tenantId;
  const tenantFilter = tenantId ? or(eq(reportTypesTable.tenantId, tenantId), isNull(reportTypesTable.tenantId)) : isNull(reportTypesTable.tenantId);
  const [reportType] = await db.select().from(reportTypesTable)
    .where(and(eq(reportTypesTable.id, rawId), tenantFilter));
  if (!reportType) { res.status(404).json({ error: "Report type not found" }); return; }
  res.json(reportType);
});

// POST /reports/execute
router.post("/execute", authMiddleware, denyDevRoles, checkModuleEnabled("reports"), async (req, res): Promise<void> => {
  const user = req.user!;
  const tenantId = user.tenantId;
  if (!tenantId) { res.status(403).json({ error: "No tenant assigned" }); return; }
  const raw = sanitiseInput(req.body as Record<string, unknown>) as any;
  if (!raw.reportTypeId && !raw.entityType) { res.status(400).json({ error: "reportTypeId or entityType is required" }); return; }

  let reportType: any = null;
  if (raw.reportTypeId) {
    const tenantFilter = or(eq(reportTypesTable.tenantId, tenantId), isNull(reportTypesTable.tenantId));
    [reportType] = await db.select().from(reportTypesTable)
      .where(and(eq(reportTypesTable.id, raw.reportTypeId), tenantFilter));
    if (!reportType) { res.status(404).json({ error: "Report type not found" }); return; }
  } else {
    reportType = { entityType: raw.entityType, availableFields: raw.columns || [], joinConfig: raw.joinConfig || [] };
  }

  // Safeguarding data is excluded from the general report engine.
  // Use the dedicated /safeguarding-notes and /safeguarding-access-logs endpoints instead.
  if (reportType.entityType === "safeguarding_notes") {
    res.status(403).json({ error: "Safeguarding data cannot be accessed via the report engine. Use the dedicated safeguarding endpoints." });
    return;
  }

  const mainTable = entityTables[reportType.entityType];
  if (!mainTable) { res.status(400).json({ error: `Unknown entity type: ${reportType.entityType}` }); return; }

  try {
    const filters = raw.filters || [];
    const sortOrder = raw.sortOrder || [];
    const groupings: string[] = raw.groupings || [];
    const page = raw.page || 1;
    const limit = Math.min(raw.limit || 100, 1000);
    const offset = (page - 1) * limit;

    const conditions = [eq(mainTable.tenantId, tenantId)];
    for (const filter of filters) {
      const { field, operator, value } = filter;
      const column = mainTable[field as keyof typeof mainTable];
      if (!column) continue;
      switch (operator) {
        case "equals": conditions.push(eq(column as any, value)); break;
        case "not_equals": conditions.push(sql`${column} <> ${value}`); break;
        case "contains": conditions.push(ilike(column as any, `%${value}%`)); break;
        case "starts_with": conditions.push(ilike(column as any, `${value}%`)); break;
        case "in_list": if (Array.isArray(value)) conditions.push(inArray(column as any, value)); break;
        case "null": conditions.push(isNull(column as any)); break;
        case "not_null": conditions.push(isNotNull(column as any)); break;
        case "date_range": if (value.start) conditions.push(gte(column as any, value.start)); if (value.end) conditions.push(lte(column as any, value.end)); break;
        case "gte": conditions.push(gte(column as any, value)); break;
        case "lte": conditions.push(lte(column as any, value)); break;
      }
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const orderByClauses: any[] = [];
    for (const sort of sortOrder) {
      const column = mainTable[sort.field as keyof typeof mainTable];
      if (column) orderByClauses.push(sort.direction === "desc" ? desc(column as any) : (column as any));
    }

    // Group-by: aggregate count per group field(s)
    if (groupings.length > 0) {
      const groupCols = groupings
        .map((g) => mainTable[g as keyof typeof mainTable])
        .filter(Boolean) as any[];
      if (groupCols.length > 0) {
        const selectObj: Record<string, any> = { count: count() };
        for (const g of groupings) {
          const col = mainTable[g as keyof typeof mainTable];
          if (col) selectObj[g] = col;
        }
        const grouped = await db
          .select(selectObj)
          .from(mainTable)
          .where(where)
          .groupBy(...groupCols)
          .orderBy(groupCols[0]);
        res.json({ data: grouped, total: grouped.length, page: 1, totalPages: 1, entityType: reportType.entityType, grouped: true });
        return;
      }
    }

    if (orderByClauses.length === 0) orderByClauses.push(desc(mainTable.createdAt as any));

    const [dataResult, totalResult] = await Promise.all([
      db.select().from(mainTable).where(where).limit(limit).offset(offset).orderBy(...orderByClauses),
      db.select({ count: count() }).from(mainTable).where(where),
    ]);

    const total = totalResult[0]?.count ?? 0;
    res.json({ data: dataResult, total, page, totalPages: Math.ceil(total / limit), entityType: reportType.entityType });
  } catch (error) {
    console.error("Error executing report:", error);
    res.status(500).json({ error: "Failed to execute report" });
  }
});

// GET /reports/saved
router.get("/saved", authMiddleware, denyDevRoles, checkModuleEnabled("reports"), async (req, res): Promise<void> => {
  const tenantId = req.user!.tenantId;
  if (!tenantId) { res.status(403).json({ error: "No tenant assigned" }); return; }
  const userId = req.user!.id;
  const reports = await db.select().from(savedReportsTable)
    .where(and(eq(savedReportsTable.tenantId, tenantId), or(eq(savedReportsTable.ownerId, userId), eq(savedReportsTable.sharing, "ROLE"), eq(savedReportsTable.sharing, "ALL"))))
    .orderBy(desc(savedReportsTable.updatedAt));
  res.json({ data: reports });
});

// GET /reports/saved/:id
router.get("/saved/:id", authMiddleware, denyDevRoles, checkModuleEnabled("reports"), async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const tenantId = req.user!.tenantId;
  if (!tenantId) { res.status(403).json({ error: "No tenant assigned" }); return; }
  const userId = req.user!.id;
  const [report] = await db.select().from(savedReportsTable)
    .where(and(eq(savedReportsTable.id, rawId), eq(savedReportsTable.tenantId, tenantId), or(eq(savedReportsTable.ownerId, userId), eq(savedReportsTable.sharing, "ROLE"), eq(savedReportsTable.sharing, "ALL"))));
  if (!report) { res.status(404).json({ error: "Saved report not found" }); return; }
  res.json(report);
});

// POST /reports/saved
router.post("/saved", authMiddleware, denyDevRoles, checkModuleEnabled("reports"), requireRole("OPERATOR", "MANAGER", "ADMIN"), async (req, res): Promise<void> => {
  const user = req.user!;
  if (!user.tenantId) { res.status(403).json({ error: "No tenant assigned" }); return; }
  const raw = sanitiseInput(req.body as Record<string, unknown>) as any;
  if (!raw.name) { res.status(400).json({ error: "name is required" }); return; }
  const newReport = { id: generateId("rpt"), tenantId: user.tenantId, reportTypeId: raw.reportTypeId, name: raw.name, columns: raw.columns || [], filters: raw.filters || [], groupings: raw.groupings || [], sortOrder: raw.sortOrder || [], chartType: raw.chartType, sharing: raw.sharing || "PRIVATE", ownerId: user.id };
  try {
    const [inserted] = await db.insert(savedReportsTable).values(newReport).returning();
    res.status(201).json(inserted);
  } catch (error) { console.error("Error creating saved report:", error); res.status(500).json({ error: "Failed to create saved report" }); }
});

// PUT /reports/saved/:id
router.put("/saved/:id", authMiddleware, denyDevRoles, checkModuleEnabled("reports"), requireRole("OPERATOR", "MANAGER", "ADMIN"), async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const user = req.user!;
  if (!user.tenantId) { res.status(403).json({ error: "No tenant assigned" }); return; }
  const raw = sanitiseInput(req.body as Record<string, unknown>) as any;
  const [existing] = await db.select().from(savedReportsTable).where(and(eq(savedReportsTable.id, rawId), eq(savedReportsTable.tenantId, user.tenantId)));
  if (!existing) { res.status(404).json({ error: "Saved report not found" }); return; }
  if (existing.ownerId !== user.id) { res.status(403).json({ error: "Only the owner can update this report" }); return; }
  const { id, tenantId, ownerId, createdAt, ...updateData } = raw;
  try {
    const [updated] = await db.update(savedReportsTable).set({ ...updateData, updatedAt: new Date() }).where(and(eq(savedReportsTable.id, rawId), eq(savedReportsTable.tenantId, user.tenantId))).returning();
    res.json(updated);
  } catch (error) { console.error("Error updating saved report:", error); res.status(500).json({ error: "Failed to update saved report" }); }
});

// DELETE /reports/saved/:id
router.delete("/saved/:id", authMiddleware, denyDevRoles, checkModuleEnabled("reports"), requireRole("OPERATOR", "MANAGER", "ADMIN"), async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const user = req.user!;
  if (!user.tenantId) { res.status(403).json({ error: "No tenant assigned" }); return; }
  const [existing] = await db.select().from(savedReportsTable).where(and(eq(savedReportsTable.id, rawId), eq(savedReportsTable.tenantId, user.tenantId)));
  if (!existing) { res.status(404).json({ error: "Saved report not found" }); return; }
  if (existing.ownerId !== user.id) { res.status(403).json({ error: "Only the owner can delete this report" }); return; }
  try {
    await db.delete(savedReportsTable).where(and(eq(savedReportsTable.id, rawId), eq(savedReportsTable.tenantId, user.tenantId)));
    res.status(204).send();
  } catch (error) { console.error("Error deleting saved report:", error); res.status(500).json({ error: "Failed to delete saved report" }); }
});

// GET /reports/saved/:id/export/csv
router.get("/saved/:id/export/csv", authMiddleware, denyDevRoles, checkModuleEnabled("reports"), async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const tenantId = req.user!.tenantId;
  if (!tenantId) { res.status(403).json({ error: "No tenant assigned" }); return; }
  const userId = req.user!.id;
  const [report] = await db.select().from(savedReportsTable)
    .where(and(eq(savedReportsTable.id, rawId), eq(savedReportsTable.tenantId, tenantId), or(eq(savedReportsTable.ownerId, userId), eq(savedReportsTable.sharing, "ROLE"), eq(savedReportsTable.sharing, "ALL"))));
  if (!report) { res.status(404).json({ error: "Saved report not found" }); return; }

  try {
    const reportType = report.reportTypeId ? (await db.select().from(reportTypesTable).where(eq(reportTypesTable.id, report.reportTypeId)))[0] : null;
    if (!reportType) { res.status(404).json({ error: "Report type not found" }); return; }
    if (reportType.entityType === "safeguarding_notes") {
      res.status(403).json({ error: "Safeguarding data cannot be exported via the report engine. Use the dedicated safeguarding endpoints." });
      return;
    }
    const mainTable = entityTables[reportType.entityType];
    if (!mainTable) { res.status(400).json({ error: "Unknown entity type" }); return; }

    // Execute the saved report definition (filters + groupings + sortOrder)
    const savedFilters: any[] = (report.filters as any[]) || [];
    const savedGroupings: string[] = (report.groupings as string[]) || [];
    const savedSortOrder: any[] = (report.sortOrder as any[]) || [];
    const columns = (report.columns as string[]) || (reportType.availableFields as string[]);

    const conditions = [eq(mainTable.tenantId, tenantId)];
    for (const filter of savedFilters) {
      const { field, operator, value } = filter;
      const column = mainTable[field as keyof typeof mainTable];
      if (!column) continue;
      switch (operator) {
        case "equals": conditions.push(eq(column as any, value)); break;
        case "not_equals": conditions.push(sql`${column} <> ${value}`); break;
        case "contains": conditions.push(ilike(column as any, `%${value}%`)); break;
        case "starts_with": conditions.push(ilike(column as any, `${value}%`)); break;
        case "in_list": if (Array.isArray(value)) conditions.push(inArray(column as any, value)); break;
        case "null": conditions.push(isNull(column as any)); break;
        case "not_null": conditions.push(isNotNull(column as any)); break;
        case "date_range": if (value.start) conditions.push(gte(column as any, value.start)); if (value.end) conditions.push(lte(column as any, value.end)); break;
        case "gte": conditions.push(gte(column as any, value)); break;
        case "lte": conditions.push(lte(column as any, value)); break;
      }
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    let data: any[];
    if (savedGroupings.length > 0) {
      const groupCols = savedGroupings.map((g) => mainTable[g as keyof typeof mainTable]).filter(Boolean) as any[];
      if (groupCols.length > 0) {
        const selectObj: Record<string, any> = { count: count() };
        for (const g of savedGroupings) { const col = mainTable[g as keyof typeof mainTable]; if (col) selectObj[g] = col; }
        data = await db.select(selectObj).from(mainTable).where(where).groupBy(...groupCols).orderBy(groupCols[0]);
      } else {
        data = await db.select().from(mainTable).where(where).limit(10000);
      }
    } else {
      const orderByClauses: any[] = [];
      for (const sort of savedSortOrder) {
        const col = mainTable[sort.field as keyof typeof mainTable];
        if (col) orderByClauses.push(sort.direction === "desc" ? desc(col as any) : (col as any));
      }
      if (orderByClauses.length === 0) orderByClauses.push(desc(mainTable.createdAt as any));
      data = await db.select().from(mainTable).where(where).limit(10000).orderBy(...orderByClauses);
    }

    const exportCols = savedGroupings.length > 0 ? [...savedGroupings, "count"] : columns;
    const csvData = data.map((row: any) => { const csvRow: Record<string, any> = {}; for (const col of exportCols) csvRow[col] = row[col] ?? ""; return csvRow; });
    const csv = toCsv(csvData);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${report.name.replace(/\s+/g, "_")}.csv"`);
    res.send(csv);
  } catch (error) { console.error("Error exporting report:", error); res.status(500).json({ error: "Failed to export report" }); }
});

// GET /reports/dashboards
router.get("/dashboards", authMiddleware, denyDevRoles, checkModuleEnabled("reports"), async (req, res): Promise<void> => {
  const tenantId = req.user!.tenantId;
  if (!tenantId) { res.status(403).json({ error: "No tenant assigned" }); return; }
  const userId = req.user!.id;
  const dashboards = await db.select().from(dashboardsTable)
    .where(and(eq(dashboardsTable.tenantId, tenantId), or(eq(dashboardsTable.ownerId, userId), eq(dashboardsTable.sharing, "ROLE"), eq(dashboardsTable.sharing, "ALL"))))
    .orderBy(desc(dashboardsTable.updatedAt));
  res.json({ data: dashboards });
});

// GET /reports/dashboards/:id
router.get("/dashboards/:id", authMiddleware, denyDevRoles, checkModuleEnabled("reports"), async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const tenantId = req.user!.tenantId;
  if (!tenantId) { res.status(403).json({ error: "No tenant assigned" }); return; }
  const userId = req.user!.id;
  const [dashboard] = await db.select().from(dashboardsTable)
    .where(and(eq(dashboardsTable.id, rawId), eq(dashboardsTable.tenantId, tenantId), or(eq(dashboardsTable.ownerId, userId), eq(dashboardsTable.sharing, "ROLE"), eq(dashboardsTable.sharing, "ALL"))));
  if (!dashboard) { res.status(404).json({ error: "Dashboard not found" }); return; }
  res.json(dashboard);
});

// POST /reports/dashboards
router.post("/dashboards", authMiddleware, denyDevRoles, checkModuleEnabled("reports"), requireRole("OPERATOR", "MANAGER", "ADMIN"), async (req, res): Promise<void> => {
  const user = req.user!;
  if (!user.tenantId) { res.status(403).json({ error: "No tenant assigned" }); return; }
  const raw = sanitiseInput(req.body as Record<string, unknown>) as any;
  if (!raw.name) { res.status(400).json({ error: "name is required" }); return; }
  const newDashboard = { id: generateId("dash"), tenantId: user.tenantId, name: raw.name, description: raw.description, layout: raw.layout || [], sharing: raw.sharing || "PRIVATE", ownerId: user.id };
  try {
    const [inserted] = await db.insert(dashboardsTable).values(newDashboard).returning();
    res.status(201).json(inserted);
  } catch (error) { console.error("Error creating dashboard:", error); res.status(500).json({ error: "Failed to create dashboard" }); }
});

// PUT /reports/dashboards/:id
router.put("/dashboards/:id", authMiddleware, denyDevRoles, checkModuleEnabled("reports"), requireRole("OPERATOR", "MANAGER", "ADMIN"), async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const user = req.user!;
  if (!user.tenantId) { res.status(403).json({ error: "No tenant assigned" }); return; }
  const raw = sanitiseInput(req.body as Record<string, unknown>) as any;
  const [existing] = await db.select().from(dashboardsTable).where(and(eq(dashboardsTable.id, rawId), eq(dashboardsTable.tenantId, user.tenantId)));
  if (!existing) { res.status(404).json({ error: "Dashboard not found" }); return; }
  if (existing.ownerId !== user.id && user.role !== "ADMIN") { res.status(403).json({ error: "Only the owner or admin can update this dashboard" }); return; }
  const { id, tenantId, ownerId, createdAt, ...updateData } = raw;
  try {
    const [updated] = await db.update(dashboardsTable).set({ ...updateData, updatedAt: new Date() }).where(and(eq(dashboardsTable.id, rawId), eq(dashboardsTable.tenantId, user.tenantId))).returning();
    res.json(updated);
  } catch (error) { console.error("Error updating dashboard:", error); res.status(500).json({ error: "Failed to update dashboard" }); }
});

// DELETE /reports/dashboards/:id
router.delete("/dashboards/:id", authMiddleware, denyDevRoles, checkModuleEnabled("reports"), requireRole("OPERATOR", "MANAGER", "ADMIN"), async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const user = req.user!;
  if (!user.tenantId) { res.status(403).json({ error: "No tenant assigned" }); return; }
  const [existing] = await db.select().from(dashboardsTable).where(and(eq(dashboardsTable.id, rawId), eq(dashboardsTable.tenantId, user.tenantId)));
  if (!existing) { res.status(404).json({ error: "Dashboard not found" }); return; }
  if (existing.ownerId !== user.id && user.role !== "ADMIN") { res.status(403).json({ error: "Only the owner or admin can delete this dashboard" }); return; }
  try {
    await db.delete(dashboardsTable).where(and(eq(dashboardsTable.id, rawId), eq(dashboardsTable.tenantId, user.tenantId)));
    res.status(204).send();
  } catch (error) { console.error("Error deleting dashboard:", error); res.status(500).json({ error: "Failed to delete dashboard" }); }
});

// POST /reports/evidence-pack
router.post("/evidence-pack", authMiddleware, denyDevRoles, checkModuleEnabled("reports"), async (req, res): Promise<void> => {
  const user = req.user!;
  const tenantId = user.tenantId;
  if (!tenantId) { res.status(403).json({ error: "No tenant assigned" }); return; }
  const { fundingOpportunityId } = req.body as { fundingOpportunityId?: string };
  if (!fundingOpportunityId) { res.status(400).json({ error: "fundingOpportunityId is required" }); return; }
  try {
    const [fundingOpp] = await db.select().from(fundingOpportunitiesTable)
      .where(and(eq(fundingOpportunitiesTable.id, fundingOpportunityId), eq(fundingOpportunitiesTable.tenantId, tenantId)));
    if (!fundingOpp) { res.status(404).json({ error: "Funding opportunity not found" }); return; }

    const [funder] = fundingOpp.funderId
      ? await db.select().from(fundersTable).where(eq(fundersTable.id, fundingOpp.funderId))
      : [null];

    // Gather supporting data
    const programmes = await db.select().from(programmesTable).where(eq(programmesTable.tenantId, tenantId)).limit(20);
    const students = await db.select({ id: studentsTable.id, firstName: studentsTable.firstName, lastName: studentsTable.lastName, completionStatus: studentsTable.completionStatus })
      .from(studentsTable).where(eq(studentsTable.tenantId, tenantId)).limit(100);
    const outcomeRecords = await db.select().from(outcomeRecordsTable).where(eq(outcomeRecordsTable.tenantId, tenantId)).limit(100);
    const activities = await db.select().from(activitiesTable).where(eq(activitiesTable.tenantId, tenantId)).limit(50);

    const evidencePack = {
      generatedAt: new Date().toISOString(),
      generatedBy: user.id,
      tenantId,
      fundingOpportunity: fundingOpp,
      funder,
      programmes,
      studentSummary: { total: students.length, completed: students.filter((s: any) => s.completionStatus === "COMPLETED").length },
      outcomeRecords,
      activities,
    };

    // Produce a gzip-compressed JSON bundle (ZIP-equivalent for API delivery)
    const jsonPayload = JSON.stringify(evidencePack, null, 2);
    const compressed = gzipSync(Buffer.from(jsonPayload, "utf-8"));
    const filename = `evidence-pack-${fundingOpportunityId}-${Date.now()}.json.gz`;

    res.setHeader("Content-Type", "application/gzip");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", compressed.length);
    res.send(compressed);
  } catch (error) { console.error("Error generating evidence pack:", error); res.status(500).json({ error: "Failed to generate evidence pack" }); }
});

// ---------------------------------------------------------------------------
// Report Schedules
// ---------------------------------------------------------------------------

function calcNextRun(frequency: string): Date {
  const now = new Date();
  if (frequency === "daily") return new Date(now.getTime() + 24 * 60 * 60 * 1000);
  if (frequency === "weekly") return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  // monthly
  const next = new Date(now);
  next.setMonth(next.getMonth() + 1);
  return next;
}

// GET /reports/schedules
router.get("/schedules", authMiddleware, denyDevRoles, checkModuleEnabled("reports"), async (req, res): Promise<void> => {
  const tenantId = req.user!.tenantId;
  if (!tenantId) { res.status(403).json({ error: "No tenant assigned" }); return; }
  const schedules = await db.select().from(reportSchedulesTable)
    .where(eq(reportSchedulesTable.tenantId, tenantId))
    .orderBy(desc(reportSchedulesTable.createdAt));
  res.json({ data: schedules });
});

// POST /reports/schedules
router.post("/schedules", authMiddleware, denyDevRoles, checkModuleEnabled("reports"), requireRole("OPERATOR", "MANAGER", "ADMIN"), async (req, res): Promise<void> => {
  const user = req.user!;
  if (!user.tenantId) { res.status(403).json({ error: "No tenant assigned" }); return; }
  const { savedReportId, frequency, recipientUserIds } = req.body as { savedReportId: string; frequency: string; recipientUserIds?: string[] };
  if (!savedReportId || !frequency) { res.status(400).json({ error: "savedReportId and frequency are required" }); return; }
  if (!["daily", "weekly", "monthly"].includes(frequency)) { res.status(400).json({ error: "frequency must be daily, weekly, or monthly" }); return; }

  const [report] = await db.select({ id: savedReportsTable.id, reportTypeId: savedReportsTable.reportTypeId }).from(savedReportsTable)
    .where(and(eq(savedReportsTable.id, savedReportId), eq(savedReportsTable.tenantId, user.tenantId)));
  if (!report) { res.status(404).json({ error: "Saved report not found" }); return; }

  if (report.reportTypeId) {
    const [rtype] = await db.select({ entityType: reportTypesTable.entityType }).from(reportTypesTable).where(eq(reportTypesTable.id, report.reportTypeId));
    if (rtype?.entityType === "safeguarding_notes") { res.status(403).json({ error: "Safeguarding reports cannot be scheduled" }); return; }
  }

  const resolvedRecipientIds = recipientUserIds ?? [user.id];
  if (resolvedRecipientIds.length === 0) { res.status(400).json({ error: "recipientUserIds must not be empty" }); return; }
  if (resolvedRecipientIds.length > 0) {
    const validRecipients = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(inArray(usersTable.id, resolvedRecipientIds), eq(usersTable.tenantId, user.tenantId)));
    if (validRecipients.length !== resolvedRecipientIds.length) {
      res.status(400).json({ error: "One or more recipientUserIds are invalid or belong to a different tenant" });
      return;
    }
  }

  const [schedule] = await db.insert(reportSchedulesTable).values({
    id: generateId("rsch"),
    tenantId: user.tenantId,
    savedReportId,
    ownerId: user.id,
    frequency,
    recipientUserIds: resolvedRecipientIds,
    nextRunAt: calcNextRun(frequency),
    enabled: true,
  }).returning();
  res.status(201).json(schedule);
});

// PATCH /reports/schedules/:id
router.patch("/schedules/:id", authMiddleware, denyDevRoles, checkModuleEnabled("reports"), requireRole("OPERATOR", "MANAGER", "ADMIN"), async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const user = req.user!;
  if (!user.tenantId) { res.status(403).json({ error: "No tenant assigned" }); return; }
  const [existing] = await db.select().from(reportSchedulesTable)
    .where(and(eq(reportSchedulesTable.id, rawId), eq(reportSchedulesTable.tenantId, user.tenantId)));
  if (!existing) { res.status(404).json({ error: "Schedule not found" }); return; }

  const updates: Record<string, any> = {};
  if (req.body.frequency !== undefined) {
    if (!["daily", "weekly", "monthly"].includes(req.body.frequency)) { res.status(400).json({ error: "Invalid frequency" }); return; }
    updates.frequency = req.body.frequency;
    updates.nextRunAt = calcNextRun(req.body.frequency);
  }
  if (req.body.enabled !== undefined) updates.enabled = req.body.enabled;
  if (req.body.recipientUserIds !== undefined) {
    const ids: string[] = req.body.recipientUserIds;
    if (ids.length === 0) { res.status(400).json({ error: "recipientUserIds must not be empty" }); return; }
    const validRecipients = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(inArray(usersTable.id, ids), eq(usersTable.tenantId, user.tenantId)));
    if (validRecipients.length !== ids.length) {
      res.status(400).json({ error: "One or more recipientUserIds are invalid or belong to a different tenant" });
      return;
    }
    updates.recipientUserIds = ids;
  }

  const [updated] = await db.update(reportSchedulesTable).set(updates)
    .where(and(eq(reportSchedulesTable.id, rawId), eq(reportSchedulesTable.tenantId, user.tenantId)))
    .returning();
  res.json(updated);
});

// DELETE /reports/schedules/:id
router.delete("/schedules/:id", authMiddleware, denyDevRoles, checkModuleEnabled("reports"), requireRole("OPERATOR", "MANAGER", "ADMIN"), async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const user = req.user!;
  if (!user.tenantId) { res.status(403).json({ error: "No tenant assigned" }); return; }
  const [existing] = await db.select({ id: reportSchedulesTable.id, ownerId: reportSchedulesTable.ownerId })
    .from(reportSchedulesTable)
    .where(and(eq(reportSchedulesTable.id, rawId), eq(reportSchedulesTable.tenantId, user.tenantId)));
  if (!existing) { res.status(404).json({ error: "Schedule not found" }); return; }
  if (existing.ownerId !== user.id && user.role !== "ADMIN") { res.status(403).json({ error: "Only the owner or admin can delete this schedule" }); return; }
  await db.delete(reportSchedulesTable).where(eq(reportSchedulesTable.id, rawId));
  res.status(204).send();
});

export default router;
