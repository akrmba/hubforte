import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import organizationsRouter from "./organizations";
import contactsRouter from "./contacts";
import tasksRouter from "./tasks";
import activitiesRouter from "./activities";
import notesRouter from "./notes";
import templatesRouter from "./templates";
import campaignsRouter from "./campaigns";
import outreachRouter from "./outreach";
import dashboardRouter from "./dashboard";
import adminRouter from "./admin";
import importExportRouter from "./importexport";
import workerRouter from "./worker";
import lmsWorkerRouter from "./lmsWorker";
import logErrorRouter from "./log-error";
import logClientErrorRouter from "./logClientError";
import volunteersRouter from "./volunteers";
import fundersRouter from "./funders";
import opportunitiesRouter from "./opportunities";
import reportsRouter from "./reports";
import aiRouter from "./ai";
import settingsAiRouter from "./settingsAi";
import supportRouter from "./support";
import remediationRouter from "./remediation";
import searchRouter from "./search";
import superAdminRouter, { featureFlagsPublicRouter } from "./superAdmin";
import superAdminDiagnosticsRouter from "./superAdminDiagnostics";
import superAdminOpsRouter from "./superAdminOps";
import superAdminHealthRouter from "./superAdminHealth";
import tenantsRouter from "./tenants";
import notificationsRouter from "./notifications";
import fieldVisibilityRouter from "./fieldVisibility";
import recordTypesRouter from "./recordTypes";
import programmesRouter from "./programmes";
import programmeCohortsRouter from "./programmeCohorts";
import programmeSessionsRouter from "./programmeSessions";
import sessionAttendanceRouter from "./sessionAttendance";
import outcomeFrameworksRouter from "./outcomeFrameworks";
import outcomeRecordsRouter from "./outcomeRecords";
import safeguardingNotesRouter from "./safeguardingNotes";
import safeguardingAccessLogRouter from "./safeguardingAccessLog";
import consentRecordsRouter from "./consentRecords";
import parentGuardiansRouter from "./parentGuardians";
import attachmentsRouter from "./attachments";
import automationRulesRouter from "./automationRules";
import importRouter from "./import";
import exportRouter from "./export";
import lmsRouter from "./lms";
import integrationsRouter from "./integrations";
import webhookReceiverRouter from "./webhookReceiver";
import appsRouter from "./apps";
import appV1Router from "./appV1";
import knowledgeBaseRouter from "./knowledgeBase";
import { authMiddleware, requireRole, optionalAuthMiddleware } from "../lib/auth";
import { checkModuleEnabled } from "../lib/featureFlags";

const router: IRouter = Router();

// Core routes (no feature flag gating)
router.use(healthRouter);
router.use(authRouter);
router.use(dashboardRouter);
router.use(adminRouter);
router.use(importExportRouter);
router.use(workerRouter);
router.use(lmsWorkerRouter);
router.use(logErrorRouter);
router.use(optionalAuthMiddleware, logClientErrorRouter); // optional auth — enriches logs when user is logged in
router.use(tasksRouter);
router.use(activitiesRouter);
router.use(notesRouter);
router.use(searchRouter);
router.use("/notifications", authMiddleware, notificationsRouter);
router.use(fieldVisibilityRouter);
router.use(recordTypesRouter);
router.use("/super-admin", superAdminRouter);
router.use("/super-admin", superAdminDiagnosticsRouter);
router.use("/super-admin", superAdminOpsRouter);
router.use("/super-admin", superAdminHealthRouter);
router.use("/super-admin/tenants", tenantsRouter);
router.use(featureFlagsPublicRouter);

// Feature-flag gated Phase 1 routes (full paths defined within each router)
// Wrap with auth + module check — auth runs again per-handler (idempotent)
const orgGuard: IRouter = Router();
orgGuard.use(authMiddleware, checkModuleEnabled("organisations"), organizationsRouter);
router.use(orgGuard);

const contactsGuard: IRouter = Router();
contactsGuard.use(authMiddleware, checkModuleEnabled("contacts"), contactsRouter);
router.use(contactsGuard);

const outreachGuard: IRouter = Router();
outreachGuard.use(authMiddleware, checkModuleEnabled("outreach"), outreachRouter, campaignsRouter, templatesRouter);
router.use(outreachGuard);

// Feature-flag gated Phase 2+ routes (mounted with prefix)
router.use("/volunteers", authMiddleware, checkModuleEnabled("volunteers"), volunteersRouter);
router.use("/funders", authMiddleware, checkModuleEnabled("funders"), fundersRouter);
router.use("/opportunities", authMiddleware, checkModuleEnabled("pipeline"), opportunitiesRouter);
router.use("/reports", authMiddleware, checkModuleEnabled("reports"), reportsRouter);
router.use("/support", authMiddleware, checkModuleEnabled("support"), supportRouter);

// Phase 4: Delivery entities (feature-flag gated)
router.use("/programmes", authMiddleware, checkModuleEnabled("programmes"), programmesRouter);
router.use("/programme-cohorts", authMiddleware, checkModuleEnabled("cohorts"), programmeCohortsRouter);
router.use("/programme-sessions", authMiddleware, checkModuleEnabled("sessions"), programmeSessionsRouter);
router.use("/session-attendance", authMiddleware, checkModuleEnabled("sessions"), sessionAttendanceRouter);

// Phase 5: Outcomes (feature-flag gated)
router.use("/outcome-frameworks", authMiddleware, checkModuleEnabled("outcomes"), outcomeFrameworksRouter);
router.use("/outcome-records", authMiddleware, checkModuleEnabled("outcomes"), outcomeRecordsRouter);

// Phase 5: Safeguarding (feature-flag gated, security-critical)
router.use("/safeguarding-notes", authMiddleware, checkModuleEnabled("safeguarding"), safeguardingNotesRouter);
router.use("/safeguarding-access-logs", authMiddleware, checkModuleEnabled("safeguarding"), safeguardingAccessLogRouter);

// Phase 5: Consent Management (feature-flag gated)
router.use("/consent-records", authMiddleware, checkModuleEnabled("consent"), consentRecordsRouter);
router.use("/parent-guardians", authMiddleware, checkModuleEnabled("consent"), parentGuardiansRouter);

// Phase 5: Attachments (feature-flag gated)
router.use("/attachments", authMiddleware, checkModuleEnabled("attachments"), attachmentsRouter);

// Routes without feature flag gating
router.use("/ai", authMiddleware, checkModuleEnabled("ai"), aiRouter);
router.use("/remediation", authMiddleware, requireRole("SUPER_ADMIN"), remediationRouter);
router.use("/settings/ai", settingsAiRouter);

// Phase 7: Automation & CDC (feature-flag gated)
router.use("/automation-rules", authMiddleware, checkModuleEnabled("automation"), automationRulesRouter);

// Phase 9: Import routes
router.use("/import", authMiddleware, importRouter);

// Phase 2B: Export routes
router.use("/export", authMiddleware, exportRouter);

// Phase 9A/9B: Integrations (webhooks + connectors) — auth gated
router.use("/integrations", authMiddleware, integrationsRouter);

// Phase 9A: Incoming webhook receiver — public (token-validated internally)
router.use("/webhooks", webhookReceiverRouter);

// Phase 11: Registered apps management (JWT-authenticated, admin+)
router.use("/apps", authMiddleware, appsRouter);

// Phase 11: App-authenticated v1 API (X-Hubforte-App-Key, no CSRF)
router.use("/v1", appV1Router);

// Phase 12: Error knowledge base (super-admin + developer share)
router.use("/super-admin", knowledgeBaseRouter);

// Public LMS routes (token/session-based, no JWT required) — MUST be before the JWT-protected LMS router
import lmsPublicRouter from "./lms/public";
router.use("/lms", checkModuleEnabled("lms"), lmsPublicRouter);

// LMS routes (feature-flag gated)
router.use("/lms", authMiddleware, checkModuleEnabled("lms"), lmsRouter);

export default router;
