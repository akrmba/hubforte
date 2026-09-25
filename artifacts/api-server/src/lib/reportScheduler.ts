import { db, reportSchedulesTable, savedReportsTable, reportTypesTable, usersTable, gmailCredentialsTable } from "@workspace/db";
import { eq, and, lte, count, desc, gte, ilike, inArray, isNull, isNotNull, sql } from "drizzle-orm";
import { sendGmailEmail } from "./gmail";
import { logger } from "./logger";

const SCHEDULE_INTERVAL_MS = 5 * 60 * 1000; // check every 5 minutes
let scheduleHandle: ReturnType<typeof setInterval> | null = null;

const entityTables: Record<string, any> = {};

// Lazy-load entity tables to avoid circular imports at module init time
async function getEntityTable(entityType: string): Promise<any | null> {
  if (!Object.keys(entityTables).length) {
    const db_module = await import("@workspace/db");
    Object.assign(entityTables, {
      organizations: db_module.organizationsTable,
      contacts: db_module.contactsTable,
      tasks: db_module.tasksTable,
      activities: db_module.activitiesTable,
      volunteers: db_module.volunteersTable,
      funders: db_module.fundersTable,
      funding_opportunities: db_module.fundingOpportunitiesTable,
      programmes: db_module.programmesTable,
      students: db_module.studentsTable,
      outcome_records: db_module.outcomeRecordsTable,
      consent_records: db_module.consentRecordsTable,
      session_attendance: db_module.sessionAttendanceTable,
      placements: db_module.placementsTable,
      safeguarding_notes: db_module.safeguardingNotesTable,
    });
  }
  return entityTables[entityType] ?? null;
}

function toCsv(rows: Record<string, any>[]): string {
  if (rows.length === 0) return "No data";
  const headers = Object.keys(rows[0]);
  const FORMULA_PREFIXES = ["=", "+", "-", "@", "\t", "\r"];
  const escape = (v: any) => {
    let s = v == null ? "" : String(v);
    if (FORMULA_PREFIXES.some(p => s.startsWith(p))) s = "'" + s;
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
}

async function executeReportDefinition(report: any, reportType: any, tenantId: string): Promise<Record<string, any>[]> {
  const mainTable = await getEntityTable(reportType.entityType);
  if (!mainTable) return [];

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

  let rows: any[];
  if (savedGroupings.length > 0) {
    const groupCols = savedGroupings.map((g) => mainTable[g as keyof typeof mainTable]).filter(Boolean) as any[];
    if (groupCols.length > 0) {
      const selectObj: Record<string, any> = { count: count() };
      for (const g of savedGroupings) { const col = mainTable[g as keyof typeof mainTable]; if (col) selectObj[g] = col; }
      rows = await db.select(selectObj).from(mainTable).where(where).groupBy(...groupCols).orderBy(groupCols[0]);
    } else {
      rows = await db.select().from(mainTable).where(where).limit(1000);
    }
  } else {
    const orderByClauses: any[] = [];
    for (const sort of savedSortOrder) {
      const col = mainTable[sort.field as keyof typeof mainTable];
      if (col) orderByClauses.push(sort.direction === "desc" ? desc(col as any) : (col as any));
    }
    if (orderByClauses.length === 0) orderByClauses.push(desc(mainTable.createdAt as any));
    rows = await db.select().from(mainTable).where(where).limit(1000).orderBy(...orderByClauses);
  }

  const exportCols = savedGroupings.length > 0 ? [...savedGroupings, "count"] : columns;
  return rows.map((row) => {
    const out: Record<string, any> = {};
    for (const col of exportCols) out[col] = row[col] ?? "";
    return out;
  });
}

async function runDueSchedules(): Promise<void> {
  const now = new Date();

  const dueSchedules = await db
    .select()
    .from(reportSchedulesTable)
    .where(and(eq(reportSchedulesTable.enabled, true), lte(reportSchedulesTable.nextRunAt, now)));

  if (dueSchedules.length === 0) return;

  const [gmailCred] = await db.select().from(gmailCredentialsTable).limit(1);
  if (!gmailCred?.refreshToken) {
    logger.warn("Report schedules: no Gmail credentials — skipping email delivery");
    for (const schedule of dueSchedules) {
      await db.update(reportSchedulesTable)
        .set({ lastRunAt: now, nextRunAt: calcNextRun(schedule.frequency) })
        .where(eq(reportSchedulesTable.id, schedule.id));
    }
    return;
  }

  const fromAddress = process.env.GMAIL_FROM_ADDRESS || "noreply@hubforte.com";

  for (const schedule of dueSchedules) {
    try {
      const [report] = await db.select().from(savedReportsTable)
        .where(eq(savedReportsTable.id, schedule.savedReportId));
      if (!report) continue;

      const [reportType] = report.reportTypeId
        ? await db.select().from(reportTypesTable).where(eq(reportTypesTable.id, report.reportTypeId))
        : [null];
      if (!reportType) continue;

      // Skip safeguarding data but still advance the schedule to avoid permanently-due loop
      if (reportType.entityType === "safeguarding_notes") {
        await db.update(reportSchedulesTable)
          .set({ lastRunAt: now, nextRunAt: calcNextRun(schedule.frequency) })
          .where(eq(reportSchedulesTable.id, schedule.id));
        continue;
      }

      const csvRows = await executeReportDefinition(report, reportType, schedule.tenantId);
      const csv = toCsv(csvRows);

      // Resolve recipients — scoped to the schedule's tenant
      const recipientIds = (schedule.recipientUserIds as string[]) || [];
      if (recipientIds.length === 0) continue;

      const recipients = await db
        .select({ email: usersTable.email, name: usersTable.name })
        .from(usersTable)
        .where(and(
          inArray(usersTable.id, recipientIds),
          eq(usersTable.tenantId, schedule.tenantId),
        ));

      const subject = `Hubforte Report: ${report.name} (${schedule.frequency})`;
      const body = `Your scheduled report "${report.name}" is attached.\n\nFrequency: ${schedule.frequency}\nGenerated: ${now.toISOString()}\n\nThis is an automated report from Hubforte.`;

      for (const recipient of recipients) {
        if (!recipient.email) continue;
        try {
          await sendGmailEmail({
            to: recipient.email,
            subject,
            body,
            from: fromAddress,
            refreshToken: gmailCred.refreshToken,
            attachments: [{
              filename: `${report.name.replace(/\s+/g, "_")}.csv`,
              mimeType: "text/csv",
              content: Buffer.from(csv, "utf-8"),
            }],
          });
        } catch (err) {
          logger.error({ err, email: recipient.email, scheduleId: schedule.id }, "Failed to send scheduled report email");
        }
      }

      await db.update(reportSchedulesTable)
        .set({ lastRunAt: now, nextRunAt: calcNextRun(schedule.frequency) })
        .where(eq(reportSchedulesTable.id, schedule.id));

      logger.info({ scheduleId: schedule.id, reportName: report.name, recipients: recipients.length }, "Scheduled report sent");
    } catch (err) {
      logger.error({ err, scheduleId: schedule.id }, "Failed to run report schedule");
    }
  }
}

function calcNextRun(frequency: string): Date {
  const now = new Date();
  if (frequency === "daily") return new Date(now.getTime() + 24 * 60 * 60 * 1000);
  if (frequency === "weekly") return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const next = new Date(now);
  next.setMonth(next.getMonth() + 1);
  return next;
}

// Named export used by the daily cron job in index.ts
export async function deliverScheduledReports(): Promise<void> {
  return runDueSchedules();
}

export function startReportScheduler(): void {
  if (scheduleHandle) return;
  logger.info("Report scheduler started (every 5 minutes)");
  setTimeout(() => { runDueSchedules().catch(() => {}); }, 60_000);
  scheduleHandle = setInterval(() => { runDueSchedules().catch(() => {}); }, SCHEDULE_INTERVAL_MS);
}

export function stopReportScheduler(): void {
  if (scheduleHandle) { clearInterval(scheduleHandle); scheduleHandle = null; }
}
