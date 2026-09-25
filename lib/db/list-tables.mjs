import { Client } from 'pg';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { config } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../artifacts/api-server/.env') });

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const res = await client.query(
  `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
);
console.log('Tables in public schema:');
for (const row of res.rows) {
  console.log(`  ${row.table_name}`);
}

// Check migration journal
const mig = await client.query(`SELECT * FROM drizzle_migrations ORDER BY id`);
console.log('\nDrizzle migrations:');
for (const row of mig.rows) {
  console.log(`  ${row.id}: ${row.migration_name}`);
}

await client.end();
