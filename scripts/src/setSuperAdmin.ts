import pg from "pg";
import bcrypt from "bcryptjs";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config({ path: path.resolve(__dirname, "../../artifacts/api-server/.env") });

const DATABASE_URL = process.env.DATABASE_URL;
const email = process.argv[2];

if (!DATABASE_URL) {
  console.error("DATABASE_URL must be set in artifacts/api-server/.env");
  process.exit(1);
}

if (!email) {
  console.error("Usage: tsx ./src/setSuperAdmin.ts <email>");
  process.exit(1);
}

async function run() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    // Try to update an existing user first
    const result = await client.query(
      `UPDATE users SET role = 'SUPER_ADMIN', updated_at = NOW() WHERE email = $1 RETURNING id, name, email, role`,
      [email]
    );

    if (result.rowCount! > 0) {
      const user = result.rows[0];
      console.log(`Set ${user.name} (${user.email}) to SUPER_ADMIN`);
    } else {
      // Create a new SUPER_ADMIN user
      const password = process.env.SEED_PASSWORD;
      if (!password) { console.error("ERROR: SEED_PASSWORD env var is required"); process.exit(1); }
      const passwordHash = await bcrypt.hash(password, 12);
      const id = crypto.randomUUID();
      const name = email.split("@")[0];

      await client.query(
        `INSERT INTO users (id, name, email, password_hash, role, active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'SUPER_ADMIN', true, NOW(), NOW())`,
        [id, name, email, passwordHash]
      );

      console.log(`Created new SUPER_ADMIN user: ${name} (${email})`);
    }
  } finally {
    await client.end();
  }

  process.exit(0);
}

run();
