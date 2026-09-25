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
  const sqlPath = path.resolve(__dirname, "../../lib/db/migrations/0002_tenant_infrastructure_up.sql");
  const sql = fs.readFileSync(sqlPath, "utf-8");

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    console.log("Running migration: 0002_tenant_infrastructure_up.sql");
    await client.query(sql);
    console.log("Migration completed successfully.");

    // Verify tables exist
    const { rows: tables } = await client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name IN ('tenants', 'tenant_feature_flags')
       ORDER BY table_name`
    );
    console.log("Created tables:", tables.map(r => r.table_name).join(", "));

    // Verify tenant_id column on users
    const { rows: cols } = await client.query(
      `SELECT column_name, data_type, is_nullable FROM information_schema.columns
       WHERE table_name = 'users' AND column_name = 'tenant_id'`
    );
    if (cols.length > 0) {
      console.log(`users.tenant_id: type=${cols[0].data_type}, nullable=${cols[0].is_nullable}`);
    } else {
      console.error("ERROR: tenant_id column not found on users table!");
    }
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
