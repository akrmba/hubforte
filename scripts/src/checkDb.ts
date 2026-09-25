import pg from "pg";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../../artifacts/api-server/.env") });

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const flags = await client.query("SELECT module, enabled FROM feature_flags ORDER BY module");
console.log(`feature_flags rows: ${flags.rowCount}`);
for (const r of flags.rows) console.log(`  ${r.module}: ${r.enabled}`);

const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
const user = await client.query("SELECT id, email, role FROM users WHERE email = $1", [adminEmail]);
if (user.rows[0]) {
  console.log(`\nUser: ${user.rows[0].email} — role: ${user.rows[0].role} — id: ${user.rows[0].id}`);
} else {
  console.log(`\nUser ${adminEmail} NOT FOUND`);
}

await client.end();
