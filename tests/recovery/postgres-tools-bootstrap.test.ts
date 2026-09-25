import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";

const projectRoot = path.resolve(__dirname, "../..");
const launcher = path.join(projectRoot, "scripts/run-git-bash.mjs");

function runBootstrap(customPath: string) {
  return execFileSync(
    "node",
    [
      launcher,
      "-lc",
      [
        `export PATH=${JSON.stringify(customPath)}`,
        "source scripts/lib/postgres-tools.sh",
        "ensure_postgres_tools_on_path",
        "printf 'pg_dump=%s\\n' \"$(command -v pg_dump)\"",
        "printf 'psql=%s\\n' \"$(command -v psql)\"",
        "pg_dump --version | head -1",
        "psql --version | head -1",
      ].join("\n"),
    ],
    { cwd: projectRoot, encoding: "utf8" },
  )
    .trim()
    .split("\n");
}

describe("postgres tool bootstrap", () => {
  it("makes pg_dump and psql runnable when PATH does not already contain PostgreSQL tools", () => {
    const [pgDumpLine, psqlLine, pgDumpVersion, psqlVersion] = runBootstrap("/usr/bin:/bin");

    expect(pgDumpLine.replace(/\\/g, "/")).toMatch(/pg_dump=.+\/scripts\/lib\/pg_dump$/);
    expect(psqlLine.replace(/\\/g, "/")).toMatch(/psql=.+\/scripts\/lib\/psql$/);
    expect(pgDumpVersion).toContain("pg_dump");
    expect(psqlVersion).toContain("psql");
  });
});
