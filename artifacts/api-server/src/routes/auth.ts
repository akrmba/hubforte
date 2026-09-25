import { Router, type IRouter } from "express";
import { db, usersTable, gmailCredentialsTable, passwordResetTokensTable, tenantsTable, userBackupCodesTable } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";
import * as crypto from "crypto";
import { generateSecret, generateURI, verify as totpVerify } from "otplib";
import * as QRCode from "qrcode";
import bcryptjs from "bcryptjs";
import { generateToken, authMiddleware } from "../lib/auth";
import { generateId } from "../lib/id";
import { logger } from "../lib/logger";
import { checkRateLimit } from "../lib/rateLimiter";
import { sendGmailEmail } from "../lib/gmail";
import { getRequestId } from "../lib/requestContext";
import { writeAuditLog } from "../lib/audit";

const router: IRouter = Router();

// In-memory store for pending 2FA challenges. Keyed by opaque random ID.
// Each entry expires after 15 minutes — same window as the old tempToken JWT.
const pending2fa = new Map<string, { userId: string; expiresAt: number }>();
const PENDING_2FA_TTL_MS = 15 * 60 * 1000;

router.post("/auth/login", async (req, res): Promise<void> => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  try {
    await checkRateLimit("auth", ip);
  } catch {
    res.status(429).json({ error: "Too many requests. Please try again later." });
    return;
  }

  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: "Email and password required" });
    return;
  }

  logger.info({ event: 'auth_login_attempt', email, ip, requestId: getRequestId() });

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (!user || !user.active) {
    logger.warn({ event: 'auth_login_failure', email, reason: 'user_not_found_or_inactive', ip, requestId: getRequestId() });
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  if (user.passwordHash) {
    const valid = await bcryptjs.compare(password, user.passwordHash);
    if (!valid) {
      logger.warn({ event: 'auth_login_failure', email, reason: 'invalid_password', ip, requestId: getRequestId() });
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
  } else {
    logger.warn({ event: 'auth_login_failure', email, reason: 'no_password_set', ip, requestId: getRequestId() });
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const token = generateToken(user.id);
  logger.info({ event: 'auth_login_success', userId: user.id, email, requestId: getRequestId() });

  // Audit log — login success
  writeAuditLog({
    userId: user.id,
    userRole: user.role,
    tenantId: user.role === "SUPER_ADMIN" ? null : user.tenantId ?? null,
    action: "LOGIN",
    entityType: "user",
    entityId: user.id,
    route: req.originalUrl,
    method: "POST",
    ipAddress: ip,
  });

  // If 2FA is enabled, issue an opaque challenge ID instead of a JWT in the body.
  // The ID maps to the userId server-side; no token material is exposed to the client.
  if ((user as any).totpEnabled) {
    const challengeId = crypto.randomBytes(32).toString("hex");
    pending2fa.set(challengeId, { userId: user.id, expiresAt: Date.now() + PENDING_2FA_TTL_MS });
    res.json({ requires2FA: true, tempToken: challengeId });
    return;
  }

  const isProduction = process.env.NODE_ENV === "production";
  res.cookie("crm_session", token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: "/",
  });

  res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      active: user.active,
      image: user.image,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
  });
});

router.post("/auth/logout", (req, res): void => {
  const user = (req as any).user;
  logger.info({ event: 'auth_logout', userId: user?.id ?? null, requestId: getRequestId() });
  if (user) {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    writeAuditLog({
      userId: user.id,
      userRole: user.role,
      tenantId: user.role === "SUPER_ADMIN" ? null : user.tenantId ?? null,
      action: "LOGOUT",
      entityType: "user",
      entityId: user.id,
      route: req.originalUrl,
      method: "POST",
      ipAddress: ip,
    });
  }
  res.clearCookie("crm_session", { path: "/" });
  res.json({ success: true });
});

router.get("/auth/me", authMiddleware, async (req, res): Promise<void> => {
  const user = req.user!;
  const [full] = await db.select().from(usersTable).where(eq(usersTable.id, user.id));
  if (!full) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  // Fetch owner-controlled tenant flags so the frontend can gate BYOK and diagnosis UI
  let byokEnabled = false;
  let aiDiagnosisEnabled = false;
  if (full.tenantId) {
    const [tenant] = await db
      .select({ byokEnabled: tenantsTable.byokEnabled, aiDiagnosisEnabled: tenantsTable.aiDiagnosisEnabled })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, full.tenantId))
      .limit(1);
    byokEnabled = tenant?.byokEnabled ?? false;
    aiDiagnosisEnabled = tenant?.aiDiagnosisEnabled ?? false;
  }

  res.json({
    id: full.id,
    name: full.name,
    email: full.email,
    role: full.role,
    active: full.active,
    image: full.image,
    createdAt: full.createdAt,
    updatedAt: full.updatedAt,
    totpEnabled: !!(full as any).totpEnabled,
    byokEnabled,
    aiDiagnosisEnabled,
  });
});

router.get("/auth/gmail", authMiddleware, async (req, res): Promise<void> => {
  const clientId = process.env.GMAIL_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GMAIL_REDIRECT_URI || `${process.env.NEXTAUTH_URL || ""}/api/gmail/callback`;

  if (!clientId) {
    res.status(400).json({ error: "Gmail not configured" });
    return;
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly",
    access_type: "offline",
    prompt: "consent",
    state: req.user!.id,
  });

  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  res.json({ url });
});

router.get("/gmail/callback", async (req, res): Promise<void> => {
  const { code, state: userId, error } = req.query as Record<string, string>;
  const frontendOrigin = process.env.FRONTEND_URL || (process.env.NODE_ENV === "development" ? "http://localhost:5173" : "");

  if (error) {
    res.redirect(`${frontendOrigin}/#/settings?gmail_error=${encodeURIComponent(error)}`);
    return;
  }

  const clientId = process.env.GMAIL_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GMAIL_REDIRECT_URI || `${process.env.NEXTAUTH_URL || ""}/api/gmail/callback`;

  if (!clientId || !clientSecret) {
    res.redirect("/#/settings?gmail_error=not_configured");
    return;
  }

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
    });
    const tokenData = await tokenRes.json() as any;
    if (!tokenData.refresh_token) throw new Error("No refresh token returned");

    await db.delete(gmailCredentialsTable).where(eq(gmailCredentialsTable.userId, userId));
    await db.insert(gmailCredentialsTable).values({
      id: generateId("gmc"),
      userId,
      refreshToken: tokenData.refresh_token,
      accessToken: tokenData.access_token,
      expiresAt: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null,
    });

    res.redirect(`${frontendOrigin}/#/settings?gmail_connected=1`);
  } catch (e: any) {
    res.redirect(`${frontendOrigin}/#/settings?gmail_error=${encodeURIComponent(e.message || "oauth_failed")}`);
  }
});

router.post("/auth/gmail/disconnect", authMiddleware, async (req, res): Promise<void> => {
  await db.delete(gmailCredentialsTable).where(eq(gmailCredentialsTable.userId, req.user!.id));
  await db.update(usersTable).set({ gmailRefreshToken: null }).where(eq(usersTable.id, req.user!.id));
  res.json({ success: true });
});

router.get("/auth/gmail/status", authMiddleware, async (req, res): Promise<void> => {
  const [cred] = await db
    .select()
    .from(gmailCredentialsTable)
    .where(eq(gmailCredentialsTable.userId, req.user!.id));

  res.json({
    connected: !!cred,
    email: cred ? process.env.GMAIL_FROM_ADDRESS || null : null,
  });
});

router.post("/auth/forgot-password", async (req, res): Promise<void> => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  try { await checkRateLimit("auth", ip); } catch {
    res.status(429).json({ error: "Too many requests. Please try again later." }); return;
  }

  const { email } = req.body;
  if (!email) {
    res.status(400).json({ error: "Email required" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (!user || !user.active) {
    res.json({ message: "If that email is registered you will receive a reset link shortly" });
    return;
  }

  await db.delete(passwordResetTokensTable).where(eq(passwordResetTokensTable.userId, user.id));

  const token = generateId("prt") + generateId("prt");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await db.insert(passwordResetTokensTable).values({ token, userId: user.id, expiresAt });

  const appUrl = process.env.APP_URL || "http://localhost:5173";
  const resetLink = `${appUrl}/reset-password?token=${token}`;

  // Audit log — password reset requested
  writeAuditLog({
    userId: user.id,
    userRole: user.role,
    tenantId: user.role === "SUPER_ADMIN" ? null : user.tenantId ?? null,
    action: "PASSWORD_RESET_REQUESTED",
    entityType: "user",
    entityId: user.id,
    route: req.originalUrl,
    method: "POST",
    ipAddress: ip,
  });

  // Try to send via Gmail if credentials exist
  const [gmailCred] = await db.select().from(gmailCredentialsTable).limit(1);
  if (gmailCred && gmailCred.refreshToken) {
    const fromAddress = process.env.GMAIL_FROM_ADDRESS || "noreply@hubforte.com";
    try {
      await sendGmailEmail({
        to: user.email!,
        subject: "Reset your Hubforte password",
        body: `You requested a password reset for your Hubforte account.\n\nClick this link to reset your password:\n${resetLink}\n\nThis link expires in 1 hour.\n\nIf you did not request this, you can safely ignore this email.`,
        from: fromAddress,
        refreshToken: gmailCred.refreshToken,
      });
      logger.info({ email: user.email }, "Password reset email sent via Gmail");
    } catch (err) {
      logger.error({ err, email: user.email }, "Failed to send password reset email via Gmail, falling back to console");
      logger.info({ token, email: user.email, resetLink }, "[DEV] Password reset token — use this to reset password");
    }
  } else {
    logger.info({ token, email: user.email, resetLink }, "[DEV] Password reset token — use this to reset password (Gmail not configured)");
    res.json({ message: "If that email is registered you will receive a reset link shortly", emailConfigured: false });
    return;
  }

  res.json({ message: "If that email is registered you will receive a reset link shortly" });
});

router.post("/auth/reset-password", async (req, res): Promise<void> => {
  const { token, password } = req.body;
  if (!token || !password) {
    res.status(400).json({ error: "Token and new password required" });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }

  const [record] = await db
    .select()
    .from(passwordResetTokensTable)
    .where(and(eq(passwordResetTokensTable.token, token), gt(passwordResetTokensTable.expiresAt, new Date())));

  if (!record) {
    res.status(400).json({ error: "This reset link is invalid or has expired" });
    return;
  }

  const [resetUser] = await db
    .select({ role: usersTable.role, tenantId: usersTable.tenantId })
    .from(usersTable)
    .where(eq(usersTable.id, record.userId));
  const passwordHash = await bcryptjs.hash(password, 12);
  await db.update(usersTable).set({ passwordHash }).where(eq(usersTable.id, record.userId));
  await db.delete(passwordResetTokensTable).where(eq(passwordResetTokensTable.token, token));

  // Audit log — password reset completed
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  writeAuditLog({
    userId: record.userId,
    userRole: resetUser?.role || "unknown",
    tenantId: resetUser?.role === "SUPER_ADMIN" ? null : resetUser?.tenantId ?? null,
    action: "PASSWORD_RESET_COMPLETED",
    entityType: "user",
    entityId: record.userId,
    route: req.originalUrl,
    method: "POST",
    ipAddress: ip,
  });

  res.json({ message: "Password updated successfully" });
});

router.post("/auth/register", async (req, res): Promise<void> => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  try { await checkRateLimit("auth", ip); } catch {
    res.status(429).json({ error: "Too many requests. Please try again later." }); return;
  }

  const { inviteToken, name, password } = req.body;
  if (!inviteToken || !name || !password) {
    res.status(400).json({ error: "Invite token, name, and password required" });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.inviteToken, inviteToken), gt(usersTable.inviteTokenExpiresAt, new Date())));

  if (!user) {
    res.status(400).json({ error: "Invalid or expired invite token" });
    return;
  }

  const passwordHash = await bcryptjs.hash(password, 12);
  await db.update(usersTable).set({
    name,
    passwordHash,
    inviteToken: null,
    inviteTokenExpiresAt: null,
    active: true,
  }).where(eq(usersTable.id, user.id));

  const token = generateToken(user.id);
  const isProduction = process.env.NODE_ENV === "production";
  res.cookie("crm_session", token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: "/",
  });

  // Audit log — invite accepted / registration completed
  writeAuditLog({
    userId: user.id,
    userRole: user.role,
    tenantId: user.role === "SUPER_ADMIN" ? null : user.tenantId ?? null,
    action: "INVITE_ACCEPTED",
    entityType: "user",
    entityId: user.id,
    route: req.originalUrl,
    method: "POST",
    changes: { email: user.email, role: user.role },
    ipAddress: ip,
  });

  res.json({ success: true, user: { id: user.id, email: user.email, role: user.role } });
});

// ── Self-service registration ──────────────────────────────────────────────

router.post("/auth/self-register", async (req, res): Promise<void> => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  try { await checkRateLimit("auth", ip); } catch {
    res.status(429).json({ error: "Too many requests. Please try again later." }); return;
  }

  const { workspaceName, firstName, lastName, email, password, agreedToTerms } = req.body;

  if (!workspaceName || workspaceName.length < 2 || workspaceName.length > 100)
    { res.status(400).json({ error: "Workspace name must be 2–100 characters" }); return; }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    { res.status(400).json({ error: "Valid email required" }); return; }
  if (!password || password.length < 8 || !/[0-9]/.test(password) || !/[a-zA-Z]/.test(password))
    { res.status(400).json({ error: "Password must be at least 8 characters and contain a letter and a number" }); return; }
  if (!agreedToTerms)
    { res.status(400).json({ error: "You must agree to the terms of service" }); return; }
  if (!firstName || !lastName)
    { res.status(400).json({ error: "First and last name required" }); return; }

  const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (existing) { res.status(400).json({ error: "An account with this email already exists" }); return; }

  const tenantId = generateId("ten");
  const userId = generateId("usr");
  const verificationToken = crypto.randomBytes(32).toString("hex");
  const verificationTokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const passwordHash = await bcryptjs.hash(password, 12);
  const slug = workspaceName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + tenantId.slice(-6);

  await db.insert(tenantsTable).values({
    id: tenantId,
    name: workspaceName,
    slug,
    status: "pending_verification",
    plan: "trial",
  });

  await db.insert(usersTable).values({
    id: userId,
    name: `${firstName} ${lastName}`,
    email,
    passwordHash,
    role: "ADMIN",
    active: false,
    tenantId,
    verificationToken,
    verificationTokenExpiresAt,
    status: "pending_verification",
  } as any);

  const appUrl = process.env.APP_URL || process.env.NEXTAUTH_URL || "http://localhost:5173";
  const verifyUrl = `${appUrl}/api/auth/verify?token=${verificationToken}`;

  const gmailConfigured = !!process.env.GMAIL_REFRESH_TOKEN;
  if (gmailConfigured) {
    try {
      await sendGmailEmail({
        to: email,
        subject: "Verify your email to activate your Hubforte workspace",
        html: `<p>Hi ${firstName},</p><p>Click the link below to verify your email and activate your workspace:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p><p>This link expires in 24 hours.</p>`,
        text: `Hi ${firstName},\n\nVerify your email: ${verifyUrl}\n\nThis link expires in 24 hours.`,
      } as any);
    } catch (err: any) {
      logger.warn({ event: "verify_email_send_failed", err: err.message });
    }
  } else {
    logger.info(`[DEV EMAIL] Verify URL: ${verifyUrl}`);
  }

  res.json({ message: "Check your email to verify your account." });
});

router.get("/auth/verify", async (req, res): Promise<void> => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  try { await checkRateLimit("auth", ip); } catch {
    res.status(429).json({ error: "Too many requests. Please try again later." }); return;
  }

  const { token } = req.query as { token?: string };
  if (!token) { res.status(400).json({ error: "Token required" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.verificationToken as any, token)).limit(1);
  if (!user) { res.status(400).json({ error: "Invalid or expired verification token" }); return; }

  // Enforce 24-hour expiry on verification tokens
  const expiresAt = (user as any).verificationTokenExpiresAt as Date | null;
  if (!expiresAt || expiresAt < new Date()) {
    res.status(400).json({
      error: true,
      code: "TOKEN_EXPIRED",
      message: "This verification link has expired. Please register again or use the resend option.",
    });
    return;
  }

  await db.update(usersTable).set({
    active: true,
    status: "active",
    verificationToken: null,
    verificationTokenExpiresAt: null,
  } as any).where(eq(usersTable.id, user.id));

  if (user.tenantId) {
    await db.update(tenantsTable).set({ status: "active" } as any).where(eq(tenantsTable.id, user.tenantId));
  }

  const frontendOrigin = process.env.FRONTEND_URL || process.env.NEXTAUTH_URL || "http://localhost:5173";
  res.redirect(`${frontendOrigin}/login?verified=true`);
});

// ── Resend verification email ──────────────────────────────────────────────

router.post("/auth/resend-verification", async (req, res): Promise<void> => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  try { await checkRateLimit("auth", ip); } catch {
    res.status(429).json({ error: "Too many requests. Please try again later." }); return;
  }

  const { email } = req.body as { email: string };
  if (!email) { res.status(400).json({ error: "Email required" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  // Always return success to avoid email enumeration
  if (!user || (user as any).status !== "pending_verification") {
    res.json({ message: "If that email is pending verification, a new link has been sent." });
    return;
  }

  const newToken = crypto.randomBytes(32).toString("hex");
  const newExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await db.update(usersTable).set({ verificationToken: newToken, verificationTokenExpiresAt: newExpiresAt } as any).where(eq(usersTable.id, user.id));

  const appUrl = process.env.APP_URL || process.env.NEXTAUTH_URL || "http://localhost:5173";
  const verifyUrl = `${appUrl}/api/auth/verify?token=${newToken}`;
  const firstName = user.name?.split(" ")[0] || "there";

  const gmailConfigured = !!process.env.GMAIL_REFRESH_TOKEN;
  if (gmailConfigured) {
    try {
      await sendGmailEmail({
        to: email,
        subject: "Verify your Hubforte workspace email",
        html: `<p>Hi ${firstName},</p><p>Click the link below to verify your email:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p>`,
        text: `Hi ${firstName},\n\nVerify your email: ${verifyUrl}`,
      } as any);
    } catch {}
  } else {
    logger.info(`[DEV EMAIL] Resend Verify URL: ${verifyUrl}`);
  }

  res.json({ message: "If that email is pending verification, a new link has been sent." });
});

router.post("/auth/2fa/setup", authMiddleware, async (req, res): Promise<void> => {
  const user = req.user!;
  const secret = generateSecret();
  const appName = "Hubforte";
  const otpAuthUrl = generateURI({ secret, account: user.email || user.id, issuer: appName, type: "totp" } as any);
  const qrCodeUrl = await QRCode.toDataURL(otpAuthUrl);

  await db.update(usersTable).set({ totpPendingSecret: secret } as any).where(eq(usersTable.id, user.id));

  res.json({ secret, qrCodeUrl, manualEntryCode: secret });
});

router.post("/auth/2fa/verify-setup", authMiddleware, async (req, res): Promise<void> => {
  const user = req.user!;
  const { token } = req.body as { token: string };

  const [full] = await db.select().from(usersTable).where(eq(usersTable.id, user.id)).limit(1);
  if (!full?.totpPendingSecret) { res.status(400).json({ error: "No pending 2FA setup" }); return; }

  const valid = totpVerify({ token, secret: full.totpPendingSecret });
  if (!valid) { res.status(400).json({ error: "Invalid code. Please try again." }); return; }

  await db.update(usersTable).set({
    totpSecret: full.totpPendingSecret,
    totpEnabled: true,
    totpPendingSecret: null,
  } as any).where(eq(usersTable.id, user.id));

  // Delete any existing backup codes before generating new ones
  await db.delete(userBackupCodesTable).where(eq(userBackupCodesTable.userId, user.id));

  // Generate 8 backup codes
  const backupCodes: string[] = [];
  for (let i = 0; i < 8; i++) {
    const code = crypto.randomBytes(5).toString("hex").toUpperCase();
    backupCodes.push(code);
    const codeHash = await bcryptjs.hash(code, 10);
    await db.insert(userBackupCodesTable).values({
      id: generateId("bkp"),
      userId: user.id,
      codeHash,
    });
  }

  res.json({ backupCodes });
});

router.post("/auth/2fa/disable", authMiddleware, async (req, res): Promise<void> => {
  const user = req.user!;
  const { currentPassword, token } = req.body as { currentPassword: string; token: string };

  const [full] = await db.select().from(usersTable).where(eq(usersTable.id, user.id)).limit(1);
  if (!full?.passwordHash) { res.status(400).json({ error: "Cannot verify identity" }); return; }

  const passwordValid = await bcryptjs.compare(currentPassword, full.passwordHash);
  if (!passwordValid) { res.status(401).json({ error: "Incorrect password" }); return; }

  if (!full.totpSecret) { res.status(400).json({ error: "2FA is not enabled" }); return; }
  const totpValid = totpVerify({ token, secret: full.totpSecret });
  if (!totpValid) { res.status(401).json({ error: "Invalid authenticator code" }); return; }

  await db.update(usersTable).set({ totpEnabled: false, totpSecret: null, totpPendingSecret: null } as any).where(eq(usersTable.id, user.id));
  // Delete all backup codes on disable so they can't be used after re-enable
  await db.delete(userBackupCodesTable).where(eq(userBackupCodesTable.userId, user.id));
  res.json({ success: true });
});

router.post("/auth/2fa/complete", async (req, res): Promise<void> => {
  const { tempToken, code } = req.body as { tempToken: string; code: string };
  if (!tempToken || !code) { res.status(400).json({ error: "tempToken and code required" }); return; }

  // Look up the opaque challenge ID — no JWT verification needed
  const challenge = pending2fa.get(tempToken);
  if (!challenge || Date.now() > challenge.expiresAt) {
    pending2fa.delete(tempToken);
    res.status(401).json({ error: "Invalid or expired token" }); return;
  }
  const userId = challenge.userId;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user || !user.totpSecret) { res.status(401).json({ error: "User not found" }); return; }

  // Try TOTP first
  const totpValid = totpVerify({ token: code, secret: user.totpSecret });
  if (!totpValid) {
    // Try backup codes
    const backupCodes = await db.select().from(userBackupCodesTable)
      .where(and(eq(userBackupCodesTable.userId, userId), eq(userBackupCodesTable.usedAt as any, null)));
    let matched = false;
    for (const bc of backupCodes) {
      if (await bcryptjs.compare(code.toUpperCase(), bc.codeHash)) {
        await db.update(userBackupCodesTable).set({ usedAt: new Date() }).where(eq(userBackupCodesTable.id, bc.id));
        matched = true;
        break;
      }
    }
    if (!matched) { res.status(401).json({ error: "Invalid code" }); return; }
  }

  const sessionToken = generateToken(user.id);
  pending2fa.delete(tempToken); // consume the challenge
  const isProduction = process.env.NODE_ENV === "production";
  res.cookie("crm_session", sessionToken, {
    httpOnly: true, secure: isProduction, sameSite: "strict",
    maxAge: 30 * 24 * 60 * 60 * 1000, path: "/",
  });
  res.json({ success: true, user: { id: user.id, email: user.email, role: user.role } });
});

export default router;
