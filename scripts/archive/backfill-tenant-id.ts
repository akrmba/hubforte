import pg from "pg";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config({ path: path.resolve(__dirname, "../../artifacts/api-server/.env") });

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("DATABASE_URL must be set in artifacts/api-server/.env");
  process.exit(1);
}

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

export type BackfillSummary = {
  tableName: (typeof TARGET_TABLES)[number];
  totalRows: number;
  rowsUpdated: number;
};

export async function fetchExistingTargetTables(client: pg.Client): Promise<(typeof TARGET_TABLES)[number][]> {
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
    .filter((tableName): tableName is (typeof TARGET_TABLES)[number] =>
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
      `${summary.tableName}: updated ${summary.rowsUpdated} row(s)${summary.totalRows === 0 ? " (empty table)" : ` out of ${summary.totalRows}`}`,
    );
  }
}

async function runStandalone() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    const existingTables = await fetchExistingTargetTables(client);
    const missingTables = TARGET_TABLES.filter((tableName) => !existingTables.includes(tableName));
    if (missingTables.length > 0) {
      console.log(`Skipping ${missingTables.length} target table(s) not present in this database:`);
      for (const tableName of missingTables) {
        console.log(`- ${tableName}`);
      }
    }

    const summaries = await backfillTenantIds(client);
    printBackfillSummary(summaries);
  } catch (error) {
    console.error("Failed to backfill tenant_id values:", error);
    process.exit(1);
  } finally {
    await client.end();
  }

  process.exit(0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  runStandalone();
}
