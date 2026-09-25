import pg from "pg";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../../artifacts/api-server/.env") });

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

console.log("=== Checking for potential Yes Futures data sources ===\n");

// Check tenants table - there should be a Yes Futures tenant
const tenantsResult = await client.query(`SELECT id, name, slug FROM tenants`);
console.log(`Tenants (${tenantsResult.rowCount}):`);
for (const row of tenantsResult.rows) {
  console.log(`  ${row.id}: ${row.name} (${row.slug})`);
}

// Check which tenant has data
console.log("\n=== Checking data distribution by tenant ===");

// Get all tenant IDs
const tenantIds = tenantsResult.rows.map(r => r.id);

for (const tenantId of tenantIds) {
  const tenantName = tenantsResult.rows.find(r => r.id === tenantId)?.name || tenantId;
  console.log(`\nTenant: ${tenantName} (${tenantId}):`);
  
  // Check a few key tables
  const tablesToCheck = ['organizations', 'contacts', 'programmes', 'students', 'volunteers', 'placements', 'activities'];
  
  for (const table of tablesToCheck) {
    const countResult = await client.query(
      `SELECT COUNT(*) as count FROM "${table}" WHERE tenant_id = $1`,
      [tenantId]
    );
    const count = parseInt(countResult.rows[0].count);
    if (count > 0) {
      console.log(`  ${table}: ${count} rows`);
      
      // Show a sample row for non-empty tables
      if (count <= 5) {
        const sampleResult = await client.query(
          `SELECT * FROM "${table}" WHERE tenant_id = $1 LIMIT 1`,
          [tenantId]
        );
        if (sampleResult.rows[0]) {
          const sample = sampleResult.rows[0];
          const sampleStr = JSON.stringify(sample, null, 2).split('\n').slice(0, 5).join('\n');
          console.log(`    Sample: ${sampleStr}...`);
        }
      }
    }
  }
}

// Check if there are any migration markers
console.log("\n=== Checking for migration markers ===");
const migrationMarkers = await client.query(`
  SELECT table_name, column_name, data_type
  FROM information_schema.columns
  WHERE column_name IN ('source_system', 'legacy_id', 'yf_id', 'import_source', 'external_id')
    AND table_schema = 'public'
  ORDER BY table_name, column_name
`);

if (migrationMarkers.rowCount > 0) {
  console.log(`Found ${migrationMarkers.rowCount} migration marker columns:`);
  for (const row of migrationMarkers.rows) {
    console.log(`  ${row.table_name}.${row.column_name} (${row.data_type})`);
  }
} else {
  console.log("No migration marker columns found");
}

// Check the structure of key tables
console.log("\n=== Checking table structures ===");
const keyTables = ['organizations', 'contacts', 'programmes', 'students'];
for (const table of keyTables) {
  const columnsResult = await client.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = $1 AND table_schema = 'public'
    ORDER BY ordinal_position
  `, [table]);
  
  console.log(`\n${table} (${columnsResult.rowCount} columns):`);
  // Show first 10 columns
  for (let i = 0; i < Math.min(10, columnsResult.rowCount); i++) {
    const col = columnsResult.rows[i];
    console.log(`  ${col.column_name} (${col.data_type}, ${col.is_nullable === 'YES' ? 'nullable' : 'not null'})`);
  }
  if (columnsResult.rowCount > 10) {
    console.log(`  ... and ${columnsResult.rowCount - 10} more columns`);
  }
}

await client.end();