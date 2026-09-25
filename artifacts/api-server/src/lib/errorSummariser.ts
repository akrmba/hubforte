import { db, errorLogsTable } from "@workspace/db";
import { eq, isNull } from "drizzle-orm";
import { logger } from "./logger";
import { getRequestId } from "./requestContext";
import { chatCompletion, getAvailableProviders } from "./aiProvider";

function fallbackSummary(message: string, route?: string | null): string {
  const lower = message.toLowerCase();

  if (lower.includes("econnrefused")) {
    return "The database server is not reachable. Check Neon/PostgreSQL is running and DATABASE_URL is correct.";
  }
  if (/jwt|token/i.test(message)) {
    return "Authentication failed. The user's login session may have expired.";
  }
  if (lower.includes("not null constraint") || lower.includes("not-null constraint")) {
    return "A required field was left empty when saving data.";
  }
  if (lower.includes("unique constraint")) {
    return "A duplicate record was detected — this email or name already exists.";
  }
  if (lower.includes("etimedout")) {
    return "A network request timed out. Check internet connectivity and external service status.";
  }
  if (lower.includes("foreign key")) {
    return "A related record could not be found — the linked item may have been deleted.";
  }
  if (lower.includes("permission denied")) {
    return "The database user does not have permission to perform this operation.";
  }

  const routeLabel = route ? ` in the ${route} endpoint` : "";
  return `An unexpected error occurred${routeLabel}. Check the stack trace.`;
}

async function summariseWithAI(
  errorMessage: string,
  stack: string,
  route?: string | null,
  method?: string | null
): Promise<string> {
  if (getAvailableProviders().length === 0) {
    return fallbackSummary(errorMessage, route);
  }

  try {
    const prompt = `You are a plain English error translator for a UK charity CRM called Hubforte.
Given this error, explain in 2-3 sentences:
(1) what went wrong,
(2) what the user was trying to do when it happened,
(3) what the likely cause is,
(4) what a developer should check first.
Write for a non-technical business owner. Be specific.

Route: ${route ?? "unknown"}
Method: ${method ?? "unknown"}
Error: ${errorMessage}
Stack (first 500 chars): ${(stack || "").slice(0, 500)}`;

    const response = await chatCompletion({ prompt });
    return response.content.trim() || fallbackSummary(errorMessage, route);
  } catch (err) {
    logger.warn(
      {
        err,
        event: "external_api_call",
        feature: "errorSummariser",
        success: false,
        requestId: getRequestId(),
      },
      "AI summarisation failed, using fallback"
    );
    return fallbackSummary(errorMessage, route);
  }
}

export async function runSummariserJob(): Promise<void> {
  try {
    const unsummarised = await db
      .select({
        id: errorLogsTable.id,
        message: errorLogsTable.message,
        stack: errorLogsTable.stack,
        route: errorLogsTable.route,
        method: errorLogsTable.method,
      })
      .from(errorLogsTable)
      .where(isNull(errorLogsTable.plainEnglish))
      .limit(20);

    if (unsummarised.length === 0) return;

    let processed = 0;
    for (const row of unsummarised) {
      try {
        const summary = await summariseWithAI(
          row.message,
          row.stack || "",
          row.route,
          row.method
        );
        await db
          .update(errorLogsTable)
          .set({ plainEnglish: summary })
          .where(eq(errorLogsTable.id, row.id));
        processed++;
      } catch (err) {
        logger.error({ err, errorLogId: row.id }, "Failed to summarise error log");
      }
    }

    if (processed > 0) {
      logger.info({ count: processed }, "Error summariser: processed errors");
    }
  } catch (err) {
    logger.error({ err }, "Error summariser job failed");
  }
}

let intervalHandle: ReturnType<typeof setInterval> | null = null;

export function startErrorSummariser(): void {
  logger.info("Error summariser started (runs every 30 seconds)");

  // Run once on start after a short delay
  setTimeout(() => {
    runSummariserJob().catch(() => {});
  }, 5_000);

  intervalHandle = setInterval(() => {
    runSummariserJob().catch(() => {});
  }, 30_000);
}

export function stopErrorSummariser(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
