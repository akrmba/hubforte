import {
  db,
  remediationPoliciesTable,
  remediationRunsTable,
  volunteersTable,
  supportTicketsTable,
  contactsTable,
  activitiesTable,
  outboundEmailsTable,
  campaignsTable,
  gmailCredentialsTable,
  usersTable,
  sessionsTable,
  errorLogsTable,
  requestLogs,
  campaignContactsTable,
  notificationsTable,
  programmeSessionsTable,
  sessionAttendanceTable,
  consentRecordsTable,
  fundingOpportunitiesTable,
  programmesTable,
  outcomeRecordsTable,
  organizationsTable,
  lmsReportsTable,
  lmsAiSummariesTable,
  lmsAccessTokensTable,
  studentsTable,
  programmeCohortsTable,
} from "@workspace/db";
import { eq, and, lt, lte, isNull, sql, inArray, or, gte, desc, notInArray } from "drizzle-orm";
import { generateId } from "./id";
import { logger } from "./logger";
import { sendGmailEmail } from "./gmail";
import { notifyAdminUsers, createNotification } from "./notifications";

// ---------------------------------------------------------------------------
// Policy name constants
// ---------------------------------------------------------------------------
export const POLICY_NAMES = {
  RETRY_FAILED_EMAILS: "Retry Failed Campaign Emails",
  FLAG_EXPIRED_DBS: "Flag Expired DBS Volunteers",
  CLOSE_STALE_TICKETS: "Close Stale Tickets",
  ARCHIVE_INACTIVE_CONTACTS: "Archive Inactive Contacts",
  USER_ACCOUNT_LOCKED: "User account locked / login failing",
  USER_SESSION_BROKEN: "User session broken (401s)",
  CAMPAIGN_STUCK_SENDING: "Campaign stuck in sending state",
  GMAIL_TOKEN_EXPIRED: "Gmail token expired causing send failures",
  WORKER_NOT_RESPONDING: "Background worker not responding",
  // Phase 8 new policies
  SESSION_ATTENDANCE_NOT_RECORDED: "Session attendance not recorded",
  DBS_EXPIRING_SOON: "DBS expiring within 30 days",
  SAFEGUARDING_TRAINING_EXPIRING: "Safeguarding training expiring",
  CONSENT_EXPIRING: "Consent expiring",
  CONSENT_WITHDRAWN: "Consent withdrawn",
  FUNDING_REPORT_OVERDUE: "Funding report overdue",
  PROGRAMME_NO_SESSIONS: "Programme with no sessions",
  STALE_ORGANISATION_RELATIONSHIP: "Stale organisation relationship",
  OUTCOME_DATA_MISSING: "Outcome data missing",
  IMPORT_JOB_FAILED: "Import job failed",
  // Phase 7 LMS policies
  LMS_REPORT_STUCK: "LMS report stuck generating",
  LMS_AI_SUMMARY_RETRY: "LMS AI summary failed — retry",
  LMS_EXPIRED_TOKENS_CLEANUP: "LMS expired tokens cleanup",
  LMS_PUPPETEER_CRASH: "LMS Puppeteer crash detected",
  LMS_ORPHANED_STUDENTS: "LMS orphaned students (no cohort)",
  LMS_STALE_COHORT: "LMS stale cohort (no activity)",
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function findPolicyByName(name: string) {
  const [policy] = await db
    .select()
    .from(remediationPoliciesTable)
    .where(eq(remediationPoliciesTable.name, name));
  return policy;
}

async function findEnabledPolicyByName(name: string) {
  const [policy] = await db
    .select()
    .from(remediationPoliciesTable)
    .where(and(eq(remediationPoliciesTable.name, name), eq(remediationPoliciesTable.isEnabled, true)));
  return policy;
}

async function countRunsToday(policyId: string): Promise<number> {
  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);
  const [{ value: todayCount }] = await db
    .select({ value: sql<number>`count(*)` })
    .from(remediationRunsTable)
    .where(
      and(
        eq(remediationRunsTable.policyId, policyId),
        gte(remediationRunsTable.createdAt, startOfToday),
        notInArray(remediationRunsTable.status, ["REJECTED", "SKIPPED"])
      )
    );
  return Number(todayCount ?? 0);
}

async function hasRecentRun(policyId: string, targetId: string, minutes: number): Promise<boolean> {
  const cutoff = new Date(Date.now() - minutes * 60 * 1000);
  const [recent] = await db
    .select()
    .from(remediationRunsTable)
    .where(
      and(
        eq(remediationRunsTable.policyId, policyId),
        gte(remediationRunsTable.createdAt, cutoff),
        sql`${remediationRunsTable.input}->>'targetId' = ${targetId}`
      )
    )
    .limit(1);
  return !!recent;
}

async function createRemediationRun(
  policyId: string,
  triggeredById: string | undefined,
  status: string,
  input: Record<string, unknown>,
  tenantId?: string | null
) {
  const runId = generateId("run");
  const [run] = await db
    .insert(remediationRunsTable)
    .values({
      id: runId,
      tenantId: tenantId ?? null,
      policyId,
      triggeredById: triggeredById || null,
      status: status as any,
      input,
      createdAt: new Date(),
    })
    .returning();
  return run;
}

async function completeRun(runId: string, output: Record<string, unknown>) {
  await db
    .update(remediationRunsTable)
    .set({ status: "EXECUTED" as const, executedAt: new Date(), output })
    .where(eq(remediationRunsTable.id, runId));
}

async function failRun(runId: string, error: string) {
  await db
    .update(remediationRunsTable)
    .set({ status: "FAILED" as const, error })
    .where(eq(remediationRunsTable.id, runId));
}

// ---------------------------------------------------------------------------
// Trigger evaluators — return { triggered: boolean, context: object }
// ---------------------------------------------------------------------------

async function evaluateAccountLocked(tenantId?: string | null): Promise<{ triggered: boolean; context: Record<string, unknown> } | null> {
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
  // Find error log entries with failed login messages in the last 10 minutes
  const [recentFailures] = await db
    .select({
      message: errorLogsTable.message,
      metadata: errorLogsTable.metadata,
      occurrenceCount: errorLogsTable.occurrenceCount,
      lastOccurredAt: errorLogsTable.lastOccurredAt,
    })
    .from(errorLogsTable)
    .where(
      and(
        gte(errorLogsTable.lastOccurredAt || errorLogsTable.createdAt, tenMinAgo),
        sql`${errorLogsTable.message} ILIKE '%login%' OR ${errorLogsTable.message} ILIKE '%auth%' OR ${errorLogsTable.message} ILIKE '%password%'`
      )
    )
    .orderBy(desc(errorLogsTable.occurrenceCount))
    .limit(1);

  if (!recentFailures) return null;

  const totalFailures = recentFailures.occurrenceCount ?? 1;
  if (totalFailures < 5) return null;

  // Try to extract email from metadata
  const meta = recentFailures.metadata as Record<string, unknown> | null;
  const email = (meta?.email as string) || "unknown";

  // Look up the user
  const [user] = await db
    .select({ id: usersTable.id, email: usersTable.email, active: usersTable.active, name: usersTable.name })
    .from(usersTable)
    .where(and(eq(usersTable.email, email), tenantId ? eq(usersTable.tenantId, tenantId) : undefined));

  if (!user) return null;

  return {
    triggered: true,
    context: {
      targetId: user.id,
      email: user.email,
      name: user.name,
      active: user.active,
      failureCount: totalFailures,
    },
  };
}

async function evaluateSessionBroken(tenantId?: string | null): Promise<{ triggered: boolean; context: Record<string, unknown> } | null> {
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);

  // Find userIds with 3+ 401 errors in the last 5 minutes
  const [topUser] = await db
    .select({
      userId: errorLogsTable.userId,
      cnt: sql<number>`count(*)`,
    })
    .from(errorLogsTable)
    .where(
      and(
        isNull(errorLogsTable.resolved),
        eq(errorLogsTable.statusCode, 401),
        gte(errorLogsTable.createdAt, fiveMinAgo),
        sql`${errorLogsTable.message} ILIKE '%session%' OR ${errorLogsTable.message} ILIKE '%token%' OR ${errorLogsTable.message} ILIKE '%unauthorized%' OR ${errorLogsTable.message} ILIKE '%401%'`
      )
    )
    .groupBy(errorLogsTable.userId)
    .having(sql`count(*) >= 3`)
    .orderBy(desc(sql`count(*)`))
    .limit(1);

  if (!topUser?.userId) return null;

  const [user] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.id, topUser.userId), tenantId ? eq(usersTable.tenantId, tenantId) : undefined))
    .limit(1);

  if (!user) return null;

  return {
    triggered: true,
    context: {
      targetId: topUser.userId,
      errorCount: topUser.cnt,
    },
  };
}

async function evaluateCampaignStuck(tenantId?: string | null): Promise<{ triggered: boolean; context: Record<string, unknown> } | null> {
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);

  // Find campaigns in SENDING state where no campaign_contacts were updated in 30 min
  const [stuckCampaign] = await db
    .select({
      id: campaignsTable.id,
      name: campaignsTable.name,
      ownerId: campaignsTable.ownerId,
    })
    .from(campaignsTable)
    .leftJoin(
      campaignContactsTable,
      and(eq(campaignContactsTable.campaignId, campaignsTable.id), tenantId ? eq(campaignContactsTable.tenantId, tenantId) : undefined)
    )
    .where(
      and(
        eq(campaignsTable.status, "SENDING"),
        tenantId ? eq(campaignsTable.tenantId, tenantId) : undefined,
        or(
          isNull(campaignContactsTable.sentAt),
          lt(campaignContactsTable.sentAt, thirtyMinAgo)
        )
      )
    )
    .groupBy(campaignsTable.id, campaignsTable.name, campaignsTable.ownerId)
    .limit(1);

  if (!stuckCampaign) return null;

  return {
    triggered: true,
    context: {
      targetId: stuckCampaign.id,
      campaignName: stuckCampaign.name,
      ownerId: stuckCampaign.ownerId,
    },
  };
}

async function evaluateGmailTokenExpired(tenantId?: string | null): Promise<{ triggered: boolean; context: Record<string, unknown> } | null> {
  // Find outbound_emails with gmail auth errors
  const [gmailError] = await db
    .select({
      userId: outboundEmailsTable.userId,
      error: outboundEmailsTable.error,
    })
    .from(outboundEmailsTable)
    .where(
      and(
        eq(outboundEmailsTable.status, "FAILED"),
        tenantId ? eq(outboundEmailsTable.tenantId, tenantId) : undefined,
        sql`${outboundEmailsTable.error} ILIKE '%gmail%' OR ${outboundEmailsTable.error} ILIKE '%auth%' OR ${outboundEmailsTable.error} ILIKE '%token%' OR ${outboundEmailsTable.error} ILIKE '%oauth%'`
      )
    )
    .limit(1);

  if (!gmailError?.userId) return null;

  // Check if the user's gmail credentials exist
  const [cred] = await db
    .select({ id: gmailCredentialsTable.id, refreshToken: gmailCredentialsTable.refreshToken })
    .from(gmailCredentialsTable)
    .where(and(eq(gmailCredentialsTable.userId, gmailError.userId), tenantId ? eq(gmailCredentialsTable.tenantId, tenantId) : undefined));

  // Only trigger if credentials are missing or have no refresh token
  if (cred?.refreshToken) return null;

  const [user] = await db
    .select({ id: usersTable.id, email: usersTable.email, name: usersTable.name })
    .from(usersTable)
    .where(and(eq(usersTable.id, gmailError.userId), tenantId ? eq(usersTable.tenantId, tenantId) : undefined));

  if (!user) return null;

  return {
    triggered: true,
    context: {
      targetId: user.id,
      email: user.email,
      name: user.name,
    },
  };
}

async function evaluateWorkerNotResponding(_tenantId?: string | null): Promise<{ triggered: boolean; context: Record<string, unknown> } | null> {
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);

  const [workerReq] = await db
    .select({ timestamp: requestLogs.timestamp })
    .from(requestLogs)
    .where(
      and(
        sql`${requestLogs.path} LIKE '%/worker/%'`,
        gte(requestLogs.timestamp, fiveMinAgo)
      )
    )
    .orderBy(desc(requestLogs.timestamp))
    .limit(1);

  if (workerReq) return null;

  return {
    triggered: true,
    context: {
      targetId: "worker",
      lastSeen: null,
    },
  };
}

// ---------------------------------------------------------------------------
// Policy evaluation dispatcher
// ---------------------------------------------------------------------------

// ── Phase 8 evaluators ──────────────────────────────────────────────────────

async function evaluateSessionAttendanceNotRecorded(tenantId?: string | null) {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // sessions older than 24h
  const sessions = await db.select({ id: programmeSessionsTable.id, tenantId: programmeSessionsTable.tenantId })
    .from(programmeSessionsTable)
    .where(and(
      lte(programmeSessionsTable.sessionDate as any, cutoff),
      tenantId ? eq(programmeSessionsTable.tenantId, tenantId) : undefined,
    )).limit(1);
  if (!sessions.length) return null;
  const session = sessions[0];
  const [attendance] = await db.select({ id: sessionAttendanceTable.id })
    .from(sessionAttendanceTable).where(eq(sessionAttendanceTable.sessionId, session.id)).limit(1);
  if (attendance) return null;
  return { triggered: true, context: { targetId: session.id, tenantId: session.tenantId, entityType: "programme_sessions" } };
}

async function evaluateDbsExpiringSoon(tenantId?: string | null) {
  const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const [vol] = await db.select({ id: volunteersTable.id, tenantId: volunteersTable.tenantId })
    .from(volunteersTable)
    .where(and(
      lte(volunteersTable.dbsExpiryDate as any, in30Days),
      tenantId ? eq(volunteersTable.tenantId, tenantId) : undefined,
    )).limit(1);
  if (!vol) return null;
  return { triggered: true, context: { targetId: vol.id, tenantId: vol.tenantId, entityType: "volunteers" } };
}

async function evaluateSafeguardingTrainingExpiring(tenantId?: string | null) {
  const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const [vol] = await db.select({ id: volunteersTable.id, tenantId: volunteersTable.tenantId })
    .from(volunteersTable)
    .where(and(
      lte(volunteersTable.safeguardingTrainingDate as any, in30Days),
      tenantId ? eq(volunteersTable.tenantId, tenantId) : undefined,
    )).limit(1);
  if (!vol) return null;
  return { triggered: true, context: { targetId: vol.id, tenantId: vol.tenantId, entityType: "volunteers" } };
}

async function evaluateConsentExpiring(tenantId?: string | null) {
  const in14Days = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const today = new Date().toISOString().split("T")[0];
  const [consent] = await db.select({ id: consentRecordsTable.id, tenantId: consentRecordsTable.tenantId })
    .from(consentRecordsTable)
    .where(and(
      eq(consentRecordsTable.status, "OBTAINED"),
      lte(consentRecordsTable.expiryDate as any, in14Days.toISOString().split("T")[0]),
      gte(consentRecordsTable.expiryDate as any, today),
      tenantId ? eq(consentRecordsTable.tenantId, tenantId) : undefined,
    )).limit(1);
  if (!consent) return null;
  return { triggered: true, context: { targetId: consent.id, tenantId: consent.tenantId, entityType: "consent_records" } };
}

async function evaluateConsentWithdrawn(tenantId?: string | null) {
  const since = new Date(Date.now() - 60 * 60 * 1000); // last hour
  const [consent] = await db.select({ id: consentRecordsTable.id, tenantId: consentRecordsTable.tenantId })
    .from(consentRecordsTable)
    .where(and(
      eq(consentRecordsTable.status, "WITHDRAWN"),
      gte(consentRecordsTable.updatedAt as any, since),
      tenantId ? eq(consentRecordsTable.tenantId, tenantId) : undefined,
    )).limit(1);
  if (!consent) return null;
  return { triggered: true, context: { targetId: consent.id, tenantId: consent.tenantId, entityType: "consent_records" } };
}

async function evaluateFundingReportOverdue(tenantId?: string | null) {
  const today = new Date().toISOString().split("T")[0];
  const [opp] = await db.select({ id: fundingOpportunitiesTable.id, tenantId: fundingOpportunitiesTable.tenantId })
    .from(fundingOpportunitiesTable)
    .where(and(
      lte(fundingOpportunitiesTable.reportDueDate as any, today),
      tenantId ? eq(fundingOpportunitiesTable.tenantId, tenantId) : undefined,
    )).limit(1);
  if (!opp) return null;
  return { triggered: true, context: { targetId: opp.id, tenantId: opp.tenantId, entityType: "funding_opportunities" } };
}

async function evaluateProgrammeNoSessions(tenantId?: string | null) {
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const programmes = await db.select({ id: programmesTable.id, tenantId: programmesTable.tenantId })
    .from(programmesTable)
    .where(and(
      eq(programmesTable.status as any, "ACTIVE"),
      tenantId ? eq(programmesTable.tenantId, tenantId) : undefined,
    )).limit(20);
  for (const prog of programmes) {
    const [session] = await db.select({ id: programmeSessionsTable.id })
      .from(programmeSessionsTable)
      .where(and(
        eq(programmeSessionsTable.programmeId, prog.id),
        gte(programmeSessionsTable.createdAt as any, cutoff),
      )).limit(1);
    if (!session) return { triggered: true, context: { targetId: prog.id, tenantId: prog.tenantId, entityType: "programmes" } };
  }
  return null;
}

async function evaluateStaleOrganisationRelationship(tenantId?: string | null) {
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const orgs = await db.select({ id: organizationsTable.id, tenantId: organizationsTable.tenantId })
    .from(organizationsTable)
    .where(and(
      eq(organizationsTable.relationshipStatus as any, "ACTIVE"),
      tenantId ? eq(organizationsTable.tenantId, tenantId) : undefined,
    )).limit(20);
  for (const org of orgs) {
    const [activity] = await db.select({ id: activitiesTable.id })
      .from(activitiesTable)
      .where(and(
        eq(activitiesTable.organizationId as any, org.id),
        gte(activitiesTable.createdAt as any, cutoff),
      )).limit(1);
    if (!activity) return { triggered: true, context: { targetId: org.id, tenantId: org.tenantId, entityType: "organizations" } };
  }
  return null;
}

async function evaluateOutcomeDataMissing(tenantId?: string | null) {
  const programmes = await db.select({ id: programmesTable.id, tenantId: programmesTable.tenantId })
    .from(programmesTable)
    .where(and(
      eq(programmesTable.status as any, "COMPLETED"),
      tenantId ? eq(programmesTable.tenantId, tenantId) : undefined,
    )).limit(10);
  for (const prog of programmes) {
    const [record] = await db.select({ id: outcomeRecordsTable.id })
      .from(outcomeRecordsTable)
      .where(and(
        eq(outcomeRecordsTable.programmeId, prog.id),
        eq(outcomeRecordsTable.assessmentType, "ENDLINE"),
      )).limit(1);
    if (!record) return { triggered: true, context: { targetId: prog.id, tenantId: prog.tenantId, entityType: "programmes" } };
  }
  return null;
}

async function evaluateImportJobFailed(_tenantId?: string | null) {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const [err] = await db.select({ id: errorLogsTable.id })
    .from(errorLogsTable)
    .where(and(
      sql`${errorLogsTable.message} ILIKE '%import%'`,
      gte(errorLogsTable.createdAt as any, since),
    )).limit(1);
  if (!err) return null;
  return { triggered: true, context: { targetId: err.id, tenantId: null, entityType: "error_logs" } };
}

// ---------------------------------------------------------------------------
// Phase 7 LMS evaluators
// ---------------------------------------------------------------------------

async function evaluateLmsReportStuck(tenantId?: string | null): Promise<{ triggered: boolean; context: Record<string, unknown> } | null> {
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
  const [stuck] = await db
    .select({ id: lmsReportsTable.id, cohortId: lmsReportsTable.cohortId })
    .from(lmsReportsTable)
    .where(and(
      eq(lmsReportsTable.status, "generating"),
      lt(lmsReportsTable.createdAt, thirtyMinAgo),
      tenantId ? eq(lmsReportsTable.tenantId, tenantId) : undefined,
    ))
    .limit(1);
  if (!stuck) return null;
  return { triggered: true, context: { targetId: stuck.id, cohortId: stuck.cohortId } };
}

async function evaluateLmsAiSummaryRetry(tenantId?: string | null): Promise<{ triggered: boolean; context: Record<string, unknown> } | null> {
  const [failed] = await db
    .select({ id: lmsAiSummariesTable.id, cohortId: lmsAiSummariesTable.cohortId })
    .from(lmsAiSummariesTable)
    .where(and(
      eq(lmsAiSummariesTable.failed, true),
      tenantId ? eq(lmsAiSummariesTable.tenantId, tenantId) : undefined,
    ))
    .limit(1);
  if (!failed) return null;
  return { triggered: true, context: { targetId: failed.id, cohortId: failed.cohortId } };
}

async function evaluateLmsExpiredTokensCleanup(tenantId?: string | null): Promise<{ triggered: boolean; context: Record<string, unknown> } | null> {
  const now = new Date();
  const [expired] = await db
    .select({ id: lmsAccessTokensTable.id })
    .from(lmsAccessTokensTable)
    .where(and(
      lt(lmsAccessTokensTable.expiresAt, now),
      isNull(lmsAccessTokensTable.revokedAt),
      tenantId ? eq(lmsAccessTokensTable.tenantId, tenantId) : undefined,
    ))
    .limit(1);
  if (!expired) return null;
  return { triggered: true, context: { targetId: "lms_tokens" } };
}

async function evaluateLmsPuppeteerCrash(tenantId?: string | null): Promise<{ triggered: boolean; context: Record<string, unknown> } | null> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const [err] = await db
    .select({ id: errorLogsTable.id, message: errorLogsTable.message })
    .from(errorLogsTable)
    .where(and(
      sql`${errorLogsTable.message} ILIKE '%puppeteer%'`,
      gte(errorLogsTable.createdAt, oneHourAgo),
    ))
    .limit(1);
  if (!err) return null;
  return { triggered: true, context: { targetId: err.id, message: err.message } };
}

async function evaluateLmsOrphanedStudents(tenantId?: string | null): Promise<{ triggered: boolean; context: Record<string, unknown> } | null> {
  const [orphan] = await db
    .select({ id: studentsTable.id })
    .from(studentsTable)
    .where(and(
      isNull(studentsTable.cohortId),
      tenantId ? eq(studentsTable.tenantId, tenantId) : undefined,
    ))
    .limit(1);
  if (!orphan) return null;
  return { triggered: true, context: { targetId: orphan.id } };
}

async function evaluateLmsStaleCohort(tenantId?: string | null): Promise<{ triggered: boolean; context: Record<string, unknown> } | null> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [stale] = await db
    .select({ id: programmeCohortsTable.id, cohortName: programmeCohortsTable.cohortName })
    .from(programmeCohortsTable)
    .where(and(
      lt(programmeCohortsTable.updatedAt, thirtyDaysAgo),
      eq(programmeCohortsTable.status, "IN_PROGRESS"),
      tenantId ? eq(programmeCohortsTable.tenantId, tenantId) : undefined,
    ))
    .limit(1);
  if (!stale) return null;
  return { triggered: true, context: { targetId: stale.id, cohortName: stale.cohortName } };
}

const triggerEvaluators: Record<string, (tenantId?: string | null) => Promise<{ triggered: boolean; context: Record<string, unknown> } | null>> = {
  [POLICY_NAMES.USER_SESSION_BROKEN]: evaluateSessionBroken,
  [POLICY_NAMES.CAMPAIGN_STUCK_SENDING]: evaluateCampaignStuck,
  [POLICY_NAMES.GMAIL_TOKEN_EXPIRED]: evaluateGmailTokenExpired,
  [POLICY_NAMES.WORKER_NOT_RESPONDING]: evaluateWorkerNotResponding,
  // Phase 8 policies
  [POLICY_NAMES.SESSION_ATTENDANCE_NOT_RECORDED]: evaluateSessionAttendanceNotRecorded,
  [POLICY_NAMES.DBS_EXPIRING_SOON]: evaluateDbsExpiringSoon,
  [POLICY_NAMES.SAFEGUARDING_TRAINING_EXPIRING]: evaluateSafeguardingTrainingExpiring,
  [POLICY_NAMES.CONSENT_EXPIRING]: evaluateConsentExpiring,
  [POLICY_NAMES.CONSENT_WITHDRAWN]: evaluateConsentWithdrawn,
  [POLICY_NAMES.FUNDING_REPORT_OVERDUE]: evaluateFundingReportOverdue,
  [POLICY_NAMES.PROGRAMME_NO_SESSIONS]: evaluateProgrammeNoSessions,
  [POLICY_NAMES.STALE_ORGANISATION_RELATIONSHIP]: evaluateStaleOrganisationRelationship,
  [POLICY_NAMES.OUTCOME_DATA_MISSING]: evaluateOutcomeDataMissing,
  [POLICY_NAMES.IMPORT_JOB_FAILED]: evaluateImportJobFailed,
  // Phase 7 LMS policies
  [POLICY_NAMES.LMS_REPORT_STUCK]: evaluateLmsReportStuck,
  [POLICY_NAMES.LMS_AI_SUMMARY_RETRY]: evaluateLmsAiSummaryRetry,
  [POLICY_NAMES.LMS_EXPIRED_TOKENS_CLEANUP]: evaluateLmsExpiredTokensCleanup,
  [POLICY_NAMES.LMS_PUPPETEER_CRASH]: evaluateLmsPuppeteerCrash,
  [POLICY_NAMES.LMS_ORPHANED_STUDENTS]: evaluateLmsOrphanedStudents,
  [POLICY_NAMES.LMS_STALE_COHORT]: evaluateLmsStaleCohort,
};

export async function evaluatePolicy(policyId: string) {
  const [policy] = await db
    .select()
    .from(remediationPoliciesTable)
    .where(eq(remediationPoliciesTable.id, policyId));

  if (!policy) {
    throw new Error(`Policy not found: ${policyId}`);
  }

  const now = new Date();
  const tenantId = policy.tenantId;

  // New policies use trigger evaluators
  const evaluator = triggerEvaluators[policy.name];
  if (evaluator) {
    const result = await evaluator(tenantId);
    if (!result) return { actionableItems: 0, reason: "No trigger condition met" };
    return { actionableItems: 1, ids: [result.context.targetId], context: result.context };
  }

  // Legacy policies
  switch (policy.name) {
    case POLICY_NAMES.RETRY_FAILED_EMAILS: {
      const failedEmails = await db
        .select({ id: outboundEmailsTable.id })
        .from(outboundEmailsTable)
        .where(and(eq(outboundEmailsTable.status, "FAILED"), tenantId ? eq(outboundEmailsTable.tenantId, tenantId) : undefined))
        .limit(50);
      return { actionableItems: failedEmails.length, ids: failedEmails.map(e => e.id) };
    }

    case POLICY_NAMES.FLAG_EXPIRED_DBS: {
      const expiredVolunteers = await db
        .select()
        .from(volunteersTable)
        .where(
          and(
            lt(volunteersTable.dbsExpiresAt, now),
            eq(volunteersTable.dbsStatus, "CLEAR"),
            tenantId ? eq(volunteersTable.tenantId, tenantId) : undefined
          )
        );
      return { actionableItems: expiredVolunteers.length, ids: expiredVolunteers.map(v => v.id) };
    }

    case POLICY_NAMES.CLOSE_STALE_TICKETS: {
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const staleTickets = await db
        .select()
        .from(supportTicketsTable)
        .where(
          and(
            lt(supportTicketsTable.updatedAt, thirtyDaysAgo),
            sql`${supportTicketsTable.status} NOT IN ('RESOLVED', 'CLOSED')`,
            tenantId ? eq(supportTicketsTable.tenantId, tenantId) : undefined
          )
        );
      return { actionableItems: staleTickets.length, ids: staleTickets.map(t => t.id) };
    }

    case POLICY_NAMES.ARCHIVE_INACTIVE_CONTACTS: {
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      const inactiveContacts = await db
        .select()
        .from(contactsTable)
        .where(
          and(
            eq(contactsTable.status, "ACTIVE"),
            tenantId ? eq(contactsTable.tenantId, tenantId) : undefined,
            or(
              lt(contactsTable.lastContactedAt, ninetyDaysAgo),
              and(isNull(contactsTable.lastContactedAt), lt(contactsTable.createdAt, ninetyDaysAgo))
            )
          )
        );
      return { actionableItems: inactiveContacts.length, ids: inactiveContacts.map(c => c.id) };
    }

    default:
      return { actionableItems: 0, reason: "Unknown policy" };
  }
}

// ---------------------------------------------------------------------------
// Policy execution dispatcher
// ---------------------------------------------------------------------------

export async function executePolicy(runId: string, approvedById?: string) {
  const [run] = await db
    .select()
    .from(remediationRunsTable)
    .where(eq(remediationRunsTable.id, runId));

  if (!run) throw new Error("Run not found");

  const [policy] = await db
    .select()
    .from(remediationPoliciesTable)
    .where(eq(remediationPoliciesTable.id, run.policyId));

  if (!policy) throw new Error("Policy not found");

  const now = new Date();
  const tenantId = run.tenantId;
  const input = (run.input as Record<string, unknown>) || {};
  const context = (input.context as Record<string, unknown>) || {};

  try {
    switch (policy.name) {
      // ---- New policies ----

      case POLICY_NAMES.USER_ACCOUNT_LOCKED: {
        const userId = context.targetId as string;
        const email = context.email as string;
        const isActive = context.active as boolean;
        const failureCount = context.failureCount as number;

        logger.info({ userId, email, failureCount }, "Remediation: User account locked — login failures detected");

        if (!isActive) {
          // Account is inactive — notify admins with reactivate option
          await notifyAdminUsers({
            title: "Account locked — inactive user",
            message: `User ${email} has ${failureCount} failed login attempts. Account is currently inactive. Click to reactivate.`,
            type: "WARNING",
            link: `/admin?tab=users&reactivate=${userId}`,
          });
        } else {
          // Account is active but failing — notify admins to investigate
          await notifyAdminUsers({
            title: "Account locked — repeated login failures",
            message: `User ${email} has ${failureCount} failed login attempts in the last 10 minutes. Account is active — investigate potential unauthorized access.`,
            type: "WARNING",
            link: `/admin?tab=users`,
          });
        }

        await completeRun(runId, { email, failureCount, accountActive: isActive, action: "admin_notified" });
        return;
      }

      case POLICY_NAMES.USER_SESSION_BROKEN: {
        const userId = context.targetId as string;
        const errorCount = context.errorCount as number;

        // Clear all sessions for this user (force re-login)
        await db
          .delete(sessionsTable)
          .where(eq(sessionsTable.userId, userId));

        // Send in-app notification
        await createNotification({
          userId,
          tenantId,
          title: "Session refreshed",
          message: "Your session was refreshed due to repeated authentication errors. Please log in again.",
          type: "WARNING",
          link: "/login",
        });

        logger.info({ userId, errorCount }, "Remediation: User session cleared — forced re-login");
        await completeRun(runId, { userId, errorCount, action: "session_cleared" });
        return;
      }

      case POLICY_NAMES.CAMPAIGN_STUCK_SENDING: {
        const campaignId = context.targetId as string;
        const campaignName = context.campaignName as string;

        // Pause the campaign
        await db
          .update(campaignsTable)
          .set({ status: "PAUSED", updatedAt: now })
          .where(and(eq(campaignsTable.id, campaignId), tenantId ? eq(campaignsTable.tenantId, tenantId) : undefined));

        // Notify admins
        await notifyAdminUsers({
          title: "Campaign auto-paused",
          message: `Campaign "${campaignName}" was stuck in SENDING state with no progress for 30+ minutes. It has been paused automatically.`,
          type: "WARNING",
          link: `/campaigns/${campaignId}`,
        });

        logger.info({ campaignId, campaignName }, "Remediation: Campaign paused — was stuck in SENDING state");
        await completeRun(runId, { campaignId, campaignName, action: "campaign_paused" });
        return;
      }

      case POLICY_NAMES.GMAIL_TOKEN_EXPIRED: {
        const userId = context.targetId as string;
        const email = context.email as string;
        const name = context.name as string;

        // Notify the affected user
        await createNotification({
          userId,
          tenantId,
          title: "Gmail connection expired",
          message: "Your Gmail connection has expired. Please reconnect Gmail in Settings to resume email sending.",
          type: "ERROR",
          link: "/settings",
        });

        // Pause any SENDING or SCHEDULED campaigns for this user
        const pausedCampaigns = await db
          .select({ id: campaignsTable.id, name: campaignsTable.name })
          .from(campaignsTable)
          .where(
            and(
              eq(campaignsTable.ownerId, userId),
              sql`${campaignsTable.status} IN ('SENDING', 'SCHEDULED')`,
              tenantId ? eq(campaignsTable.tenantId, tenantId) : undefined
            )
          );

        for (const campaign of pausedCampaigns) {
          await db
            .update(campaignsTable)
            .set({ status: "PAUSED", updatedAt: now })
            .where(and(eq(campaignsTable.id, campaign.id), tenantId ? eq(campaignsTable.tenantId, tenantId) : undefined));
        }

        logger.info({ userId, email, pausedCount: pausedCampaigns.length }, "Remediation: Gmail token expired — user notified, campaigns paused");
        await completeRun(runId, { userId, email, pausedCampaigns: pausedCampaigns.length, action: "user_notified_campaigns_paused" });
        return;
      }

      case POLICY_NAMES.WORKER_NOT_RESPONDING: {
        // Notify SUPER_ADMIN immediately
        const superAdmins = await db
          .select({ id: usersTable.id })
          .from(usersTable)
          .where(eq(usersTable.role, "SUPER_ADMIN"));

        for (const admin of superAdmins) {
          await createNotification({
            userId: admin.id,
            title: "CRITICAL: Background worker down",
            message: "The background campaign worker has not responded in 5+ minutes. All campaigns have been paused to prevent partial sends.",
            type: "ERROR",
            link: "/admin?tab=automation",
          });
        }

        // Pause all SENDING and SCHEDULED campaigns
        const activeCampaigns = await db
          .select({ id: campaignsTable.id, name: campaignsTable.name })
          .from(campaignsTable)
          .where(and(sql`${campaignsTable.status} IN ('SENDING', 'SCHEDULED')`, tenantId ? eq(campaignsTable.tenantId, tenantId) : undefined));

        for (const campaign of activeCampaigns) {
          await db
            .update(campaignsTable)
            .set({ status: "PAUSED", updatedAt: now })
            .where(and(eq(campaignsTable.id, campaign.id), tenantId ? eq(campaignsTable.tenantId, tenantId) : undefined));
        }

        logger.error({ pausedCount: activeCampaigns.length }, "Remediation: Worker not responding — all campaigns paused");
        await completeRun(runId, { pausedCampaigns: activeCampaigns.length, action: "super_admin_notified_all_campaigns_paused" });
        return;
      }

      // ---- Legacy policies ----

      case POLICY_NAMES.FLAG_EXPIRED_DBS: {
        const ids = (input.ids as string[]) || [];
        if (ids.length > 0) {
          await db
            .update(volunteersTable)
            .set({ dbsStatus: "EXPIRED", updatedAt: now })
            .where(and(sql`${volunteersTable.id} IN ${ids}`, tenantId ? eq(volunteersTable.tenantId, tenantId) : undefined));

          for (const id of ids) {
            const [v] = await db
              .select()
              .from(volunteersTable)
              .where(and(eq(volunteersTable.id, id), tenantId ? eq(volunteersTable.tenantId, tenantId) : undefined));
            if (v) {
              await db.insert(activitiesTable).values({
                id: generateId("act"),
                tenantId,
                type: "NOTE",
                summary: "Volunteer DBS flagged as EXPIRED by remediation engine",
                contactId: v.contactId,
                userId: approvedById || "system",
                date: now,
              });
            }
          }
        }

        const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        const expiringVolunteers = await db
          .select({ id: volunteersTable.id })
          .from(volunteersTable)
          .where(
            and(
              eq(volunteersTable.dbsStatus, "CLEAR"),
              lt(volunteersTable.dbsExpiresAt, thirtyDaysFromNow),
              sql`${volunteersTable.dbsExpiresAt} >= ${now}`,
              tenantId ? eq(volunteersTable.tenantId, tenantId) : undefined
            )
          );
        if (expiringVolunteers.length > 0) {
          notifyAdminUsers({
            title: "DBS checks expiring soon",
            message: `${expiringVolunteers.length} volunteer(s) have DBS checks expiring within 30 days.`,
            type: "WARNING",
            link: "/volunteers",
          }).catch(err => logger.error({ err }, "Failed to send DBS expiry notification"));
        }
        break;
      }

      case POLICY_NAMES.CLOSE_STALE_TICKETS: {
        const ids = (input.ids as string[]) || [];
        if (ids.length > 0) {
          await db
            .update(supportTicketsTable)
            .set({ status: "CLOSED", updatedAt: now, resolutionNotes: "Closed automatically due to inactivity." })
            .where(and(sql`${supportTicketsTable.id} IN ${ids}`, tenantId ? eq(supportTicketsTable.tenantId, tenantId) : undefined));

          for (const id of ids) {
            const [t] = await db
              .select()
              .from(supportTicketsTable)
              .where(and(eq(supportTicketsTable.id, id), tenantId ? eq(supportTicketsTable.tenantId, tenantId) : undefined));
            if (t && t.contactId) {
              await db.insert(activitiesTable).values({
                id: generateId("act"),
                tenantId,
                type: "NOTE",
                summary: `Support ticket ${t.ticketNumber} closed due to inactivity`,
                contactId: t.contactId,
                organizationId: t.organizationId,
                userId: approvedById || "system",
                date: now,
              });
            }
          }
        }
        break;
      }

      case POLICY_NAMES.ARCHIVE_INACTIVE_CONTACTS: {
        const ids = (input.ids as string[]) || [];
        if (ids.length > 0) {
          await db
            .update(contactsTable)
            .set({ status: "INACTIVE", updatedAt: now })
            .where(and(sql`${contactsTable.id} IN ${ids}`, tenantId ? eq(contactsTable.tenantId, tenantId) : undefined));

          for (const id of ids) {
            await db.insert(activitiesTable).values({
              id: generateId("act"),
              tenantId,
              type: "NOTE",
              summary: "Contact archived due to 90+ days of inactivity",
              contactId: id,
              userId: approvedById || "system",
              date: now,
            });
          }
        }
        break;
      }

      case POLICY_NAMES.RETRY_FAILED_EMAILS: {
        const ids = (input.ids as string[]) || [];
        let retriedCount = 0;
        const [gmailCred] = await db
          .select()
          .from(gmailCredentialsTable)
          .where(tenantId ? eq(gmailCredentialsTable.tenantId, tenantId) : undefined)
          .limit(1);
        if (!gmailCred || !gmailCred.refreshToken) {
          logger.warn("No Gmail credentials found — cannot retry failed emails");
          break;
        }
        const fromAddress = process.env.GMAIL_FROM_ADDRESS || "noreply@hubforte.com";

        for (const emailId of ids.slice(0, 50)) {
          const [failedEmail] = await db
            .select()
            .from(outboundEmailsTable)
            .where(and(eq(outboundEmailsTable.id, emailId), tenantId ? eq(outboundEmailsTable.tenantId, tenantId) : undefined));
          if (!failedEmail || failedEmail.status !== "FAILED") continue;

          if (failedEmail.campaignId) {
            const [campaign] = await db
              .select()
              .from(campaignsTable)
              .where(and(eq(campaignsTable.id, failedEmail.campaignId), tenantId ? eq(campaignsTable.tenantId, tenantId) : undefined));
            if (!campaign || !["SENT", "PAUSED"].includes(campaign.status)) continue;
          }

          try {
            await sendGmailEmail({
              to: failedEmail.toEmail,
              subject: failedEmail.subject,
              body: failedEmail.bodySnapshot,
              from: fromAddress,
              refreshToken: gmailCred.refreshToken,
            });
            await db
              .update(outboundEmailsTable)
              .set({ status: "SENT", sentAt: now, error: null })
              .where(and(eq(outboundEmailsTable.id, emailId), tenantId ? eq(outboundEmailsTable.tenantId, tenantId) : undefined));
            retriedCount++;
          } catch (err: any) {
            logger.error({ err, emailId }, "Failed to retry email");
          }
        }

        await completeRun(runId, { processedCount: retriedCount });
        return;
      }

      case POLICY_NAMES.LMS_REPORT_STUCK: {
        const reportId = context.targetId as string;
        // Mark the stuck report as error so PM can retry
        await db
          .update(lmsReportsTable)
          .set({ status: "error" })
          .where(eq(lmsReportsTable.id, reportId));
        await notifyAdminUsers({
          title: "LMS report generation stuck",
          message: `Report ${reportId} has been stuck in 'generating' state for over 30 minutes. It has been marked as failed — the PM can retry from the Reports screen.`,
          type: "WARNING",
          link: "/lms",
        });
        await completeRun(runId, { reportId, action: "marked_error" });
        return;
      }

      case POLICY_NAMES.LMS_AI_SUMMARY_RETRY: {
        const summaryId = context.targetId as string;
        // Reset failed flag so the next AI summarisation pass picks it up
        await db
          .update(lmsAiSummariesTable)
          .set({ failed: false })
          .where(eq(lmsAiSummariesTable.id, summaryId));
        await completeRun(runId, { summaryId, action: "reset_for_retry" });
        return;
      }

      case POLICY_NAMES.LMS_EXPIRED_TOKENS_CLEANUP: {
        const now = new Date();
        // Count before update to avoid loading all IDs into memory.
        // Scoped to tenantId to prevent cross-tenant mutation.
        const [{ count: revokedCount }] = await db
          .select({ count: sql<number>`count(*)` })
          .from(lmsAccessTokensTable)
          .where(and(
            lt(lmsAccessTokensTable.expiresAt, now),
            isNull(lmsAccessTokensTable.revokedAt),
            tenantId ? eq(lmsAccessTokensTable.tenantId, tenantId) : undefined,
          ));
        await db
          .update(lmsAccessTokensTable)
          .set({ revokedAt: now })
          .where(and(
            lt(lmsAccessTokensTable.expiresAt, now),
            isNull(lmsAccessTokensTable.revokedAt),
            tenantId ? eq(lmsAccessTokensTable.tenantId, tenantId) : undefined,
          ));
        await completeRun(runId, { revokedCount: Number(revokedCount), action: "tokens_revoked" });
        return;
      }

      case POLICY_NAMES.LMS_PUPPETEER_CRASH: {
        await notifyAdminUsers({
          title: "LMS PDF generation error (Puppeteer)",
          message: "A Puppeteer crash was detected during LMS report generation. PDF reports may be falling back to HTML. Check that Chromium is installed and the LMS_PDF_OUTPUT_DIR is writable.",
          type: "ERROR",
          link: "/super-admin?tab=ops",
        });
        await completeRun(runId, { action: "admin_notified" });
        return;
      }

      case POLICY_NAMES.LMS_ORPHANED_STUDENTS: {
        const studentId = context.targetId as string;
        await notifyAdminUsers({
          title: "LMS orphaned student detected",
          message: `Student ${studentId} has no cohort assigned. This may indicate a data integrity issue. Review in the LMS student management screen.`,
          type: "WARNING",
          link: "/lms",
        });
        await completeRun(runId, { studentId, action: "admin_notified" });
        return;
      }

      case POLICY_NAMES.LMS_STALE_COHORT: {
        const cohortId = context.targetId as string;
        const cohortName = context.cohortName as string;
        await notifyAdminUsers({
          title: "LMS cohort inactive for 30+ days",
          message: `Cohort "${cohortName}" (${cohortId}) has had no activity for over 30 days but is still marked active. Consider archiving it or checking with the Programme Manager.`,
          type: "WARNING",
          link: "/lms",
        });
        await completeRun(runId, { cohortId, cohortName, action: "admin_notified" });
        return;
      }

      default:
        throw new Error(`Unknown policy: ${policy.name}`);
    }

    // Legacy policies fall through here
    await completeRun(runId, { processedCount: ((input.ids as string[]) || []).length });
  } catch (error: any) {
    logger.error({ error }, "Remediation execution failed");
    await failRun(runId, error instanceof Error ? error.message : String(error));
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Auto-trigger: fire a policy run when a trigger condition is met
// ---------------------------------------------------------------------------

export async function firePolicyFromTrigger(
  policyName: string,
  context: Record<string, unknown>,
  triggeredById?: string
) {
  const policy = await findEnabledPolicyByName(policyName);
  if (!policy) return null;

  const targetId = context.targetId as string;

  // Deduplication: skip if a run for this target was created recently
  const cooldownMinutes = policyName === POLICY_NAMES.WORKER_NOT_RESPONDING ? 15 : 10;
  const recent = await hasRecentRun(policy.id, targetId, cooldownMinutes);
  if (recent) {
    logger.info({ policyName, targetId }, "Remediation: Skipping — recent run exists for this target");
    return null;
  }

  // Check daily run limit
  if (policy.maxAutoRunsPerDay > 0) {
    const todayCount = await countRunsToday(policy.id);
    if (todayCount >= policy.maxAutoRunsPerDay) {
      logger.warn({ policyName, todayCount, maxAutoRunsPerDay: policy.maxAutoRunsPerDay }, "Remediation: Daily run limit reached");
      return null;
    }
  }

  // Determine run status based on approval requirement
  const status = policy.requiresApproval ? "PENDING_APPROVAL" : "APPROVED";

  const run = await createRemediationRun(policy.id, triggeredById, status, {
    targetId,
    ids: [targetId],
    context,
  }, policy.tenantId);

  logger.info({ runId: run.id, policyName, status, targetId }, "Remediation: Run created from trigger");

  // If approval not required, execute immediately
  if (status === "APPROVED") {
    executePolicy(run.id, triggeredById)
      .then(() => {
        logger.info({ runId: run.id }, "Remediation: Auto-executed successfully");
      })
      .catch((err) => {
        logger.error({ err, runId: run.id }, "Remediation: Auto-execution failed");
      });
  } else {
    // Requires approval — notify admins
    await notifyAdminUsers({
      title: "Remediation requires approval",
      message: `Policy "${policyName}" detected an issue and requires your approval. Review and approve or reject in the Admin console.`,
      type: "WARNING",
      link: "/admin?tab=automation",
    });
  }

  return run;
}

// ---------------------------------------------------------------------------
// Trigger polling — evaluates all enabled trigger-based policies every 2 min
// ---------------------------------------------------------------------------

let triggerIntervalId: ReturnType<typeof setInterval> | null = null;

export function startTriggerPolling() {
  if (triggerIntervalId) return; // Already running

  logger.info("Remediation: Starting trigger polling (every 2 minutes)");

  triggerIntervalId = setInterval(async () => {
    try {
      for (const [policyName, evaluator] of Object.entries(triggerEvaluators)) {
        const result = await evaluator();
        if (result?.triggered) {
          logger.info({ policyName, context: result.context }, "Remediation: Trigger condition met");
          await firePolicyFromTrigger(policyName, result.context, "system");
        }
      }
    } catch (err) {
      logger.error({ err }, "Remediation: Trigger polling error");
    }
  }, 2 * 60 * 1000); // 2 minutes
}

export function stopTriggerPolling() {
  if (triggerIntervalId) {
    clearInterval(triggerIntervalId);
    triggerIntervalId = null;
    logger.info("Remediation: Trigger polling stopped");
  }
}
