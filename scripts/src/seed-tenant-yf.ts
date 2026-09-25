import pg from "pg";
import { randomUUID } from "crypto";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config({ path: path.resolve(__dirname, "../../artifacts/api-server/.env") });

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("DATABASE_URL must be set in artifacts/api-server/.env");
  process.exit(1);
}

const YES_FUTURES_TENANT = {
  id: "00000000-0000-0000-0000-000000000001",
  name: "YesFutures",
  slug: "yesfutures",
  active: true,
  suspended: false,
} as const;

type TenantRow = {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  suspended: boolean;
};

type FeatureFlagRow = {
  module: string;
  enabled: boolean;
  updated_by: string | null;
};

type SummarySnapshot = {
  globalFeatureFlags: number;
  tenantFeatureFlags: number;
  usersAssignedToTenant: number;
  usersWithoutTenant: number;
  tenantExists: boolean;
};

function formatSnapshot(label: string, snapshot: SummarySnapshot) {
  console.log(`\n=== ${label} ===`);
  console.log(`Tenant exists: ${snapshot.tenantExists ? "yes" : "no"}`);
  console.log(`Global feature_flags rows: ${snapshot.globalFeatureFlags}`);
  console.log(`tenant_feature_flags rows for YesFutures: ${snapshot.tenantFeatureFlags}`);
  console.log(`Users assigned to YesFutures: ${snapshot.usersAssignedToTenant}`);
  console.log(`Users without tenant_id: ${snapshot.usersWithoutTenant}`);
}

async function fetchTenantById(client: pg.Client): Promise<TenantRow | null> {
  const result = await client.query<TenantRow>(
    `SELECT id, name, slug, active, suspended
     FROM tenants
     WHERE id = $1`,
    [YES_FUTURES_TENANT.id],
  );

  return result.rows[0] ?? null;
}

async function fetchTenantBySlug(client: pg.Client): Promise<TenantRow | null> {
  const result = await client.query<TenantRow>(
    `SELECT id, name, slug, active, suspended
     FROM tenants
     WHERE slug = $1`,
    [YES_FUTURES_TENANT.slug],
  );

  return result.rows[0] ?? null;
}

function assertExpectedTenant(tenant: TenantRow) {
  const mismatches: string[] = [];

  if (tenant.id !== YES_FUTURES_TENANT.id) mismatches.push(`id=${tenant.id}`);
  if (tenant.name !== YES_FUTURES_TENANT.name) mismatches.push(`name=${tenant.name}`);
  if (tenant.slug !== YES_FUTURES_TENANT.slug) mismatches.push(`slug=${tenant.slug}`);
  if (tenant.active !== YES_FUTURES_TENANT.active) mismatches.push(`active=${tenant.active}`);
  if (tenant.suspended !== YES_FUTURES_TENANT.suspended) mismatches.push(`suspended=${tenant.suspended}`);

  if (mismatches.length > 0) {
    throw new Error(`Existing tenant record does not match expected YesFutures values: ${mismatches.join(", ")}`);
  }
}

async function fetchSummarySnapshot(client: pg.Client): Promise<SummarySnapshot> {
  const tenant = await fetchTenantById(client);
  const globalFlags = await client.query<{ count: string }>(`SELECT COUNT(*) AS count FROM feature_flags`);
  const tenantFlags = await client.query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM tenant_feature_flags
     WHERE tenant_id = $1`,
    [YES_FUTURES_TENANT.id],
  );
  const assignedUsers = await client.query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM users
     WHERE tenant_id = $1`,
    [YES_FUTURES_TENANT.id],
  );
  const unassignedUsers = await client.query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM users
     WHERE tenant_id IS NULL`,
  );

  return {
    globalFeatureFlags: Number(globalFlags.rows[0]?.count ?? 0),
    tenantFeatureFlags: Number(tenantFlags.rows[0]?.count ?? 0),
    usersAssignedToTenant: Number(assignedUsers.rows[0]?.count ?? 0),
    usersWithoutTenant: Number(unassignedUsers.rows[0]?.count ?? 0),
    tenantExists: tenant !== null,
  };
}

async function fetchGlobalFeatureFlags(client: pg.Client): Promise<FeatureFlagRow[]> {
  const result = await client.query<FeatureFlagRow>(
    `SELECT module, enabled, updated_by
     FROM feature_flags
     ORDER BY module`,
  );

  return result.rows;
}

async function run() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    const before = await fetchSummarySnapshot(client);
    formatSnapshot("Before seed", before);

    await client.query("BEGIN");

    const tenantInsert = await client.query(
      `INSERT INTO tenants (id, name, slug, active, suspended, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       ON CONFLICT DO NOTHING`,
      [
        YES_FUTURES_TENANT.id,
        YES_FUTURES_TENANT.name,
        YES_FUTURES_TENANT.slug,
        YES_FUTURES_TENANT.active,
        YES_FUTURES_TENANT.suspended,
      ],
    );

    const tenantById = await fetchTenantById(client);
    const tenantBySlug = await fetchTenantBySlug(client);

    if (!tenantById) {
      if (tenantBySlug && tenantBySlug.id !== YES_FUTURES_TENANT.id) {
        throw new Error(
          `Tenant slug '${YES_FUTURES_TENANT.slug}' already exists with a different id (${tenantBySlug.id})`,
        );
      }

      throw new Error("YesFutures tenant was not found after insert attempt");
    }

    assertExpectedTenant(tenantById);

    const globalFeatureFlags = await fetchGlobalFeatureFlags(client);
    let featureFlagsCopied = 0;
    let featureFlagsSkipped = 0;

    for (const featureFlag of globalFeatureFlags) {
      const insertResult = await client.query(
        `INSERT INTO tenant_feature_flags (id, tenant_id, module, enabled, updated_at, updated_by)
         VALUES ($1, $2, $3, $4, NOW(), $5)
         ON CONFLICT (tenant_id, module) DO NOTHING`,
        [
          randomUUID(),
          YES_FUTURES_TENANT.id,
          featureFlag.module,
          featureFlag.enabled,
          featureFlag.updated_by,
        ],
      );

      if ((insertResult.rowCount ?? 0) > 0) {
        featureFlagsCopied += 1;
      } else {
        featureFlagsSkipped += 1;
      }
    }

    const usersUpdatedResult = await client.query(
      `UPDATE users
       SET tenant_id = $1, updated_at = NOW()
       WHERE tenant_id IS NULL`,
      [YES_FUTURES_TENANT.id],
    );

    await client.query("COMMIT");

    const after = await fetchSummarySnapshot(client);
    formatSnapshot("After seed", after);

    console.log("\n=== Migration actions ===");
    console.log(`Tenant created: ${(tenantInsert.rowCount ?? 0) > 0 ? "yes" : "no (already existed)"}`);
    console.log(`Feature flags found to copy: ${globalFeatureFlags.length}`);
    console.log(`Feature flags copied: ${featureFlagsCopied}`);
    console.log(`Feature flags skipped by ON CONFLICT: ${featureFlagsSkipped}`);
    console.log(`Users updated with tenant_id: ${usersUpdatedResult.rowCount ?? 0}`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("Failed to seed YesFutures tenant:", error);
    process.exit(1);
  } finally {
    await client.end();
  }

  process.exit(0);
}

run();
