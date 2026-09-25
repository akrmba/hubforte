import type { WorkerRuntimeStatus } from "./workerRuntimeState";

export type WorkerCampaignStatus = "DRAFT" | "SCHEDULED" | "SENDING" | "SENT" | "PAUSED";
export type WorkerSendStatus = "PENDING" | "SENT" | "FAILED" | "REPLIED" | "UNSUBSCRIBED";

export interface WorkerCampaignRecord {
  id: string;
  tenantId: string | null;
  ownerId: string;
  name: string;
  subject: string;
  bodyTemplate: string;
  status: WorkerCampaignStatus;
}

export interface WorkerCampaignContactRecord {
  id: string;
  contactId: string;
  status: WorkerSendStatus;
  sentAt?: Date | null;
  error?: string | null;
}

export interface WorkerContactRecord {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  organizationId: string | null;
}

export interface WorkerOrganizationRecord {
  name: string;
}

export interface WorkerOwnerRecord {
  id: string;
  email: string | null;
  name: string | null;
}

export interface WorkerGmailCredentialRecord {
  refreshToken: string;
}

export interface WorkerOutboundEmailRecord {
  id: string;
  status: WorkerSendStatus;
  sentAt: Date | null;
  error?: string | null;
}

export interface WorkerSendResult {
  messageId: string | null;
  threadId: string | null;
}

export interface WorkerLogger {
  info: (details: unknown, message?: string) => void;
  warn: (details: unknown, message?: string) => void;
  error: (details: unknown, message?: string) => void;
}

export interface WorkerHeartbeatEvent {
  status?: WorkerRuntimeStatus;
  action: string;
  campaignId?: string | null;
  contactId?: string | null;
  consecutiveFailures?: number;
  lastError?: string | null;
  shuttingDown?: boolean;
}

export interface WorkerCampaignProcessorDeps {
  getCampaign: (campaignId: string) => Promise<WorkerCampaignRecord | null>;
  getOwner: (ownerId: string, tenantId: string | null) => Promise<WorkerOwnerRecord | null>;
  getGmailCredential: (ownerId: string, tenantId: string | null) => Promise<WorkerGmailCredentialRecord | null>;
  listPendingCampaignContacts: (campaignId: string, tenantId: string | null) => Promise<WorkerCampaignContactRecord[]>;
  getCampaignContactById: (campaignContactId: string, tenantId: string | null) => Promise<WorkerCampaignContactRecord | null>;
  getContact: (contactId: string, tenantId: string | null) => Promise<WorkerContactRecord | null>;
  getOrganization: (organizationId: string, tenantId: string | null) => Promise<WorkerOrganizationRecord | null>;
  findOutboundEmail: (campaignId: string, contactId: string, tenantId: string | null) => Promise<WorkerOutboundEmailRecord | null>;
  reserveSendIntent: (input: {
    intentId: string;
    tenantId: string | null;
    campaignId: string;
    contactId: string;
    userId: string;
    toEmail: string;
    subject: string;
    bodySnapshot: string;
  }) => Promise<{ created: boolean; record: WorkerOutboundEmailRecord }>;
  markOutboundEmailFailed: (intentId: string, error: string) => Promise<void>;
  markCampaignContactSent: (campaignContactId: string, tenantId: string | null, sentAt: Date) => Promise<void>;
  markCampaignContactFailed: (campaignContactId: string, tenantId: string | null, error: string) => Promise<void>;
  finalizeSuccessfulSend: (input: {
    intentId: string;
    campaignContactId: string;
    tenantId: string | null;
    contactId: string;
    subject: string;
    organizationId: string | null;
    userId: string;
    sentAt: Date;
    gmailMessageId: string | null;
    gmailThreadId: string | null;
  }) => Promise<void>;
  updateCampaignStatus: (campaignId: string, tenantId: string | null, status: WorkerCampaignStatus) => Promise<void>;
  countPendingCampaignContacts: (campaignId: string, tenantId: string | null) => Promise<number>;
  createNotification: (input: {
    userId: string;
    tenantId: string | null;
    title: string;
    message: string;
    type?: "INFO" | "WARNING" | "SUCCESS" | "ERROR";
    link?: string;
  }) => Promise<void>;
  mergeTemplate: (template: string, values: Record<string, string>) => string;
  sendEmail: (input: {
    to: string;
    subject: string;
    body: string;
    from: string;
    refreshToken: string;
  }) => Promise<WorkerSendResult>;
  generateId: (prefix: string) => string;
  now: () => Date;
  sleep: (ms: number) => Promise<void>;
  isShuttingDown: () => boolean;
  recordHeartbeat: (event: WorkerHeartbeatEvent) => void;
  logger: WorkerLogger;
}

export interface WorkerCampaignProcessResult {
  processed: number;
  sent: number;
  failed: number;
}

export class WorkerProcessError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "WorkerProcessError";
    this.statusCode = statusCode;
  }
}

export const MAX_CONSECUTIVE_FAILURES = 10;
export const SEND_DELAY_MS = 72_000;
export const TRANSIENT_RETRY_DELAY_MS = 5_000;

export function buildWorkerOutboundEmailId(campaignContactId: string): string {
  return `em_worker_${campaignContactId}`;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function isTransientSendError(error: unknown): boolean {
  const message = toErrorMessage(error).toLowerCase();
  return [
    "timeout",
    "timed out",
    "econnreset",
    "socket hang up",
    "network",
    "temporarily unavailable",
    "rate limit",
    "429",
    "etimedout",
    "eai_again",
  ].some((pattern) => message.includes(pattern));
}

async function sendWithRetry(
  deps: WorkerCampaignProcessorDeps,
  input: {
    to: string;
    subject: string;
    body: string;
    from: string;
    refreshToken: string;
    campaignId: string;
    contactId: string;
    consecutiveFailures: number;
  },
): Promise<WorkerSendResult> {
  try {
    return await deps.sendEmail(input);
  } catch (error) {
    if (!isTransientSendError(error)) {
      throw error;
    }

    deps.recordHeartbeat({
      status: "running",
      action: "retry-transient-send",
      campaignId: input.campaignId,
      contactId: input.contactId,
      consecutiveFailures: input.consecutiveFailures,
      lastError: toErrorMessage(error),
    });

    await deps.sleep(TRANSIENT_RETRY_DELAY_MS);
    return deps.sendEmail(input);
  }
}

async function pauseCampaignForFailures(
  deps: WorkerCampaignProcessorDeps,
  campaign: WorkerCampaignRecord,
  lastError: string,
  consecutiveFailures: number,
): Promise<void> {
  await deps.updateCampaignStatus(campaign.id, campaign.tenantId, "PAUSED");
  await deps.createNotification({
    userId: campaign.ownerId,
    tenantId: campaign.tenantId,
    title: "Campaign paused after repeated send failures",
    message: `Campaign "${campaign.name}" was paused after ${consecutiveFailures} consecutive failures. Last error: ${lastError}`,
    type: "ERROR",
    link: `/outreach/campaigns/${campaign.id}`,
  });
  deps.recordHeartbeat({
    status: "error",
    action: "campaign-paused-failure-threshold",
    campaignId: campaign.id,
    consecutiveFailures,
    lastError,
  });
}

export async function processCampaignSendLoop(
  campaignId: string,
  deps: WorkerCampaignProcessorDeps,
): Promise<WorkerCampaignProcessResult> {
  const campaign = await deps.getCampaign(campaignId);
  if (!campaign) {
    throw new WorkerProcessError(404, "Campaign not found");
  }

  const credential = await deps.getGmailCredential(campaign.ownerId, campaign.tenantId);
  if (!credential) {
    throw new WorkerProcessError(400, "Campaign owner has no Gmail account connected.");
  }

  const owner = await deps.getOwner(campaign.ownerId, campaign.tenantId);
  const fromEmail = process.env.GMAIL_FROM_ADDRESS || owner?.email || "noreply@hubforte.com";
  const pendingContacts = await deps.listPendingCampaignContacts(campaign.id, campaign.tenantId);

  let processed = 0;
  let sent = 0;
  let failed = 0;
  let consecutiveFailures = 0;

  deps.recordHeartbeat({
    status: "running",
    action: "campaign-start",
    campaignId: campaign.id,
    consecutiveFailures,
  });

  for (const pendingContact of pendingContacts) {
    if (deps.isShuttingDown()) {
      deps.recordHeartbeat({
        status: "shutting_down",
        action: "shutdown-before-contact",
        campaignId: campaign.id,
        contactId: pendingContact.contactId,
        consecutiveFailures,
        shuttingDown: true,
      });
      break;
    }

    const currentCampaign = await deps.getCampaign(campaign.id);
    if (!currentCampaign || currentCampaign.status === "PAUSED") {
      deps.recordHeartbeat({
        status: "idle",
        action: "campaign-paused",
        campaignId: campaign.id,
        contactId: pendingContact.contactId,
        consecutiveFailures,
      });
      break;
    }

    const currentCampaignContact = await deps.getCampaignContactById(pendingContact.id, campaign.tenantId);
    if (!currentCampaignContact) {
      deps.recordHeartbeat({
        status: "running",
        action: "skip-missing-campaign-contact",
        campaignId: campaign.id,
        contactId: pendingContact.contactId,
        consecutiveFailures,
      });
      continue;
    }

    if (currentCampaignContact.status !== "PENDING") {
      deps.recordHeartbeat({
        status: "running",
        action: "skip-non-pending-contact",
        campaignId: campaign.id,
        contactId: pendingContact.contactId,
        consecutiveFailures,
      });
      continue;
    }

    const existingOutbound = await deps.findOutboundEmail(campaign.id, pendingContact.contactId, campaign.tenantId);
    if (existingOutbound) {
      if (existingOutbound.status === "SENT") {
        await deps.markCampaignContactSent(
          currentCampaignContact.id,
          campaign.tenantId,
          existingOutbound.sentAt ?? deps.now(),
        );
        sent += 1;
        processed += 1;
        consecutiveFailures = 0;
        deps.recordHeartbeat({
          status: "running",
          action: "skip-duplicate-send-guard",
          campaignId: campaign.id,
          contactId: pendingContact.contactId,
          consecutiveFailures,
        });
        continue;
      }

      const duplicateError =
        existingOutbound.status === "PENDING"
          ? "Previous send attempt is unresolved; resend blocked to avoid duplicate email."
          : existingOutbound.error || "Previous send attempt already failed.";

      if (existingOutbound.status === "PENDING") {
        await deps.markOutboundEmailFailed(existingOutbound.id, duplicateError);
      }

      await deps.markCampaignContactFailed(currentCampaignContact.id, campaign.tenantId, duplicateError);
      failed += 1;
      processed += 1;
      consecutiveFailures += 1;
      deps.recordHeartbeat({
        status: "running",
        action: "blocked-duplicate-send-guard",
        campaignId: campaign.id,
        contactId: pendingContact.contactId,
        consecutiveFailures,
        lastError: duplicateError,
      });

      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        await pauseCampaignForFailures(deps, campaign, duplicateError, consecutiveFailures);
        break;
      }
      continue;
    }

    const contact = await deps.getContact(pendingContact.contactId, campaign.tenantId);
    if (!contact) {
      const errorMessage = "Contact not found";
      await deps.markCampaignContactFailed(currentCampaignContact.id, campaign.tenantId, errorMessage);
      failed += 1;
      processed += 1;
      consecutiveFailures += 1;
      deps.recordHeartbeat({
        status: "running",
        action: "contact-failed",
        campaignId: campaign.id,
        contactId: pendingContact.contactId,
        consecutiveFailures,
        lastError: errorMessage,
      });
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        await pauseCampaignForFailures(deps, campaign, errorMessage, consecutiveFailures);
        break;
      }
      continue;
    }

    if (!contact.email) {
      const errorMessage = "Contact has no email address";
      await deps.markCampaignContactFailed(currentCampaignContact.id, campaign.tenantId, errorMessage);
      failed += 1;
      processed += 1;
      consecutiveFailures += 1;
      deps.recordHeartbeat({
        status: "running",
        action: "contact-failed",
        campaignId: campaign.id,
        contactId: pendingContact.contactId,
        consecutiveFailures,
        lastError: errorMessage,
      });
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        await pauseCampaignForFailures(deps, campaign, errorMessage, consecutiveFailures);
        break;
      }
      continue;
    }

    const organization = contact.organizationId
      ? await deps.getOrganization(contact.organizationId, campaign.tenantId)
      : null;

    const templateValues = {
      firstName: contact.firstName,
      lastName: contact.lastName,
      organizationName: organization?.name ?? "",
      senderName: owner?.name ?? "",
    };

    const mergedSubject = deps.mergeTemplate(campaign.subject, templateValues);
    const mergedBody = deps.mergeTemplate(campaign.bodyTemplate, templateValues);

    const sendIntent = await deps.reserveSendIntent({
      intentId: buildWorkerOutboundEmailId(currentCampaignContact.id),
      tenantId: campaign.tenantId,
      campaignId: campaign.id,
      contactId: pendingContact.contactId,
      userId: campaign.ownerId,
      toEmail: contact.email,
      subject: mergedSubject,
      bodySnapshot: mergedBody,
    });

    if (!sendIntent.created) {
      const duplicateError =
        sendIntent.record.status === "SENT"
          ? "Existing send record found; resend blocked to avoid duplicate email."
          : "Existing send intent found; resend blocked to avoid duplicate email.";

      if (sendIntent.record.status === "SENT") {
        await deps.markCampaignContactSent(
          currentCampaignContact.id,
          campaign.tenantId,
          sendIntent.record.sentAt ?? deps.now(),
        );
        sent += 1;
        consecutiveFailures = 0;
      } else {
        await deps.markCampaignContactFailed(currentCampaignContact.id, campaign.tenantId, duplicateError);
        failed += 1;
        consecutiveFailures += 1;
      }

      processed += 1;
      deps.recordHeartbeat({
        status: "running",
        action: "blocked-duplicate-send-intent",
        campaignId: campaign.id,
        contactId: pendingContact.contactId,
        consecutiveFailures,
        lastError: sendIntent.record.status === "SENT" ? null : duplicateError,
      });

      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        await pauseCampaignForFailures(deps, campaign, duplicateError, consecutiveFailures);
        break;
      }
      continue;
    }

    let emailResult: WorkerSendResult;
    try {
      emailResult = await sendWithRetry(deps, {
        to: contact.email,
        subject: mergedSubject,
        body: mergedBody,
        from: fromEmail,
        refreshToken: credential.refreshToken,
        campaignId: campaign.id,
        contactId: pendingContact.contactId,
        consecutiveFailures,
      });
    } catch (error) {
      const errorMessage = toErrorMessage(error);
      await deps.markOutboundEmailFailed(sendIntent.record.id, errorMessage);
      await deps.markCampaignContactFailed(currentCampaignContact.id, campaign.tenantId, errorMessage);
      failed += 1;
      processed += 1;
      consecutiveFailures += 1;
      deps.recordHeartbeat({
        status: "running",
        action: "contact-failed",
        campaignId: campaign.id,
        contactId: pendingContact.contactId,
        consecutiveFailures,
        lastError: errorMessage,
      });

      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        await pauseCampaignForFailures(deps, campaign, errorMessage, consecutiveFailures);
        break;
      }
      continue;
    }

    const sentAt = deps.now();

    try {
      await deps.finalizeSuccessfulSend({
        intentId: sendIntent.record.id,
        campaignContactId: currentCampaignContact.id,
        tenantId: campaign.tenantId,
        contactId: pendingContact.contactId,
        subject: mergedSubject,
        organizationId: contact.organizationId,
        userId: campaign.ownerId,
        sentAt,
        gmailMessageId: emailResult.messageId,
        gmailThreadId: emailResult.threadId,
      });
      sent += 1;
      processed += 1;
      consecutiveFailures = 0;
      deps.recordHeartbeat({
        status: "running",
        action: "sent-contact",
        campaignId: campaign.id,
        contactId: pendingContact.contactId,
        consecutiveFailures,
      });
    } catch (error) {
      const errorMessage = `Email sent but local state could not be finalized: ${toErrorMessage(error)}`;
      deps.logger.error(
        {
          campaignId: campaign.id,
          campaignContactId: currentCampaignContact.id,
          contactId: pendingContact.contactId,
          err: error,
        },
        "Worker send finalization failed",
      );
      await deps.markCampaignContactFailed(currentCampaignContact.id, campaign.tenantId, errorMessage);
      failed += 1;
      processed += 1;
      consecutiveFailures += 1;
      deps.recordHeartbeat({
        status: "error",
        action: "send-finalization-failed",
        campaignId: campaign.id,
        contactId: pendingContact.contactId,
        consecutiveFailures,
        lastError: errorMessage,
      });

      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        await pauseCampaignForFailures(deps, campaign, errorMessage, consecutiveFailures);
        break;
      }
      continue;
    }

    if (deps.isShuttingDown()) {
      deps.recordHeartbeat({
        status: "shutting_down",
        action: "shutdown-after-contact",
        campaignId: campaign.id,
        contactId: pendingContact.contactId,
        consecutiveFailures,
        shuttingDown: true,
      });
      break;
    }

    if (processed < pendingContacts.length) {
      await deps.sleep(SEND_DELAY_MS);
    }
  }

  const remainingPending = await deps.countPendingCampaignContacts(campaign.id, campaign.tenantId);
  if (remainingPending === 0) {
    await deps.updateCampaignStatus(campaign.id, campaign.tenantId, "SENT");
    await deps.createNotification({
      userId: campaign.ownerId,
      tenantId: campaign.tenantId,
      title: "Campaign sending complete",
      message: `Campaign "${campaign.name}" has finished. ${sent} sent, ${failed} failed.`,
      type: failed > 0 ? "WARNING" : "SUCCESS",
      link: `/outreach/campaigns/${campaign.id}`,
    });
    deps.recordHeartbeat({
      status: "idle",
      action: "campaign-complete",
      campaignId: campaign.id,
      consecutiveFailures,
      lastError: failed > 0 ? `${failed} contacts failed during the run.` : null,
      shuttingDown: false,
    });
  } else if (deps.isShuttingDown()) {
    deps.recordHeartbeat({
      status: "shutting_down",
      action: "campaign-stopped-for-shutdown",
      campaignId: campaign.id,
      consecutiveFailures,
      shuttingDown: true,
    });
  } else if (consecutiveFailures === 0) {
    deps.recordHeartbeat({
      status: "idle",
      action: "campaign-yielded",
      campaignId: campaign.id,
      consecutiveFailures,
      shuttingDown: false,
    });
  }

  return { processed, sent, failed };
}
