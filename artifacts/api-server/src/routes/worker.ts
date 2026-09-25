import { Router, type IRouter } from "express";
import {
  activitiesTable,
  campaignContactsTable,
  campaignsTable,
  contactsTable,
  db,
  gmailCredentialsTable,
  lmsAccessTokensTable,
  lmsPublicSessionsTable,
  organizationsTable,
  outboundEmailsTable,
  usersTable,
} from "@workspace/db";
import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";
import { generateId } from "../lib/id";
import { sendGmailEmail } from "../lib/gmail";
import { logger } from "../lib/logger";
import { createNotification } from "../lib/notifications";
import { mergeTemplate } from "../lib/templateEngine";
import { processCampaignSendLoop, WorkerProcessError } from "../lib/workerCampaignProcessor";
import { recordWorkerHeartbeat } from "../lib/workerRuntimeState";

const router: IRouter = Router();

router.post("/worker/process-campaign", async (req, res): Promise<void> => {
  const expectedSecret = process.env.WORKER_SECRET;
  const workerSecret = req.headers["x-worker-secret"];
  if (!expectedSecret || !workerSecret || workerSecret !== expectedSecret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { campaignId } = req.body;
  if (!campaignId) {
    res.status(400).json({ error: "campaignId is required" });
    return;
  }

  recordWorkerHeartbeat({
    status: "running",
    action: "worker-request-received",
    campaignId,
    shuttingDown: false,
  });

  try {
    const result = await processCampaignSendLoop(campaignId, {
      getCampaign: async (id) => {
        const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, id)).limit(1);
        return campaign ?? null;
      },
      getOwner: async (ownerId, tenantId) => {
        const [owner] = await db
          .select({ id: usersTable.id, email: usersTable.email, name: usersTable.name })
          .from(usersTable)
          .where(and(eq(usersTable.id, ownerId), tenantId ? eq(usersTable.tenantId, tenantId) : undefined))
          .limit(1);
        return owner ?? null;
      },
      getGmailCredential: async (ownerId, tenantId) => {
        const [credential] = await db
          .select({ refreshToken: gmailCredentialsTable.refreshToken })
          .from(gmailCredentialsTable)
          .where(and(
            eq(gmailCredentialsTable.userId, ownerId),
            tenantId ? eq(gmailCredentialsTable.tenantId, tenantId) : undefined,
          ))
          .limit(1);
        return credential ?? null;
      },
      listPendingCampaignContacts: (id, tenantId) =>
        db
          .select({
            id: campaignContactsTable.id,
            contactId: campaignContactsTable.contactId,
            status: campaignContactsTable.status,
            sentAt: campaignContactsTable.sentAt,
            error: campaignContactsTable.error,
          })
          .from(campaignContactsTable)
          .where(and(
            eq(campaignContactsTable.campaignId, id),
            eq(campaignContactsTable.status, "PENDING"),
            tenantId ? eq(campaignContactsTable.tenantId, tenantId) : undefined,
          )),
      getCampaignContactById: async (campaignContactId, tenantId) => {
        const [campaignContact] = await db
          .select({
            id: campaignContactsTable.id,
            contactId: campaignContactsTable.contactId,
            status: campaignContactsTable.status,
            sentAt: campaignContactsTable.sentAt,
            error: campaignContactsTable.error,
          })
          .from(campaignContactsTable)
          .where(and(
            eq(campaignContactsTable.id, campaignContactId),
            tenantId ? eq(campaignContactsTable.tenantId, tenantId) : undefined,
          ))
          .limit(1);
        return campaignContact ?? null;
      },
      getContact: async (contactId, tenantId) => {
        const [contact] = await db
          .select({
            id: contactsTable.id,
            firstName: contactsTable.firstName,
            lastName: contactsTable.lastName,
            email: contactsTable.email,
            organizationId: contactsTable.organizationId,
          })
          .from(contactsTable)
          .where(and(eq(contactsTable.id, contactId), tenantId ? eq(contactsTable.tenantId, tenantId) : undefined))
          .limit(1);
        return contact ?? null;
      },
      getOrganization: async (organizationId, tenantId) => {
        const [organization] = await db
          .select({ name: organizationsTable.name })
          .from(organizationsTable)
          .where(and(
            eq(organizationsTable.id, organizationId),
            tenantId ? eq(organizationsTable.tenantId, tenantId) : undefined,
          ))
          .limit(1);
        return organization ?? null;
      },
      findOutboundEmail: async (currentCampaignId, contactId, tenantId) => {
        const [email] = await db
          .select({
            id: outboundEmailsTable.id,
            status: outboundEmailsTable.status,
            sentAt: outboundEmailsTable.sentAt,
            error: outboundEmailsTable.error,
          })
          .from(outboundEmailsTable)
          .where(and(
            eq(outboundEmailsTable.campaignId, currentCampaignId),
            eq(outboundEmailsTable.contactId, contactId),
            tenantId ? eq(outboundEmailsTable.tenantId, tenantId) : undefined,
          ))
          .orderBy(desc(outboundEmailsTable.createdAt))
          .limit(1);
        return email ?? null;
      },
      reserveSendIntent: async (input) => {
        const values = {
          id: input.intentId,
          tenantId: input.tenantId,
          campaignId: input.campaignId,
          contactId: input.contactId,
          userId: input.userId,
          toEmail: input.toEmail,
          subject: input.subject,
          bodySnapshot: input.bodySnapshot,
          status: "PENDING" as const,
          gmailMessageId: null,
          gmailThreadId: null,
          sentAt: null,
          error: null,
        };

        const inserted = await db
          .insert(outboundEmailsTable)
          .values(values)
          .onConflictDoNothing()
          .returning({
            id: outboundEmailsTable.id,
            status: outboundEmailsTable.status,
            sentAt: outboundEmailsTable.sentAt,
            error: outboundEmailsTable.error,
          });

        if (inserted.length > 0) {
          return { created: true, record: inserted[0] };
        }

        const [existing] = await db
          .select({
            id: outboundEmailsTable.id,
            status: outboundEmailsTable.status,
            sentAt: outboundEmailsTable.sentAt,
            error: outboundEmailsTable.error,
          })
          .from(outboundEmailsTable)
          .where(eq(outboundEmailsTable.id, input.intentId))
          .limit(1);

        if (!existing) {
          throw new Error(`Failed to reserve outbound email intent ${input.intentId}`);
        }

        return { created: false, record: existing };
      },
      markOutboundEmailFailed: async (intentId, error) => {
        await db
          .update(outboundEmailsTable)
          .set({ status: "FAILED", error, sentAt: null })
          .where(eq(outboundEmailsTable.id, intentId));
      },
      markCampaignContactSent: async (campaignContactId, tenantId, sentAt) => {
        await db
          .update(campaignContactsTable)
          .set({ status: "SENT", sentAt, error: null })
          .where(and(
            eq(campaignContactsTable.id, campaignContactId),
            tenantId ? eq(campaignContactsTable.tenantId, tenantId) : undefined,
          ));
      },
      markCampaignContactFailed: async (campaignContactId, tenantId, error) => {
        await db
          .update(campaignContactsTable)
          .set({ status: "FAILED", error })
          .where(and(
            eq(campaignContactsTable.id, campaignContactId),
            tenantId ? eq(campaignContactsTable.tenantId, tenantId) : undefined,
          ));
      },
      finalizeSuccessfulSend: async (input) => {
        await db.transaction(async (tx) => {
          await tx
            .update(outboundEmailsTable)
            .set({
              status: "SENT",
              sentAt: input.sentAt,
              error: null,
              gmailMessageId: input.gmailMessageId,
              gmailThreadId: input.gmailThreadId,
            })
            .where(eq(outboundEmailsTable.id, input.intentId));

          await tx
            .update(campaignContactsTable)
            .set({ status: "SENT", sentAt: input.sentAt, error: null })
            .where(and(
              eq(campaignContactsTable.id, input.campaignContactId),
              input.tenantId ? eq(campaignContactsTable.tenantId, input.tenantId) : undefined,
            ));

          await tx.insert(activitiesTable).values({
            id: generateId("act"),
            tenantId: input.tenantId,
            type: "EMAIL",
            summary: input.subject,
            date: input.sentAt,
            contactId: input.contactId,
            organizationId: input.organizationId,
            userId: input.userId,
          });

          await tx
            .update(contactsTable)
            .set({ lastContactedAt: input.sentAt })
            .where(and(
              eq(contactsTable.id, input.contactId),
              input.tenantId ? eq(contactsTable.tenantId, input.tenantId) : undefined,
            ));
        });
      },
      updateCampaignStatus: async (id, tenantId, status) => {
        await db
          .update(campaignsTable)
          .set({ status })
          .where(and(eq(campaignsTable.id, id), tenantId ? eq(campaignsTable.tenantId, tenantId) : undefined));
      },
      countPendingCampaignContacts: async (id, tenantId) => {
        const remaining = await db
          .select({ id: campaignContactsTable.id })
          .from(campaignContactsTable)
          .where(and(
            eq(campaignContactsTable.campaignId, id),
            eq(campaignContactsTable.status, "PENDING"),
            tenantId ? eq(campaignContactsTable.tenantId, tenantId) : undefined,
          ));
        return remaining.length;
      },
      createNotification,
      mergeTemplate,
      sendEmail: sendGmailEmail,
      generateId,
      now: () => new Date(),
      sleep: async (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      isShuttingDown: () => false,
      recordHeartbeat: (event) => {
        recordWorkerHeartbeat({
          status: event.status,
          action: event.action,
          campaignId: event.campaignId,
          contactId: event.contactId,
          consecutiveFailures: event.consecutiveFailures,
          lastError: event.lastError,
          shuttingDown: event.shuttingDown,
        });
      },
      logger,
    });

    res.json(result);
  } catch (error) {
    if (error instanceof WorkerProcessError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }

    logger.error({ err: error, campaignId }, "Worker campaign processing failed");
    recordWorkerHeartbeat({
      status: "error",
      action: "worker-request-failed",
      campaignId,
      lastError: error instanceof Error ? error.message : "Unknown error",
      shuttingDown: false,
    });
    res.status(500).json({ error: "Worker processing failed" });
  }
});

// ─── LMS Worker Jobs (Phase 3) ───────────────────────────────────────────────────
// These jobs are triggered by the worker poll loop (every 60s).
// Full implementations are in Phase 6 (report generation) and Phase 3 (email/token expiry).

/**
 * POST /worker/lms-send-survey-email
 * Triggered when PM clicks "Send email link" in the completeness dashboard.
 * Sends a tokenised survey email via Gmail integration.
 *
 * Body: { tenantId, userId, recipientEmail, recipientName?, tokenType, inviteToken, studentName?, cohortName? }
 */
router.post("/worker/lms-send-survey-email", async (req, res): Promise<void> => {
  const expectedSecret = process.env.WORKER_SECRET;
  const workerSecret = req.headers["x-worker-secret"];
  if (!expectedSecret || !workerSecret || workerSecret !== expectedSecret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { tenantId, userId, recipientEmail, recipientName, tokenType, inviteToken, studentName, cohortName } = req.body;

  if (!tenantId || !userId || !recipientEmail || !tokenType || !inviteToken) {
    res.status(400).json({ error: "Missing required fields: tenantId, userId, recipientEmail, tokenType, inviteToken" });
    return;
  }

  try {
    // Look up the PM user who triggered the send
    const [pmUser] = await db
      .select({ id: usersTable.id, email: usersTable.email, name: usersTable.name })
      .from(usersTable)
      .where(and(eq(usersTable.id, userId), eq(usersTable.tenantId, tenantId)))
      .limit(1);

    if (!pmUser) {
      res.status(404).json({ error: "PM user not found" });
      return;
    }

    // Look up Gmail credentials for the PM
    const [credential] = await db
      .select({ refreshToken: gmailCredentialsTable.refreshToken })
      .from(gmailCredentialsTable)
      .where(and(
        eq(gmailCredentialsTable.userId, userId),
        eq(gmailCredentialsTable.tenantId, tenantId),
      ))
      .limit(1);

    if (!credential || !credential.refreshToken) {
      logger.warn({ userId, tenantId }, "[lms-send-survey-email] No Gmail credentials for PM");
      res.status(422).json({ error: "No Gmail credentials configured for this user. Please connect Gmail in settings." });
      return;
    }

    // Build the fragment-based invite URL (token never in server-visible path)
    const lmsBaseUrl = process.env.LMS_BASE_URL ?? "https://lms.hubforte.com";
    const inviteUrl = `${lmsBaseUrl}/enter#token=${inviteToken}`;

    // Build email subject and body based on token type
    const recipientLabel = recipientName || recipientEmail;
    const studentLabel = studentName || "the student";
    const cohortLabel = cohortName || "the programme";

    let subject: string;
    let body: string;

    switch (tokenType) {
      case "teacher_feedback":
        subject = `Hubforte — Teacher Feedback Request for ${cohortLabel}`;
        body = [
          `Dear ${recipientLabel},`,
          "",
          `You have been invited to provide teacher feedback for students in ${cohortLabel}.`,
          "",
          "Please click the link below to access the feedback form:",
          inviteUrl,
          "",
          "This link will expire in 14 days. If you have any questions, please contact your Programme Manager.",
          "",
          "Thank you for supporting our students.",
          "",
          "Best regards,",
          `${pmUser.name || "Hubforte Programme Team"}`,
        ].join("\n");
        break;

      case "student_survey":
        subject = `Hubforte — Survey for ${studentLabel}`;
        body = [
          `Dear ${recipientLabel},`,
          "",
          `You have been invited to complete a survey as part of the Hubforte programme.`,
          "",
          "Please click the link below to access the survey:",
          inviteUrl,
          "",
          "This link will expire in 14 days.",
          "",
          "Thank you for your participation.",
          "",
          "Best regards,",
          `${pmUser.name || "Hubforte Programme Team"}`,
        ].join("\n");
        break;

      case "parent_survey":
        subject = `Hubforte — Parent/Guardian Survey for ${studentLabel}`;
        body = [
          `Dear ${recipientLabel},`,
          "",
          `Your child has been participating in the Hubforte programme. We would appreciate your feedback.`,
          "",
          "Please click the link below to complete a short survey:",
          inviteUrl,
          "",
          "This link will also allow you to view your child's personal development report once it is ready.",
          "",
          "This link will expire in 14 days.",
          "",
          "Thank you for your support.",
          "",
          "Best regards,",
          `${pmUser.name || "Hubforte Programme Team"}`,
        ].join("\n");
        break;

      default:
        subject = `Hubforte — Access Link`;
        body = [
          `Dear ${recipientLabel},`,
          "",
          "Please click the link below to access the Hubforte platform:",
          inviteUrl,
          "",
          "This link will expire in 14 days.",
          "",
          "Best regards,",
          `${pmUser.name || "Hubforte Programme Team"}`,
        ].join("\n");
    }

    const result = await sendGmailEmail({
      to: recipientEmail,
      subject,
      body,
      from: pmUser.email || "",
      refreshToken: credential.refreshToken!,
    });

    logger.info(
      { tokenType, recipientEmail, messageId: result.messageId },
      "[lms-send-survey-email] Email sent successfully",
    );

    res.json({
      status: "sent",
      messageId: result.messageId,
      threadId: result.threadId,
      recipientEmail,
    });
  } catch (err) {
    logger.error({ err, tokenType, recipientEmail }, "[lms-send-survey-email] Failed to send email");
    res.status(500).json({ error: "Failed to send survey email" });
  }
});

/**
 * POST /worker/lms-expire-tokens
 * Daily cron job (03:00 UTC via worker poll) — marks expired tokens as revoked
 * and cleans up expired lms_public_sessions.
 */
router.post("/worker/lms-expire-tokens", async (req, res): Promise<void> => {
  const expectedSecret = process.env.WORKER_SECRET;
  const workerSecret = req.headers["x-worker-secret"];
  if (!expectedSecret || !workerSecret || workerSecret !== expectedSecret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const now = new Date();

    // 1. Mark expired tokens as revoked (where expiresAt < now and not already revoked)
    const expiredTokens = await db
      .update(lmsAccessTokensTable)
      .set({ revokedAt: now } as any)
      .where(and(
        // @ts-ignore -- Drizzle lt() overload
        lt(lmsAccessTokensTable.expiresAt, now),
        // @ts-ignore
        isNull(lmsAccessTokensTable.revokedAt),
      ))
      .returning({ id: lmsAccessTokensTable.id });

    // 2. Also revoke tokens that have hit their max uses
    const exhaustedTokens = await db
      .update(lmsAccessTokensTable)
      .set({ revokedAt: now } as any)
      .where(and(
        // @ts-ignore
        isNull(lmsAccessTokensTable.revokedAt),
        // @ts-ignore
        sql`${lmsAccessTokensTable.useCount} >= ${lmsAccessTokensTable.maxUses}`,
      ))
      .returning({ id: lmsAccessTokensTable.id });

    // 3. Delete expired public sessions (TTL: 2 hours, per spec)
    const expiredSessions = await db
      .delete(lmsPublicSessionsTable)
      .where(
        // @ts-ignore
        lt(lmsPublicSessionsTable.expiresAt, now),
      )
      .returning({ id: lmsPublicSessionsTable.id });

    const summary = {
      expiredTokensRevoked: expiredTokens.length,
      exhaustedTokensRevoked: exhaustedTokens.length,
      expiredSessionsDeleted: expiredSessions.length,
    };

    logger.info(summary, "[lms-expire-tokens] Cleanup complete");

    res.json({ status: "complete", ...summary });
  } catch (err) {
    logger.error({ err }, "[lms-expire-tokens] Cleanup failed");
    res.status(500).json({ error: "Token expiry cleanup failed" });
  }
});

export default router;
