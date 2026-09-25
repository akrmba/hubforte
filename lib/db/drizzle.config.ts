import { defineConfig } from "drizzle-kit";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load from api-server .env (single source of truth for DATABASE_URL)
config({ path: path.resolve(__dirname, "../../artifacts/api-server/.env") });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

// SAFETY: After the unified data model migration (0001), schema changes MUST
// be applied via SQL migration files in lib/db/migrations/, NOT drizzle-kit push.
// drizzle-kit push will attempt to reconcile the schema with the database and may
// drop columns, alter constraints, or corrupt migrated data.
// Set DRIZZLE_PUSH_OVERRIDE=1 to bypass this guard (e.g. for local dev reset).
if (process.argv.some(a => a === 'push') && !process.env.DRIZZLE_PUSH_OVERRIDE) {
  throw new Error(
    "drizzle-kit push is BLOCKED after the unified data model migration.\n" +
    "Use SQL migration files in lib/db/migrations/ instead.\n" +
    "To override (local dev only): DRIZZLE_PUSH_OVERRIDE=1 pnpm drizzle-kit push"
  );
}

export default defineConfig({
  schema: "./src/schema/index.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});