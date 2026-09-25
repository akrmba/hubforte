import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(__dirname, "../..");
const sampleUrl =
  "postgresql://test_user:test_password@db.example.invalid/test_db?sslmode=require&channel_binding=require";
const launcher = path.join(projectRoot, "scripts/run-git-bash.mjs");

function runParser() {
  const command = `set -euo pipefail
source scripts/lib/database-url.sh
parse_database_url '${sampleUrl}'
printf 'user=%s\npass=%s\nhost=%s\nport=%s\ndb=%s\n' "$DB_USER" "$DB_PASS" "$DB_HOST" "$DB_PORT" "$DB_NAME"`;

  const output = execFileSync("node", [launcher, "-lc", command], {
    cwd: projectRoot,
    encoding: "utf8",
  });

  const parsed = Object.fromEntries(
    output
      .trim()
      .split("\n")
      .map((line) => line.split(/=(.*)/s).slice(0, 2)),
  );
  return parsed;
}

describe("DATABASE_URL parsing for backup and restore scripts", () => {
  it("uses the shared parser sourced by backup and restore scripts", () => {
    const backupScript = fs.readFileSync(path.join(projectRoot, "scripts/backup.sh"), "utf8");
    const restoreScript = fs.readFileSync(path.join(projectRoot, "scripts/restore.sh"), "utf8");
    const parsed = runParser();

    expect(backupScript).toContain('source "${SCRIPT_DIR}/lib/database-url.sh"');
    expect(restoreScript).toContain('source "${SCRIPT_DIR}/lib/database-url.sh"');

    expect(parsed.user).toBe("neondb_owner");
    expect(parsed.host).toBe("db.example.invalid");
    expect(parsed.port).toBe("5432");
    expect(parsed.db).toBe("neondb");
  });

  it("builds a disposable test database URL without rewriting the username", () => {
    const testDbName = "hubforte_restore_test_123";
    const currentScriptResult = execFileSync(
      "node",
      [
        launcher,
        "-lc",
        [
          "source scripts/lib/database-url.sh",
          `build_database_url_with_db_name ${JSON.stringify(sampleUrl)} ${JSON.stringify(testDbName)}`,
        ].join("\n"),
      ],
      { cwd: projectRoot, encoding: "utf8" },
    ).trim();

    expect(currentScriptResult).toBe(
      `postgresql://test_user:test_password@db.example.invalid/test_db?sslmode=require&channel_binding=require`,
    );
  });
});
