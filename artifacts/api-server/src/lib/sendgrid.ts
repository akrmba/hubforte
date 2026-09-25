import { db, integrationConfigsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { decrypt } from "./encrypt";
import { logger } from "./logger";

interface SendGridConfig {
  apiKey: string;
  fromAddress: string;
  fromName?: string;
}

export async function getSendGridConfig(tenantId: string): Promise<SendGridConfig | null> {
  try {
    const [cfg] = await db
      .select()
      .from(integrationConfigsTable)
      .where(
        and(
          eq(integrationConfigsTable.tenantId, tenantId),
          eq(integrationConfigsTable.connectorKey, "sendgrid"),
          eq(integrationConfigsTable.active, true)
        )
      );
    if (!cfg) return null;
    return JSON.parse(decrypt(cfg.encryptedConfig)) as SendGridConfig;
  } catch (err) {
    logger.error({ err, tenantId }, "getSendGridConfig: failed to load config");
    return null;
  }
}

export async function sendViaSendGrid(
  tenantId: string,
  to: string,
  subject: string,
  htmlContent: string,
  textContent?: string
): Promise<boolean> {
  const config = await getSendGridConfig(tenantId);
  if (!config) return false;

  try {
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: config.fromAddress, name: config.fromName ?? "Hubforte" },
        subject,
        content: [
          ...(textContent ? [{ type: "text/plain", value: textContent }] : []),
          { type: "text/html", value: htmlContent },
        ],
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logger.error({ status: res.status, body, tenantId }, "SendGrid send failed");
      return false;
    }

    logger.info({ tenantId, to }, "Email sent via SendGrid");
    return true;
  } catch (err) {
    logger.error({ err, tenantId }, "sendViaSendGrid: fetch error");
    return false;
  }
}
