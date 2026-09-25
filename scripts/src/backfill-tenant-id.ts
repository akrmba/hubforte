import pg from "pg";

export const HUBFORTE_TENANT_ID = "00000000-0000-0000-0000-000000000001" as const;

export const TARGET_TABLES = [
  "organizations",
  "contacts",
  "activities",
  "tasks",
  "notes",
  "email_templates",
  "campaigns",
  "campaign_contacts",
  "outbound_emails",
  "gmail_credentials",
  "volunteers",
  "funders",
  "funder_contacts",
  "opportunities",
  "opportunity_activities",
  "support_tickets",
  "ticket_updates",
  "ai_ticket_diagnoses",
  "remediation_policies",
  "remediation_runs",
  "notifications",
  "programmes",
  "students",
  "placements",
  "audit_logs",
  "ai_logs",
  "yf_schools",
  "yf_trusts",
  "yf_sponsors",
  "yf_contacts",
  "yf_funding_opportunities",
  "yf_programmes",
  "yf_students",
  "yf_volunteers",
  "yf_placements",
  "yf_activities",
] as const;

export type TargetTable = (typeof TARGET_TABLES)[number];

export type BackfillSummary = {
  tableName: TargetTable;
  totalRows: number;
  rowsUpdated: number;
};

export async function fetchExistingTargetTables(client: pg.Client): Promise<TargetTable[]> {
  const result = await client.query<{ table_name: string }>(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name = ANY($1::text[])
     ORDER BY table_name`,
    [TARGET_TABLES],
  );

  return result.rows
    .map((row) => row.table_name)
    .filter((tableName): tableName is TargetTable =>
      (TARGET_TABLES as readonly string[]).includes(tableName),
    );
}

async function countRows(client: pg.Client, tableName: string): Promise<number> {
  const result = await client.query<{ count: string }>(`SELECT COUNT(*) AS count FROM ${tableName}`);
  return Number(result.rows[0]?.count ?? 0);
}

export async function backfillTenantIds(client: pg.Client): Promise<BackfillSummary[]> {
  const summaries: BackfillSummary[] = [];
  const existingTables = await fetchExistingTargetTables(client);

  for (const tableName of existingTables) {
    const totalRows = await countRows(client, tableName);
    const updateResult = await client.query(
      `UPDATE ${tableName}
       SET tenant_id = $1
       WHERE tenant_id IS NULL`,
      [HUBFORTE_TENANT_ID],
    );

    summaries.push({
      tableName,
      totalRows,
      rowsUpdated: updateResult.rowCount ?? 0,
    });
  }

  return summaries;
}

export function printBackfillSummary(summaries: BackfillSummary[]) {
  console.log("\n=== Backfill summary ===");
  for (const summary of summaries) {
    console.log(
      `${summary.tableName}: updated ${summary.rowsUpdated} row(s)${
        summary.totalRows === 0 ? " (empty table)" : ` out of ${summary.totalRows}`
      }`,
    );
  }
}
