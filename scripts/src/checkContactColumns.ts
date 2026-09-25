import pg from "pg";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../../artifacts/api-server/.env") });

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

console.log("=== Checking contacts table columns ===\n");

// Get current columns from database
const columnsResult = await client.query(`
  SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
  WHERE table_name = 'contacts' AND table_schema = 'public'
  ORDER BY ordinal_position
`);

console.log(`Database has ${columnsResult.rowCount} columns:`);
for (const row of columnsResult.rows) {
  console.log(`  ${row.column_name} (${row.data_type}, ${row.is_nullable === 'YES' ? 'nullable' : 'not null'})`);
}

// Check schema file columns from the updated schema
const schemaColumns = [
  'id', 'tenant_id', 'first_name', 'last_name', 'role', 'email', 'phone',
  'status', 'last_contacted_at', 'organization_id', 'owner_id', 'title',
  'job_title_group', 'department', 'seniority_level', 'phone_direct', 'mobile',
  'preferred_contact_method', 'preferred_contact_time', 'is_primary_contact',
  'is_decision_maker', 'is_delivery_contact', 'is_safeguarding_relevant',
  'is_first_outreach_contact', 'consent_to_contact', 'lawful_basis', 'consent_date',
  'marketing_opt_out', 'relationship_strength', 'next_follow_up_date',
  'metadata', 'tags', 'notes', 'created_by', 'source_table', 'source_id',
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

// Check against architecture plan
console.log("\n=== Checking against architecture plan ===");
const architecturePlanFields = [
  'id', 'tenant_id', 'organisation_id', 'first_name', 'last_name',
  'job_title', 'job_title_group', 'department', 'seniority_level',
  'email', 'phone_direct', 'mobile', 'preferred_contact_method', 'preferred_contact_time',
  'is_primary_contact', 'is_decision_maker', 'is_delivery_contact', 'is_safeguarding_relevant', 'is_first_outreach_contact',
  'consent_to_contact', 'lawful_basis', 'consent_date', 'marketing_opt_out',
  'status', 'relationship_strength', 'last_contact_date', 'next_follow_up_date', 'owner_id',
  'metadata', 'tags', 'notes', 'created_by', 'created_at', 'updated_at'
];

console.log(`Architecture plan expects ${architecturePlanFields.length} columns`);

const missingFromArchitecture = architecturePlanFields.filter(field => !schemaColumns.includes(field) && !dbColumnNames.includes(field));
console.log(`\nMissing ${missingFromArchitecture.length} fields from architecture plan:`);
console.log(missingFromArchitecture.join(', '));

await client.end();