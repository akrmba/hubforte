import pg from "pg";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../../artifacts/api-server/.env") });

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

// Check for yf_* tables in all schemas
const yfTablesResult = await client.query(`
  SELECT 
    table_schema,
    table_name
  FROM information_schema.tables 
  WHERE table_name LIKE 'yf_%'
  ORDER BY table_schema, table_name
`);

console.log(`Found ${yfTablesResult.rowCount} yf_* tables:`);
for (const row of yfTablesResult.rows) {
  console.log(`  ${row.table_schema}.${row.table_name}`);
  
  // Get row count
  const countResult = await client.query(`SELECT COUNT(*) as count FROM "${row.table_schema}"."${row.table_name}"`);
  console.log(`    Rows: ${countResult.rows[0].count}`);
  
  // Check for tenant_id
  const columnsResult = await client.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_schema = $1 AND table_name = $2 AND column_name = 'tenant_id'
  `, [row.table_schema, row.table_name]);
  console.log(`    Has tenant_id: ${columnsResult.rowCount > 0}`);
}

// Also check for tables that might be Yes Futures tables without yf_ prefix
const allTablesResult = await client.query(`
  SELECT table_name
  FROM information_schema.tables 
  WHERE table_schema = 'public' 
    AND table_type = 'BASE TABLE'
  ORDER BY table_name
`);

console.log("\n=== All tables in public schema ===");
for (const row of allTablesResult.rows) {
  console.log(`  ${row.table_name}`);
}

await client.end();