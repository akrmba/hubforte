import { Client } from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { config } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../artifacts/api-server/.env') });

const sql = readFileSync(resolve(__dirname, 'drizzle/0004_ai_logs_columns.sql'), 'utf-8');

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  await client.query(sql);
  console.log('Migration completed successfully.');
} catch (err) {
  console.error('Migration FAILED:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
