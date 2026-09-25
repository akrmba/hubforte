// systemEmail — sends a plain-text email using the configured Gmail credentials.
// Used for system-level notifications (daily briefing, etc.) that are not tenant-scoped.

import { db, gmailCredentialsTable } from "@workspace/db";
import { sendGmailEmail } from "./gmail";
import { logger } from "./logger";

export interface SystemEmailOptions {
  to: string;
  subject: string;
  text: string;
}

export async function sendSystemEmail(opts: SystemEmailOptions): Promise<void> {
  const fromAddress = process.env.GMAIL_FROM_ADDRESS;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

  if (!fromAddress || !refreshToken) {
    logger.warn({ to: opts.to }, "GMAIL_FROM_ADDRESS or GMAIL_REFRESH_TOKEN not set — cannot send system email");
    return;
  }

  await sendGmailEmail({
    to: opts.to,
    subject: opts.subject,
    body: opts.text,
    from: fromAddress,
    refreshToken,
  });
}
