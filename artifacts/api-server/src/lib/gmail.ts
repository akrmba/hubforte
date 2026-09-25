import { logger } from "./logger";
import { getRequestId } from "./requestContext";

// --- Resilience helpers (P3-T3) ---
const GMAIL_TIMEOUT_MS = 30_000;
const GMAIL_MAX_RETRIES = 2;
const RETRYABLE_STATUS = new Set([429, 500, 503]);

function isRetryable(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return true;
  if (err instanceof TypeError) return true; // network error
  return false;
}

function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUS.has(status);
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithRetry(url: string, init: RequestInit, opts: { timeoutMs: number; maxRetries: number; label: string }): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, init, opts.timeoutMs);
      if (response.ok || !isRetryableStatus(response.status) || attempt === opts.maxRetries) {
        return response;
      }
      logger.warn({ event: "integration_retry", service: "gmail", method: opts.label, attempt: attempt + 1, status: response.status, requestId: getRequestId() }, `Retrying ${opts.label} (status ${response.status})`);
    } catch (err) {
      lastError = err;
      if (!isRetryable(err) || attempt === opts.maxRetries) throw err;
      logger.warn({ event: "integration_retry", service: "gmail", method: opts.label, attempt: attempt + 1, requestId: getRequestId() }, `Retrying ${opts.label} (network/timeout error)`);
    }
    // Exponential backoff: 1s, 4s
    await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
  }
  throw lastError;
}

export interface EmailAttachment {
  filename: string;
  mimeType: string;
  content: Buffer;
}

interface SendEmailOptions {
  to: string;
  subject: string;
  body: string;
  from: string;
  refreshToken: string;
  attachments?: EmailAttachment[];
}

interface SendEmailResult {
  messageId: string;
  threadId: string;
}

async function getAccessToken(refreshToken: string): Promise<string> {
  const clientId = process.env.GMAIL_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;

  const apiStart = Date.now();
  // No retry for auth flows per INTEGRATION_RESILIENCE.md
  const response = await fetchWithTimeout("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId!,
      client_secret: clientSecret!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  }, GMAIL_TIMEOUT_MS);

  if (!response.ok) {
    const error = await response.text();
    logger.warn({ event: 'external_api_call', service: 'google', method: 'oauth2.token_refresh', durationMs: Date.now() - apiStart, success: false, requestId: getRequestId() }, "Gmail token refresh failed");
    throw new Error(`Failed to refresh access token: ${error}`);
  }

  logger.info({ event: 'external_api_call', service: 'google', method: 'oauth2.token_refresh', durationMs: Date.now() - apiStart, success: true, requestId: getRequestId() });
  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

function buildMimeMessage(from: string, to: string, subject: string, body: string, attachments?: EmailAttachment[]): string {
  if (!attachments || attachments.length === 0) {
    const message = [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=utf-8",
      "",
      body,
    ].join("\r\n");
    return Buffer.from(message).toString("base64url");
  }

  const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const parts: string[] = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    body,
  ];

  for (const att of attachments) {
    parts.push(
      `--${boundary}`,
      `Content-Type: ${att.mimeType}; name="${att.filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${att.filename}"`,
      "",
      att.content.toString("base64"),
    );
  }

  parts.push(`--${boundary}--`);
  return Buffer.from(parts.join("\r\n")).toString("base64url");
}

export async function sendGmailEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const { to, subject, body, from, refreshToken } = options;

  const accessToken = await getAccessToken(refreshToken);
  const raw = buildMimeMessage(from, to, subject, body, options.attachments);

  const apiStart = Date.now();
  const response = await fetchWithRetry(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    },
    { timeoutMs: GMAIL_TIMEOUT_MS, maxRetries: GMAIL_MAX_RETRIES, label: "messages.send" },
  );

  if (!response.ok) {
    const error = await response.text();
    logger.warn({ event: 'external_api_call', service: 'gmail', method: 'messages.send', durationMs: Date.now() - apiStart, success: false, requestId: getRequestId() }, "Gmail send failed");
    throw new Error(`Gmail send failed: ${error}`);
  }

  logger.info({ event: 'external_api_call', service: 'gmail', method: 'messages.send', durationMs: Date.now() - apiStart, success: true, requestId: getRequestId() });
  const data = (await response.json()) as { id: string; threadId: string };
  return { messageId: data.id, threadId: data.threadId };
}

export async function exchangeCodeForTokens(code: string): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date }> {
  const clientId = process.env.GMAIL_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GMAIL_REDIRECT_URI || "";

  const apiStart = Date.now();
  // No retry for auth flows per INTEGRATION_RESILIENCE.md
  const response = await fetchWithTimeout("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId!,
      client_secret: clientSecret!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  }, GMAIL_TIMEOUT_MS);

  if (!response.ok) {
    const error = await response.text();
    logger.warn({ event: 'external_api_call', service: 'google', method: 'oauth2.code_exchange', durationMs: Date.now() - apiStart, success: false, requestId: getRequestId() }, "Token exchange failed");
    throw new Error(`Token exchange failed: ${error}`);
  }

  logger.info({ event: 'external_api_call', service: 'google', method: 'oauth2.code_exchange', durationMs: Date.now() - apiStart, success: true, requestId: getRequestId() });

  const data = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  };
}
