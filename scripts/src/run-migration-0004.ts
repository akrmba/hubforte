import pg from "pg";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config({ path: path.resolve(__dirname, "../../artifacts/api-server/.env") });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL must be set in artifacts/api-server/.env");
  process.exit(1);
}

async function runMigration() {
  const sqlPath = path.resolve(__dirname, "../../lib/db/migrations/0004_tenant_status_up.sql");
  const sql = fs.readFileSync(sqlPath, "utf-8");

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    console.log("Running migration: 0004_tenant_status_up.sql");
    await client.query(sql);
    console.log("Migration completed successfully.");

    const { rows: columns } = await client.query<{ column_name: string; data_type: string; is_nullable: string; column_default: string | null }>(
      `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'tenants'
         AND column_name = 'status'`,
    );

    if (columns.length === 0) {
      console.error("ERROR: tenants.status column not found after migration!");
      process.exit(1);
    }

    const column = columns[0];
    console.log(
      `tenants.status: type=${column.data_type}, nullable=${column.is_nullable}, default=${column.column_default ?? "null"}`,
    );

    const { rows: counts } = await client.query<{ status: string; count: string }>(
      `SELECT status, COUNT(*)::text AS count
       FROM tenants
       GROUP BY status
       ORDER BY status`,
    );

    if (counts.length === 0) {
      console.log("No tenant rows found to summarise.");
    } else {
      console.log("Tenant status counts:");
      for (const row of counts) {
        console.log(`- ${row.status}: ${row.count}`);
      }
    }
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
