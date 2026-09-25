import { describe, expect, it, vi } from "vitest";
import {
  processCampaignSendLoop,
  type WorkerCampaignContactRecord,
  type WorkerCampaignProcessorDeps,
  type WorkerCampaignRecord,
} from "../../artifacts/api-server/src/lib/workerCampaignProcessor";

const baseCampaign: WorkerCampaignRecord = {
  id: "camp-1",
  tenantId: null,
  ownerId: "user-1",
  name: "Q2 Outreach",
  subject: "Hello {{firstName}}",
  bodyTemplate: "Welcome {{firstName}} from {{organizationName}}",
  status: "SENDING",
};

const baseContact = {
  id: "contact-1",
  firstName: "Ava",
  lastName: "Stone",
  email: "ava@example.com",
  organizationId: "org-1",
};

function createDeps(
  overrides: Partial<WorkerCampaignProcessorDeps> = {},
): WorkerCampaignProcessorDeps {
  const now = new Date("2026-04-18T18:30:00.000Z");
  const pendingContact: WorkerCampaignContactRecord = {
    id: "cc-1",
    contactId: "contact-1",
    status: "PENDING",
    sentAt: null,
    error: null,
  };

  const deps: WorkerCampaignProcessorDeps = {
    getCampaign: async () => baseCampaign,
    getOwner: async () => ({ id: "user-1", email: "owner@example.com", name: "Owner" }),
    getGmailCredential: async () => ({ refreshToken: "refresh-token" }),
    listPendingCampaignContacts: async () => [pendingContact],
    getCampaignContactById: async () => pendingContact,
    getContact: async () => baseContact,
    getOrganization: async () => ({ name: "Acme Trust" }),
    findOutboundEmail: async () => null,
    reserveSendIntent: async () => ({
      created: true,
      record: { id: "em_worker_cc-1", status: "PENDING", sentAt: null, error: null },
    }),
    markOutboundEmailFailed: async () => undefined,
    markCampaignContactSent: async () => undefined,
    markCampaignContactFailed: async () => undefined,
    finalizeSuccessfulSend: async () => undefined,
    updateCampaignStatus: async () => undefined,
    countPendingCampaignContacts: async () => 0,
    createNotification: async () => undefined,
    mergeTemplate: (template, values) =>
      template.replace("{{firstName}}", values.firstName).replace("{{organizationName}}", values.organizationName),
    sendEmail: async () => ({ messageId: "gmail-1", threadId: "thread-1" }),
    generateId: (prefix) => `${prefix}_1`,
    now: () => now,
    sleep: async () => undefined,
    isShuttingDown: () => false,
    recordHeartbeat: () => undefined,
    logger: {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    },
  };

  return {
    ...deps,
    ...overrides,
  };
}

describe("worker safety hardening", () => {
  it("skips resend when a sent outbound email already exists", async () => {
    const markCampaignContactSent = vi.fn(async () => undefined);
    const sendEmail = vi.fn(async () => ({ messageId: "gmail-1", threadId: "thread-1" }));

    const result = await processCampaignSendLoop(
      "camp-1",
      createDeps({
        findOutboundEmail: async () => ({
          id: "em-existing",
          status: "SENT",
          sentAt: new Date("2026-04-18T18:20:00.000Z"),
          error: null,
        }),
        markCampaignContactSent,
        sendEmail,
      }),
    );

    expect(sendEmail).not.toHaveBeenCalled();
    expect(markCampaignContactSent).toHaveBeenCalledWith(
      "cc-1",
      null,
      new Date("2026-04-18T18:20:00.000Z"),
    );
    expect(result).toEqual({ processed: 1, sent: 1, failed: 0 });
  });

  it("blocks resend when a previous send intent is unresolved", async () => {
    const markCampaignContactFailed = vi.fn(async () => undefined);
    const markOutboundEmailFailed = vi.fn(async () => undefined);
    const sendEmail = vi.fn(async () => ({ messageId: "gmail-1", threadId: "thread-1" }));

    const result = await processCampaignSendLoop(
      "camp-1",
      createDeps({
        findOutboundEmail: async () => ({
          id: "em-pending",
          status: "PENDING",
          sentAt: null,
          error: null,
        }),
        markCampaignContactFailed,
        markOutboundEmailFailed,
        countPendingCampaignContacts: async () => 1,
        sendEmail,
      }),
    );

    expect(sendEmail).not.toHaveBeenCalled();
    expect(markOutboundEmailFailed).toHaveBeenCalledWith(
      "em-pending",
      "Previous send attempt is unresolved; resend blocked to avoid duplicate email.",
    );
    expect(markCampaignContactFailed).toHaveBeenCalledWith(
      "cc-1",
      null,
      "Previous send attempt is unresolved; resend blocked to avoid duplicate email.",
    );
    expect(result).toEqual({ processed: 1, sent: 0, failed: 1 });
  });

  it("pauses the campaign after ten consecutive failures", async () => {
    const campaignContacts = Array.from({ length: 10 }, (_, index) => ({
      id: `cc-${index + 1}`,
      contactId: `contact-${index + 1}`,
      status: "PENDING" as const,
      sentAt: null,
      error: null,
    }));
    const updateCampaignStatus = vi.fn(async () => undefined);
    const createNotification = vi.fn(async () => undefined);

    const result = await processCampaignSendLoop(
      "camp-1",
      createDeps({
        listPendingCampaignContacts: async () => campaignContacts,
        getCampaignContactById: async (campaignContactId) =>
          campaignContacts.find((contact) => contact.id === campaignContactId) ?? null,
        getContact: async (contactId) => ({
          id: contactId,
          firstName: "Jordan",
          lastName: "Miles",
          email: null,
          organizationId: null,
        }),
        countPendingCampaignContacts: async () => 1,
        updateCampaignStatus,
        createNotification,
      }),
    );

    expect(updateCampaignStatus).toHaveBeenCalledWith("camp-1", null, "PAUSED");
    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ processed: 10, sent: 0, failed: 10 });
  });
});
