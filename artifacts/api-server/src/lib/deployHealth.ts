import { logger } from "./logger";
import { writeErrorLog } from "./errorLogger";
import { notifyAdminUsers } from "./notifications";
import { enableMaintenanceMode, getMaintenanceStatus } from "./maintenanceMode";

/**
 * Called when post-deploy health checks fail.
 * This does NOT attempt automatic fixes — it detects and contains.
 * A human must trigger the rollback manually.
 */
export async function handleDeployFailure(details: {
  checks: string[];
  commitHash?: string;
  timestamp: string;
}): Promise<void> {
  const summary = details.checks.join("; ");

  logger.fatal({
    event: "deploy_failed",
    commitHash: details.commitHash,
    failedChecks: details.checks,
    timestamp: details.timestamp,
  }, "POST-DEPLOY HEALTH CHECK FAILED");

  // 1. Write a critical error_log entry
  writeErrorLog({
    level: "ERROR",
    source: "system",
    route: "POST-DEPLOY-CHECK",
    method: "SCRIPT",
    statusCode: 500,
    errorMessage: `Deploy failed for commit ${details.commitHash || "unknown"}: ${summary}`,
    stack: `Failed checks:\n${details.checks.map((c, i) => `  ${i + 1}. ${c}`).join("\n")}`.slice(0, 10000),
  });

  // 2. Send in-app notification to SUPER_ADMIN
  await notifyAdminUsers({
    title: "Deploy Failed — Action Required",
    message: `Post-deploy health check failed. Failed checks: ${summary}. Follow ops/ROLLBACK_RUNBOOK.md immediately. Do NOT disable maintenance mode.`,
    type: "ERROR",
    link: "/super-admin",
  });

  // 3. Re-enable maintenance mode if it was disabled too early
  const status = getMaintenanceStatus();
  if (!status.enabled) {
    logger.warn({ event: "maintenance_re_enabled", reason: "deploy_failure" }, "Re-enabling maintenance mode due to deploy failure");
    await enableMaintenanceMode(
      "system",
      "We're performing scheduled maintenance. We'll be back shortly.",
      "Pending investigation"
    );
  }
}
