import pg from "pg";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import { TARGET_TABLES, backfillTenantIds, fetchExistingTargetTables, printBackfillSummary } from "./backfill-tenant-id.js";

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config({ path: path.resolve(__dirname, "../../artifacts/api-server/.env") });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL must be set in artifacts/api-server/.env");
  process.exit(1);
}

async function fetchTablesWithTenantId(client: pg.Client): Promise<string[]> {
  const result = await client.query<{ table_name: string }>(
    `SELECT table_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND column_name = 'tenant_id'
       AND table_name = ANY($1::text[])
     ORDER BY table_name`,
    [TARGET_TABLES],
  );

  return result.rows.map((row) => row.table_name);
}

async function runMigration() {
  const sqlPath = path.resolve(__dirname, "../../lib/db/migrations/0003_tenant_id_all_tables_up.sql");
  const sql = fs.readFileSync(sqlPath, "utf-8");

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    console.log("Running migration: 0003_tenant_id_all_tables_up.sql");
    await client.query(sql);
    console.log("Migration completed successfully.");

    const existingTables = await fetchExistingTargetTables(client);
    const missingTables = TARGET_TABLES.filter((tableName) => !existingTables.includes(tableName));
    if (missingTables.length > 0) {
      console.log(`Skipping ${missingTables.length} target table(s) not present in this database:`);
      for (const tableName of missingTables) {
        console.log(`- ${tableName}`);
      }
    }

    const tablesWithTenantId = await fetchTablesWithTenantId(client);
    console.log(`tenant_id column present on ${tablesWithTenantId.length} table(s):`);
    for (const tableName of tablesWithTenantId) {
      console.log(`- ${tableName}`);
    }

    const summaries = await backfillTenantIds(client);
    printBackfillSummary(summaries);
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
