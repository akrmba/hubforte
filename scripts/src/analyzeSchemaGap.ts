import pg from "pg";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../../artifacts/api-server/.env") });

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

console.log("=== Schema Gap Analysis ===\n");

// Define target schema from architecture plan
const targetSchemas = {
  organizations: [
    'id', 'tenant_id', 'name', 'org_type', 'org_subtype', 'parent_org_id',
    'urn', 'ukprn', 'charity_number', 'companies_house_number',
    'address', 'postcode', 'local_authority', 'region', 'country',
    'website', 'phone', 'email',
    'phase', 'age_range_low', 'age_range_high', 'has_sixth_form', 'sixth_form_type',
    'number_on_roll', 'ofsted_rating', 'last_inspection_date',
    'fsm_percent', 'sen_support_percent', 'ehcp_percent',
    'attendance_percent', 'persistent_absence_percent',
    'suspension_percent', 'permanent_exclusion_percent',
    'resourced_provision_flag', 'sen_unit_flag', 'alternative_provision_flag',
    'trust_type', 'number_of_schools', 'ceo', 'education_lead', 'safeguarding_lead',
    'sector', 'csr_priority', 'employee_volunteering_interest',
    'relationship_status', 'delivery_status', 'engagement_score', 'owner_id', 'priority',
    'headteacher', 'dsl', 'senco', 'head_of_sixth_form', 'careers_lead',
    'metadata', 'tags', 'source', 'source_id', 'needs_summary', 'distance_from_project_site',
    'created_by', 'created_at', 'updated_at'
  ],
  contacts: [
    'id', 'tenant_id', 'organisation_id', 'first_name', 'last_name',
    'job_title', 'job_title_group', 'department', 'seniority_level',
    'email', 'phone_direct', 'mobile', 'preferred_contact_method', 'preferred_contact_time',
    'is_primary_contact', 'is_decision_maker', 'is_delivery_contact', 'is_safeguarding_relevant', 'is_first_outreach_contact',
    'consent_to_contact', 'lawful_basis', 'consent_date', 'marketing_opt_out',
    'status', 'relationship_strength', 'last_contact_date', 'next_follow_up_date', 'owner_id',
    'metadata', 'tags', 'notes', 'created_by', 'created_at', 'updated_at'
  ],
  programmes: [
    'id', 'tenant_id', 'organisation_id', 'programme_name', 'programme_type', 'programme_category',
    'academic_year', 'term', 'delivery_model', 'target_year_groups', 'target_student_count', 'actual_student_count',
    'priority_groups', 'intended_outcomes', 'selection_criteria', 'referral_route',
    'start_date', 'end_date', 'session_count_planned', 'session_count_delivered',
    'delivery_day', 'delivery_time', 'venue',
    'lead_contact_id', 'safeguarding_contact_id', 'programme_manager_id',
    'volunteer_needed_count', 'volunteer_assigned_count',
    'funding_opportunity_id', 'budget', 'funding_status',
    'status', 'baseline_date', 'review_date', 'completion_date',
    'impact_summary', 'risk_log', 'metadata', 'tags', 'created_by', 'created_at', 'updated_at'
  ],
  students: [
    'id', 'tenant_id', 'organisation_id', 'programme_id', 'cohort_id',
    'first_name', 'last_name', 'year_group', 'age', 'gender', 'postcode_prefix',
    'fsm_flag', 'pupil_premium_flag', 'eal_flag', 'sen_stage', 'primary_need',
    'attendance_band', 'behaviour_flag', 'looked_after_flag', 'young_carer_flag',
    'referral_reason', 'referral_source', 'referral_date',
    'consent_status', 'consent_date', 'consent_given_by', 'consent_relationship',
    'media_consent', 'consent_withdrawal_date', 'consent_withdrawal_reason',
    'safeguarding_flag', 'safeguarding_level', 'support_notes',
    'start_date', 'end_date', 'completion_status', 'withdrawal_reason', 'destination',
    'metadata', 'tags', 'created_by', 'created_at', 'updated_at'
  ],
  volunteers: [
    'id', 'tenant_id', 'organisation_id', 'contact_id',
    'first_name', 'last_name', 'email', 'phone', 'postcode', 'region',
    'employer', 'industry_background', 'skills',
    'preferred_age_phase', 'preferred_region', 'travel_limit',
    'dbs_status', 'dbs_certificate_number', 'dbs_issue_date', 'dbs_expiry_date',
    'safeguarding_training_date', 'safeguarding_training_expiry',
    'reference_status', 'induction_date', 'induction_completed',
    'recruitment_stage', 'recruitment_source',
    'availability', 'assigned_coordinator_id',
    'hours_committed', 'hours_completed', 'attendance_rate', 'feedback_score', 'reengagement_interest',
    'emergency_contact_name', 'emergency_contact_phone',
    'status', 'metadata', 'tags', 'notes', 'created_by', 'created_at', 'updated_at'
  ]
};

// Check current schema for each table
for (const [tableName, targetColumns] of Object.entries(targetSchemas)) {
  console.log(`\n=== ${tableName.toUpperCase()} ===`);
  
  // Get current columns from database
  const currentColumnsResult = await client.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = $1 AND table_schema = 'public'
    ORDER BY ordinal_position
  `, [tableName]);
  
  const currentColumns = currentColumnsResult.rows.map(r => r.column_name);
  
  console.log(`Current: ${currentColumns.length} columns`);
  console.log(`Target: ${targetColumns.length} columns`);
  
  // Find missing columns
  const missingColumns = targetColumns.filter(col => !currentColumns.includes(col));
  
  if (missingColumns.length > 0) {
    console.log(`\nMissing ${missingColumns.length} columns:`);
    // Group by category for readability
    const categorized: Record<string, string[]> = {};
    
    for (const col of missingColumns) {
      // Simple categorization
      if (col.includes('_percent') || col.includes('_flag') || col.includes('fsm') || col.includes('sen') || col.includes('attendance')) {
        categorized['education_fields'] = categorized['education_fields'] || [];
        categorized['education_fields'].push(col);
      } else if (col.includes('trust_') || col.includes('number_of_schools') || col.includes('ceo') || col.includes('lead')) {
        categorized['trust_fields'] = categorized['trust_fields'] || [];
        categorized['trust_fields'].push(col);
      } else if (col.includes('sponsor') || col.includes('sector') || col.includes('csr')) {
        categorized['sponsor_fields'] = categorized['sponsor_fields'] || [];
        categorized['sponsor_fields'].push(col);
      } else if (col.includes('relationship') || col.includes('status') || col.includes('priority') || col.includes('owner')) {
        categorized['relationship_fields'] = categorized['relationship_fields'] || [];
        categorized['relationship_fields'].push(col);
      } else if (col.includes('metadata') || col.includes('tags') || col.includes('source')) {
        categorized['extensible_fields'] = categorized['extensible_fields'] || [];
        categorized['extensible_fields'].push(col);
      } else if (col.includes('consent') || col.includes('gdpr') || col.includes('lawful')) {
        categorized['consent_fields'] = categorized['consent_fields'] || [];
        categorized['consent_fields'].push(col);
      } else if (col.includes('safeguarding')) {
        categorized['safeguarding_fields'] = categorized['safeguarding_fields'] || [];
        categorized['safeguarding_fields'].push(col);
      } else if (col.includes('dbs') || col.includes('training') || col.includes('reference') || col.includes('induction')) {
        categorized['compliance_fields'] = categorized['compliance_fields'] || [];
        categorized['compliance_fields'].push(col);
      } else {
        categorized['other'] = categorized['other'] || [];
        categorized['other'].push(col);
      }
    }
    
    for (const [category, cols] of Object.entries(categorized)) {
      console.log(`  ${category.toUpperCase()}: ${cols.join(', ')}`);
    }
  } else {
    console.log("\nAll target columns present!");
  }
  
  // Show current column count vs target
  const gap = targetColumns.length - currentColumns.length;
  console.log(`\nGap: ${gap} columns (${currentColumns.length} → ${targetColumns.length})`);
}

// Check for missing entities from architecture plan
console.log("\n\n=== MISSING ENTITIES ===");
const missingEntities = [
  'programme_cohorts',
  'sessions', // Note: renamed to programme_sessions per decision
  'session_attendance',
  'funders', // exists but needs expansion
  'funding_opportunities', // exists as opportunities, needs renaming
  'placements', // exists but needs expansion
  'tenant_field_visibility',
  'record_type_configs',
  'outcome_frameworks',
  'outcome_records',
  'safeguarding_notes',
  'safeguarding_access_log',
  'consent_records',
  'parent_guardians',
  'attachments',
  'report_types',
  'saved_reports',
  'dashboards',
  'change_events',
  'field_history',
  'automation_rules'
];

// Check which of these exist
for (const entity of missingEntities) {
  const existsResult = await client.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = $1
    )
  `, [entity]);
  
  if (!existsResult.rows[0].exists) {
    console.log(`- ${entity}`);
  }
}

// Check routes
console.log("\n\n=== ROUTE ANALYSIS ===");
console.log("Note: Route analysis requires code inspection, not database query");
console.log("Based on TASKS.md and architecture plan, missing routes include:");
console.log("- Field visibility API routes");
console.log("- Record type API routes");
console.log("- Programme cohorts, sessions, attendance routes");
console.log("- Outcomes, safeguarding, consent routes");
console.log("- Reporting engine routes");
console.log("- Automation rules routes");

// Check module keys
console.log("\n\n=== MODULE KEY ANALYSIS ===");
console.log("Current module keys (from feature_flags table):");
const moduleKeysResult = await client.query(`SELECT module FROM feature_flags ORDER BY module`);
const currentModules = moduleKeysResult.rows.map(r => r.module);
console.log(currentModules.join(', '));

const targetModules = [
  'organisations', 'contacts', 'outreach', 'volunteers', 'funders', 'pipeline', 'reports', 'support',
  'cohorts', 'sessions', 'outcomes', 'safeguarding', 'consent_management', 'attachments',
  'school_enrichment', 's106_funding', 'automation', 'field_history'
];

const missingModules = targetModules.filter(m => !currentModules.includes(m));
if (missingModules.length > 0) {
  console.log(`\nMissing ${missingModules.length} module keys:`);
  console.log(missingModules.join(', '));
} else {
  console.log("\nAll module keys present!");
}

await client.end();