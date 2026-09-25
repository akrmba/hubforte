import bcrypt from "bcryptjs";
import pg from "pg";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from api-server (single source of truth)
config({ path: path.resolve(__dirname, "../../artifacts/api-server/.env") });

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";
const SEED_PASSWORD = process.env.SEED_PASSWORD;
if (!SEED_PASSWORD) { console.error("ERROR: SEED_PASSWORD env var is required"); process.exit(1); }
const seedPassword = SEED_PASSWORD as string; // TypeScript narrowing — process.exit above guarantees non-null
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("DATABASE_URL must be set in artifacts/api-server/.env");
  process.exit(1);
}

// Import the shared module registry through the workspace package entrypoint.
import { getAllModuleKeys } from "@workspace/db";

// Use all module keys from the registry
const FEATURE_FLAG_MODULES = getAllModuleKeys();

async function seed() {
  const passwordHash = await bcrypt.hash(seedPassword, 12);

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    // Seed admin user
    const query = `
      INSERT INTO users (id, name, email, password_hash, role, active, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      ON CONFLICT (email) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        role = EXCLUDED.role,
        active = EXCLUDED.active,
        updated_at = NOW()
    `;

    const id = crypto.randomUUID();
    const name = ADMIN_EMAIL.split("@")[0];

    await client.query(query, [id, name, ADMIN_EMAIL, passwordHash, "ADMIN", true]);

    console.log(`Seeded admin user: ${ADMIN_EMAIL}`);

    // Seed feature flags (all enabled by default)
    for (const module of FEATURE_FLAG_MODULES) {
      await client.query(
        `INSERT INTO feature_flags (id, module, enabled, updated_at)
         VALUES ($1, $2, true, NOW())
         ON CONFLICT (module) DO NOTHING`,
        [crypto.randomUUID(), module]
      );
    }

    console.log(`Seeded ${FEATURE_FLAG_MODULES.length} feature flags (all enabled)`);

    // Seed remediation policies
    const REMEDIATION_POLICIES = [
      {
        id: "pol_retry_emails",
        name: "Retry Failed Campaign Emails",
        description: "Retries up to 50 failed outbound campaign emails",
        trigger: "Manual or scheduled evaluation",
        action: "Retry sending failed emails via Gmail API",
        is_enabled: true,
        requires_approval: true,
        max_auto_runs_per_day: 3,
        created_by_id: id,
      },
      {
        id: "pol_dbs_expired",
        name: "Flag Expired DBS Volunteers",
        description: "Flags volunteers whose DBS checks have expired",
        trigger: "dbs_expires_at < NOW() AND dbs_status = 'CLEAR'",
        action: "Update volunteer DBS status to EXPIRED and notify admins",
        is_enabled: true,
        requires_approval: true,
        max_auto_runs_per_day: 1,
        created_by_id: id,
      },
      {
        id: "pol_stale_tickets",
        name: "Close Stale Tickets",
        description: "Closes support tickets inactive for 30+ days",
        trigger: "updated_at < 30 days ago AND status NOT IN ('RESOLVED', 'CLOSED')",
        action: "Close ticket with inactivity note",
        is_enabled: false,
        requires_approval: true,
        max_auto_runs_per_day: 1,
        created_by_id: id,
      },
      {
        id: "pol_inactive_contacts",
        name: "Archive Inactive Contacts",
        description: "Archives contacts with no activity for 90+ days",
        trigger: "last_contacted_at < 90 days ago OR (no last_contacted_at AND created_at < 90 days ago)",
        action: "Set contact status to INACTIVE",
        is_enabled: false,
        requires_approval: true,
        max_auto_runs_per_day: 1,
        created_by_id: id,
      },
      {
        id: "pol_account_locked",
        name: "User account locked / login failing",
        description: "Detects 5+ failed login attempts for the same email in 10 minutes. Notifies admins with one-click reactivate option if account is inactive. Never changes passwords.",
        trigger: "5+ failed login attempts for same email in 10 minutes OR manual trigger by ADMIN",
        action: "Log event, check account active flag, notify ADMIN with reactivate option",
        is_enabled: true,
        requires_approval: true,
        max_auto_runs_per_day: 10,
        created_by_id: id,
      },
      {
        id: "pol_session_broken",
        name: "User session broken (401s)",
        description: "Detects same userId appearing in error logs with 401 status 3+ times in 5 minutes. Clears sessions server-side and sends in-app notification.",
        trigger: "same userId in error_logs with 401 status 3+ times in 5 minutes",
        action: "Clear user sessions (force re-login), send in-app notification",
        is_enabled: true,
        requires_approval: false,
        max_auto_runs_per_day: 20,
        created_by_id: id,
      },
      {
        id: "pol_campaign_stuck",
        name: "Campaign stuck in sending state",
        description: "Detects campaigns with SENDING status and no campaign_contacts updated in 30 minutes. Pauses the campaign and notifies ADMIN.",
        trigger: "campaign status SENDING and no campaign_contacts updated in 30 minutes",
        action: "Pause campaign, log stall, notify ADMIN",
        is_enabled: true,
        requires_approval: false,
        max_auto_runs_per_day: 10,
        created_by_id: id,
      },
      {
        id: "pol_gmail_expired",
        name: "Gmail token expired causing send failures",
        description: "Detects outbound_emails showing Gmail auth errors for a userId. Flags connection as expired, notifies user to reconnect, pauses pending campaigns.",
        trigger: "outbound_emails with gmail auth error for a userId",
        action: "Flag Gmail connection expired, notify user, pause pending campaigns",
        is_enabled: true,
        requires_approval: false,
        max_auto_runs_per_day: 5,
        created_by_id: id,
      },
      {
        id: "pol_worker_down",
        name: "Background worker not responding",
        description: "Detects worker down via /api/health/detailed. Logs critical error, notifies SUPER_ADMIN immediately, pauses all campaigns.",
        trigger: "/api/health/detailed shows worker down (no worker requests in 5 minutes)",
        action: "Log critical error, notify SUPER_ADMIN, pause all campaigns",
        is_enabled: true,
        requires_approval: false,
        max_auto_runs_per_day: 5,
        created_by_id: id,
      },
    ];

    for (const policy of REMEDIATION_POLICIES) {
      await client.query(
        `INSERT INTO remediation_policies (id, name, description, trigger, action, is_enabled, requires_approval, max_auto_runs_per_day, created_by_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
         ON CONFLICT (name) DO UPDATE SET
           description = EXCLUDED.description,
           trigger = EXCLUDED.trigger,
           action = EXCLUDED.action,
           is_enabled = EXCLUDED.is_enabled,
           requires_approval = EXCLUDED.requires_approval,
           max_auto_runs_per_day = EXCLUDED.max_auto_runs_per_day,
           updated_at = NOW()`,
        [
          policy.id,
          policy.name,
          policy.description,
          policy.trigger,
          policy.action,
          policy.is_enabled,
          policy.requires_approval,
          policy.max_auto_runs_per_day,
          policy.created_by_id,
        ]
      );
    }

    console.log(`Seeded ${REMEDIATION_POLICIES.length} remediation policies`);
  } catch (err) {
    console.error("Failed to seed:", err);
    process.exit(1);
  } finally {
    await client.end();
  }

  process.exit(0);
}

seed();
