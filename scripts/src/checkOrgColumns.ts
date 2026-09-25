import pg from "pg";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../../artifacts/api-server/.env") });

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

console.log("=== Checking organizations table columns ===\n");

// Get current columns from database
const columnsResult = await client.query(`
  SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
  WHERE table_name = 'organizations' AND table_schema = 'public'
  ORDER BY ordinal_position
`);

console.log(`Database has ${columnsResult.rowCount} columns:`);
for (const row of columnsResult.rows) {
  console.log(`  ${row.column_name} (${row.data_type}, ${row.is_nullable === 'YES' ? 'nullable' : 'not null'})`);
}

// Check schema file columns
const schemaColumns = [
  'id', 'tenant_id', 'name', 'type', 'status', 'location', 'owner_id', 'notes',
  'website', 'phone', 'address', 'postcode', 'region', 'email', 'relationship_status',
  'metadata', 'parent_org_id', 'created_by', 'source_table', 'source_id',
  'created_at', 'updated_at'
];

console.log(`\nSchema file defines ${schemaColumns.length} columns:`);
console.log(schemaColumns.join(', '));

// Check for discrepancies
const dbColumnNames = columnsResult.rows.map(r => r.column_name);
const missingInDb = schemaColumns.filter(col => !dbColumnNames.includes(col));
const extraInDb = dbColumnNames.filter(col => !schemaColumns.includes(col));

if (missingInDb.length > 0) {
  console.log(`\nColumns in schema but NOT in database (${missingInDb.length}):`);
  console.log(missingInDb.join(', '));
}

if (extraInDb.length > 0) {
  console.log(`\nColumns in database but NOT in schema (${extraInDb.length}):`);
  console.log(extraInDb.join(', '));
}

await client.end();