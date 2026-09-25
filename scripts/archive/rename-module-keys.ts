import pg from "pg";
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

const MODULE_MAPPINGS = [
  { oldModule: "yf_schools", newModule: "schools" },
  { oldModule: "yf_trusts", newModule: "trusts" },
  { oldModule: "yf_sponsors", newModule: "sponsors" },
  { oldModule: "yf_funding", newModule: "funding" },
  { oldModule: "yf_programmes", newModule: "programmes" },
  { oldModule: "yf_students", newModule: "students" },
  { oldModule: "yf_volunteers", newModule: "volunteers" },
] as const;

type ModuleMapping = (typeof MODULE_MAPPINGS)[number];
type FeatureFlagRow = {
  id: string;
  module: string;
  enabled: boolean;
};

type MigrationStats = {
  renamed: number;
  deduped: number;
  enabledMerged: number;
  skipped: number;
};

const LEGACY_MODULES: Set<string> = new Set(MODULE_MAPPINGS.map((mapping) => mapping.oldModule));

async function fetchFeatureFlagByModule(client: pg.Client, module: string): Promise<FeatureFlagRow | null> {
  const result = await client.query<FeatureFlagRow>(
    `SELECT id, module, enabled
     FROM feature_flags
     WHERE module = $1`,
    [module],
  );

  return result.rows[0] ?? null;
}

async function fetchAllFeatureFlags(client: pg.Client): Promise<Array<Pick<FeatureFlagRow, "module" | "enabled">>> {
  const result = await client.query<Pick<FeatureFlagRow, "module" | "enabled">>(
    `SELECT module, enabled
     FROM feature_flags
     ORDER BY module`,
  );

  return result.rows;
}

async function printFeatureFlagSummary(client: pg.Client, label: string) {
  const rows = await fetchAllFeatureFlags(client);
  const legacyRows = rows.filter((row) => LEGACY_MODULES.has(row.module));

  console.log(`\n=== ${label} ===`);
  console.log(`feature_flags rows: ${rows.length}`);

  for (const row of rows) {
    console.log(`  ${row.module}: ${row.enabled ? "enabled" : "disabled"}`);
  }

  console.log(
    legacyRows.length > 0
      ? `Legacy module rows remaining: ${legacyRows.map((row) => row.module).join(", ")}`
      : "Legacy module rows remaining: none",
  );
}

async function applyModuleRename(client: pg.Client, mapping: ModuleMapping): Promise<MigrationStats> {
  const legacyRow = await fetchFeatureFlagByModule(client, mapping.oldModule);
  const targetRow = await fetchFeatureFlagByModule(client, mapping.newModule);

  if (!legacyRow) {
    console.log(`[skip] ${mapping.oldModule} -> ${mapping.newModule}: no legacy row found`);
    return { renamed: 0, deduped: 0, enabledMerged: 0, skipped: 1 };
  }

  if (!targetRow) {
    await client.query(
      `UPDATE feature_flags
       SET module = $2, updated_at = NOW()
       WHERE id = $1`,
      [legacyRow.id, mapping.newModule],
    );

    console.log(`[rename] ${mapping.oldModule} -> ${mapping.newModule}: renamed row ${legacyRow.id}`);
    return { renamed: 1, deduped: 0, enabledMerged: 0, skipped: 0 };
  }

  const mergedEnabled = legacyRow.enabled || targetRow.enabled;
  let enabledMerged = 0;

  if (mergedEnabled !== targetRow.enabled) {
    await client.query(
      `UPDATE feature_flags
       SET enabled = $2, updated_at = NOW()
       WHERE id = $1`,
      [targetRow.id, mergedEnabled],
    );
    enabledMerged = 1;
    console.log(
      `[merge] ${mapping.oldModule} -> ${mapping.newModule}: kept ${mapping.newModule} row ${targetRow.id} and set enabled=${mergedEnabled}`,
    );
  } else {
    console.log(
      `[merge] ${mapping.oldModule} -> ${mapping.newModule}: kept existing ${mapping.newModule} row ${targetRow.id} (enabled=${targetRow.enabled})`,
    );
  }

  await client.query(
    `DELETE FROM feature_flags
     WHERE id = $1`,
    [legacyRow.id],
  );

  console.log(`[delete] removed legacy duplicate row ${legacyRow.id} for ${mapping.oldModule}`);

  return { renamed: 0, deduped: 1, enabledMerged, skipped: 0 };
}

async function assertNoLegacyModulesRemain(client: pg.Client) {
  const result = await client.query<{ module: string }>(
    `SELECT module
     FROM feature_flags
     WHERE module = ANY($1::text[])
     ORDER BY module`,
    [Array.from(LEGACY_MODULES)],
  );

  if (result.rowCount && result.rowCount > 0) {
    throw new Error(`Legacy module keys still present: ${result.rows.map((row) => row.module).join(", ")}`);
  }
}

async function run() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    await printFeatureFlagSummary(client, "Before rename");

    await client.query("BEGIN");

    const totals: MigrationStats = { renamed: 0, deduped: 0, enabledMerged: 0, skipped: 0 };

    for (const mapping of MODULE_MAPPINGS) {
      const stats = await applyModuleRename(client, mapping);
      totals.renamed += stats.renamed;
      totals.deduped += stats.deduped;
      totals.enabledMerged += stats.enabledMerged;
      totals.skipped += stats.skipped;
    }

    await assertNoLegacyModulesRemain(client);
    await client.query("COMMIT");

    console.log("\n=== Migration actions ===");
    console.log(`Renamed rows: ${totals.renamed}`);
    console.log(`Deduplicated rows: ${totals.deduped}`);
    console.log(`Enabled-state merges: ${totals.enabledMerged}`);
    console.log(`Skipped mappings: ${totals.skipped}`);

    await printFeatureFlagSummary(client, "After rename");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("Failed to rename feature flag module keys:", error);
    process.exit(1);
  } finally {
    await client.end();
  }

  process.exit(0);
}

run();
