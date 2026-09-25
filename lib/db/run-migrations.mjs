import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../../artifacts/api-server/.env') });

const { Pool } = pg;
const migrationsDir = path.resolve(__dirname, 'migrations');

// Apply each migration in its own connection so a failure in one
// does not leave a transaction-aborted state that blocks all subsequent ones.
const toApply = [
  '0002_tenant_infrastructure_up.sql',
  '0003_tenant_id_all_tables_up.sql',
  '0004_tenant_status_up.sql',
  '0005_tenant_field_visibility_up.sql',
  '0006_record_type_configs_up.sql',
  '0006b_programme_cohorts_sessions_up.sql',  // creates programme_cohorts/sessions/attendance
  '0007_outcome_frameworks_and_records_up.sql',
  '0008_safeguarding_tables_up.sql',
  '0009_consent_and_parent_guardians_up.sql',
  '0010_attachments_up.sql',
  '0011_reporting_tables_up.sql',
  '0012_phase7_cdc_automation_up.sql',
  '0013_lms_column_extensions_up.sql',
  '0014_lms_tables_up.sql',
  '0015_lms_public_session_nullable_token_up.sql',
  '0016b_audit_logs_up.sql',
  '0016_audit_logs_user_agent_up.sql',
  '0017_lms_snapshot_uniqueness_up.sql',
  '0018_import_jobs_up.sql',
  '0019_export_jobs_up.sql',
  '0020_auth_2fa_up.sql',
  '0021_user_backup_codes_up.sql',
  '0022_job_title_up.sql',
  '0023_emergency_account_up.sql',
  '0024_incidents_up.sql',
  '0025_report_schedules_up.sql',
  '0026_integrations_up.sql',
  '0027_incidents_status_page_id_up.sql',
  '0028_tenant_ai_config_up.sql',
  '0029_lead_score_up.sql',
  '0030_tenant_owner_flags_up.sql',
  '0031_registered_apps_up.sql',
  '0032_error_knowledge_base_up.sql',
  '0033_role_enum_developer_up.sql',
  '0034_verification_token_expiry_up.sql',
  '0035_performance_indexes_up.sql',
  '0036_emergency_activated_at_up.sql',
];

let ok = 0, err = 0;

for (const file of toApply) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    await client.query(sql);
    console.log(`OK  ${file}`);
    ok++;
  } catch (e) {
    console.error(`ERR ${file} — ${e.message.split('\n')[0]}`);
    err++;
  } finally {
    client.release();
    await pool.end();
  }
}

console.log(`\nDone: ${ok} OK, ${err} errors`);
