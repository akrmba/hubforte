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
  console.log(`\nTenant ${tenantId}:`);
  
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
    }
  }
}

// Check if there are any legacy yf_* references in the data
console.log("\n=== Checking for legacy Yes Futures identifiers ===");

// Check organizations table for school/trust/sponsor indicators
const orgTypesResult = await client.query(`
  SELECT 
    COUNT(*) as total,
    COUNT(CASE WHEN metadata->>'yf_school_id' IS NOT NULL THEN 1 END) as has_yf_school_id,
    COUNT(CASE WHEN metadata->>'yf_trust_id' IS NOT NULL THEN 1 END) as has_yf_trust_id,
    COUNT(CASE WHEN metadata->>'yf_sponsor_id' IS NOT NULL THEN 1 END) as has_yf_sponsor_id
  FROM organizations
`);

const orgRow = orgTypesResult.rows[0];
console.log(`Organizations table analysis:`);
console.log(`  Total rows: ${orgRow.total}`);
console.log(`  Has yf_school_id in metadata: ${orgRow.has_yf_school_id}`);
console.log(`  Has yf_trust_id in metadata: ${orgRow.has_yf_trust_id}`);
console.log(`  Has yf_sponsor_id in metadata: ${orgRow.has_yf_sponsor_id}`);

// Check if there are any migration markers
console.log("\n=== Checking for migration markers ===");
const migrationMarkers = await client.query(`
  SELECT table_name, column_name, data_type
  FROM information_schema.columns
  WHERE column_name IN ('source_system', 'legacy_id', 'yf_id', 'import_source')
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

await client.end();