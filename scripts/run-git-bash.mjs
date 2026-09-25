import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const candidates = [
  process.env.GIT_BASH_PATH,
  "C:\\Program Files\\Git\\bin\\bash.exe",
  "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
].filter(Boolean);

const gitBash = candidates.find((candidate) => existsSync(candidate));

if (!gitBash) {
  console.error(
    "Git Bash not found. Set GIT_BASH_PATH or install Git for Windows in the default location.",
  );
  process.exit(1);
}

const result = spawnSync(gitBash, process.argv.slice(2), {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
  windowsHide: true,
});

if (result.error) {
  console.error(`Failed to launch Git Bash: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
