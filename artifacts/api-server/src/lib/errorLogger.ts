import { createHash } from "crypto";
import { db, errorLogsTable } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";
import { generateId } from "./id";
import { logger } from "./logger";

interface ErrorLogInput {
  level: "ERROR" | "WARN" | "INFO" | "CRITICAL";
  source: "api" | "frontend" | "worker" | "system";
  route?: string;
  method?: string;
  statusCode?: number;
  requestId?: string;   // internal correlation ID — never shown to customers
  errorRefId?: string;  // customer/support reference — ERR-YYYY-MMDD-XXXX format
  tenantId?: string;    // which tenant was affected — required for founder incident model
  userId?: string;
  errorMessage: string;
  stack?: string;
  requestBody?: string;
  metadata?: Record<string, unknown>;
}

export async function writeErrorLog(input: ErrorLogInput): Promise<void> {
  const stackPrefix = (input.stack ?? "").slice(0, 100);
  const hash = createHash("md5")
    .update(`${input.route}|${input.errorMessage}|${stackPrefix}`)
    .digest("hex");

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

  try {
    const existing = await db
      .select()
      .from(errorLogsTable)
      .where(
        and(
          eq(errorLogsTable.resolved, false),
          gt(errorLogsTable.createdAt, cutoff),
          eq(errorLogsTable.dedupHash, hash)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(errorLogsTable)
        .set({
          occurrenceCount: (existing[0].occurrenceCount ?? 1) + 1,
          lastOccurredAt: new Date(),
        })
        .where(eq(errorLogsTable.id, existing[0].id));
      return;
    }

    await db.insert(errorLogsTable).values({
      id: generateId("err"),
      level: input.level,
      message: input.errorMessage,
      source: input.source,
      route: input.route ?? null,
      method: input.method ?? null,
      statusCode: input.statusCode ?? null,
      requestId: input.requestId ?? null,
      errorRefId: input.errorRefId ?? null,
      tenantId: input.tenantId ?? null,
      userId: input.userId ?? null,
      stack: input.stack ?? null,
      requestBody: input.requestBody ?? null,
      dedupHash: hash,
      resolved: false,
      occurrenceCount: 1,
      lastOccurredAt: new Date(),
      plainEnglish: null,
      metadata: input.metadata ?? null,
    });
  } catch (err) {
    logger.error({ err }, "writeErrorLog failed");
  }
}
