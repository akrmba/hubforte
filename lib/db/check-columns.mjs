import { Client } from 'pg';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { config } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../artifacts/api-server/.env') });

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const tables = ['organizations', 'contacts', 'opportunities', 'activities', 'volunteers', 'programmes', 'students', 'placements', 'funders'];

for (const table of tables) {
  const res = await client.query(
    `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`,
    [table]
  );
  console.log(`\n=== ${table} ===`);
  for (const row of res.rows) {
    console.log(`  ${row.column_name} (${row.data_type})`);
  }
}

await client.end();
