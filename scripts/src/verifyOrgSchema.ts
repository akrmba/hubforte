import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const orgSchemaPath = path.resolve(__dirname, "../../lib/db/src/schema/organizations.ts");
const orgSchemaContent = fs.readFileSync(orgSchemaPath, 'utf-8');

// Fields from architecture plan
const architecturePlanFields = [
  // Core
  'id', 'tenant_id', 'name', 'org_type', 'org_subtype', 'parent_org_id',
  // Identity
  'urn', 'ukprn', 'charity_number', 'companies_house_number',
  // Location
  'address', 'postcode', 'local_authority', 'region', 'country', 'website', 'phone', 'email',
  // Education fields
  'phase', 'age_range_low', 'age_range_high', 'has_sixth_form', 'sixth_form_type',
  'number_on_roll', 'ofsted_rating', 'last_inspection_date',
  'fsm_percent', 'sen_support_percent', 'ehcp_percent',
  'attendance_percent', 'persistent_absence_percent',
  'suspension_percent', 'permanent_exclusion_percent',
  'resourced_provision_flag', 'sen_unit_flag', 'alternative_provision_flag',
  // Trust fields
  'trust_type', 'number_of_schools', 'ceo', 'education_lead', 'safeguarding_lead',
  // Sponsor fields
  'sector', 'csr_priority', 'employee_volunteering_interest',
  // Relationship
  'relationship_status', 'delivery_status', 'engagement_score', 'owner_id', 'priority',
  // Key staff
  'headteacher', 'dsl', 'senco', 'head_of_sixth_form', 'careers_lead',
  // Extensible
  'metadata', 'tags', 'source', 'source_id', 'needs_summary', 'distance_from_project_site',
  // System
  'created_by', 'created_at', 'updated_at'
];

console.log("=== Verifying organizations schema ===\n");

// Extract column names from schema file
const columnMatches = orgSchemaContent.match(/[\w]+:\s*[\w]+\(["']([\w_]+)["']\)/g) || [];
const schemaColumns = columnMatches.map(match => {
  const matchResult = match.match(/["']([\w_]+)["']\)/);
  return matchResult ? matchResult[1] : null;
}).filter((value): value is string => value !== null);

console.log(`Schema file has ${schemaColumns.length} columns defined`);
console.log(`Architecture plan expects ${architecturePlanFields.length} columns\n`);

// Check missing fields
const missingFields = architecturePlanFields.filter(field => !schemaColumns.includes(field));
const extraFields = schemaColumns.filter(field => !architecturePlanFields.includes(field));

if (missingFields.length > 0) {
  console.log(`Missing ${missingFields.length} fields from architecture plan:`);
  console.log(missingFields.join(', '));
} else {
  console.log("All architecture plan fields are present in schema!");
}

if (extraFields.length > 0) {
  console.log(`\nExtra fields in schema (${extraFields.length}) not in architecture plan:`);
  console.log(extraFields.join(', '));
}

// Check specific field mappings
console.log("\n=== Field Mapping Check ===");

// Check if 'type' maps to 'org_type' (architecture plan uses org_type)
if (schemaColumns.includes('type') && !schemaColumns.includes('org_type')) {
  console.log("Note: Schema uses 'type' column, architecture plan uses 'org_type'");
}

// Check if 'status' is present (architecture plan doesn't specify status enum)
if (schemaColumns.includes('status')) {
  console.log("Note: Schema has 'status' column (org_status enum)");
}

// Check if 'location' is present (architecture plan doesn't have location)
if (schemaColumns.includes('location')) {
  console.log("Note: Schema has 'location' column (not in architecture plan)");
}

// Check if 'notes' is present (architecture plan doesn't have notes)  
if (schemaColumns.includes('notes')) {
  console.log("Note: Schema has 'notes' column (not in architecture plan)");
}

// Check if 'source_table' and 'source_id' exist (architecture plan has source, source_id)
if (schemaColumns.includes('source_table') && schemaColumns.includes('source_id')) {
  console.log("Note: Schema has source_table + source_id, architecture plan has source + source_id");
}
