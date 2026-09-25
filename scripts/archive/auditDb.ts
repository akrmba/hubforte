import pg from "pg";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../../artifacts/api-server/.env") });

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

console.log("=== Hubforte Database Audit ===\n");

// 1. List all tables
const tablesResult = await client.query(`
  SELECT 
    table_name,
    table_schema
  FROM information_schema.tables 
  WHERE table_schema = 'public' 
    AND table_type = 'BASE TABLE'
  ORDER BY table_name
`);

console.log(`Total tables: ${tablesResult.rowCount}\n`);

// 2. For each table: get row count, check for tenant_id, check foreign keys
const tableAudits: Array<{
  table: string;
  rowCount: number;
  hasTenantId: boolean;
  foreignKeys: Array<{ column: string; references: string }>;
  missingFkRefs?: Array<{ column: string; references: string; orphanCount: number }>;
}> = [];

for (const row of tablesResult.rows) {
  const tableName = row.table_name;
  
  // Get row count
  const countResult = await client.query(`SELECT COUNT(*) as count FROM "${tableName}"`);
  const rowCount = parseInt(countResult.rows[0].count);
  
  // Check if table has tenant_id column
  const columnsResult = await client.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = $1 AND column_name = 'tenant_id'
  `, [tableName]);
  const hasTenantId = columnsResult.rowCount > 0;
  
  // Get foreign key constraints
  const fkResult = await client.query(`
    SELECT
      kcu.column_name as column_name,
      ccu.table_name as foreign_table_name,
      ccu.column_name as foreign_column_name
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY' 
      AND tc.table_name = $1
  `, [tableName]);
  
  const foreignKeys = fkResult.rows.map(r => ({
    column: r.column_name,
    references: `${r.foreign_table_name}(${r.foreign_column_name})`
  }));
  
  tableAudits.push({
    table: tableName,
    rowCount,
    hasTenantId,
    foreignKeys
  });
  
  // Check for orphaned foreign key references (if any FKs exist)
  for (const fk of foreignKeys) {
    const [foreignTable, foreignColumn] = fk.references.replace(')', '').split('(');
    
    // Check if there are rows where the foreign key doesn't reference an existing row
    const orphanQuery = `
      SELECT COUNT(*) as orphan_count
      FROM "${tableName}" t
      LEFT JOIN "${foreignTable}" f ON t."${fk.column}" = f."${foreignColumn}"
      WHERE t."${fk.column}" IS NOT NULL
        AND f."${foreignColumn}" IS NULL
    `;
    
    try {
      const orphanResult = await client.query(orphanQuery);
      const orphanCount = parseInt(orphanResult.rows[0].orphan_count);
      
      if (orphanCount > 0) {
        if (!tableAudits[tableAudits.length - 1].missingFkRefs) {
          tableAudits[tableAudits.length - 1].missingFkRefs = [];
        }
        tableAudits[tableAudits.length - 1].missingFkRefs!.push({
          column: fk.column,
          references: fk.references,
          orphanCount
        });
      }
    } catch (error) {
      // Some queries might fail due to type mismatches or complex FKs
      console.error(`  Warning: Could not check orphans for ${tableName}.${fk.column} -> ${fk.references}`);
    }
  }
}

// Print results
console.log("=== Table Audit Results ===\n");

// Sort tables by row count (descending)
tableAudits.sort((a, b) => b.rowCount - a.rowCount);

let totalRows = 0;
let tablesWithTenantId = 0;
let tablesWithoutTenantId = 0;
let totalOrphanedRows = 0;

for (const audit of tableAudits) {
  totalRows += audit.rowCount;
  if (audit.hasTenantId) tablesWithTenantId++;
  else tablesWithoutTenantId++;
  
  const orphanCount = audit.missingFkRefs?.reduce((sum, fk) => sum + fk.orphanCount, 0) || 0;
  totalOrphanedRows += orphanCount;
  
  console.log(`${audit.table}:`);
  console.log(`  Rows: ${audit.rowCount}`);
  console.log(`  Tenant ID: ${audit.hasTenantId ? 'YES' : 'NO'}`);
  
  if (audit.foreignKeys.length > 0) {
    console.log(`  Foreign Keys: ${audit.foreignKeys.map(fk => `${fk.column} -> ${fk.references}`).join(', ')}`);
  }
  
  if (audit.missingFkRefs && audit.missingFkRefs.length > 0) {
    console.log(`  ORPHANED REFERENCES: ${orphanCount} total orphaned rows`);
    for (const fk of audit.missingFkRefs) {
      console.log(`    - ${fk.column} -> ${fk.references}: ${fk.orphanCount} orphaned rows`);
    }
  }
  
  console.log();
}

console.log("=== Summary ===");
console.log(`Total tables: ${tableAudits.length}`);
console.log(`Total rows across all tables: ${totalRows}`);
console.log(`Tables with tenant_id: ${tablesWithTenantId}`);
console.log(`Tables without tenant_id: ${tablesWithoutTenantId}`);
console.log(`Total orphaned foreign key references: ${totalOrphanedRows} rows`);

// List tables without tenant_id (important for multi-tenancy)
console.log("\n=== Tables WITHOUT tenant_id (potential multi-tenancy issues) ===");
const tablesWithoutTenant = tableAudits.filter(a => !a.hasTenantId).map(a => a.table);
if (tablesWithoutTenant.length > 0) {
  console.log(tablesWithoutTenant.join(', '));
} else {
  console.log("All tables have tenant_id - good!");
}

// List yf_* tables specifically
console.log("\n=== Hubforte (yf_*) Tables ===");
const yfTables = tableAudits.filter(a => a.table.startsWith('yf_'));
if (yfTables.length > 0) {
  yfTables.forEach(t => {
    console.log(`${t.table}: ${t.rowCount} rows, tenant_id: ${t.hasTenantId ? 'YES' : 'NO'}`);
  });
} else {
  console.log("No yf_* tables found");
}

await client.end();