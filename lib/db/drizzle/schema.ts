import { pgTable, unique, text, timestamp, foreignKey, jsonb, boolean, integer, index, real, numeric, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const activityType = pgEnum("activity_type", ['EMAIL', 'CALL', 'NOTE', 'MEETING', 'TASK_COMPLETED'])
export const campaignStatus = pgEnum("campaign_status", ['DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'PAUSED'])
export const contactStatus = pgEnum("contact_status", ['ACTIVE', 'INACTIVE', 'PROSPECT', 'UNSUBSCRIBED'])
export const dbsStatus = pgEnum("dbs_status", ['CLEAR', 'PENDING', 'EXPIRED', 'NOT_CHECKED'])
export const funderStatus = pgEnum("funder_status", ['ACTIVE', 'INACTIVE', 'PROSPECT'])
export const funderType = pgEnum("funder_type", ['TRUST', 'FOUNDATION', 'CORPORATE', 'GOVERNMENT', 'INDIVIDUAL', 'LOTTERY'])
export const opportunityStage = pgEnum("opportunity_stage", ['PROSPECT', 'APPROACH', 'APPLIED', 'AWARDED', 'DECLINED', 'LOST'])
export const orgStatus = pgEnum("org_status", ['ACTIVE', 'INACTIVE', 'PROSPECT'])
export const orgType = pgEnum("org_type", ['SCHOOL', 'COMPANY', 'TRUST', 'CHARITY', 'GOVERNMENT', 'OTHER'])
export const priority = pgEnum("priority", ['LOW', 'MEDIUM', 'HIGH'])
export const remediationStatus = pgEnum("remediation_status", ['PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'EXECUTED', 'FAILED', 'SKIPPED'])
export const role = pgEnum("role", ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OPERATOR', 'VIEWER'])
export const sendStatus = pgEnum("send_status", ['PENDING', 'SENT', 'FAILED', 'REPLIED', 'UNSUBSCRIBED'])
export const taskStatus = pgEnum("task_status", ['PENDING', 'IN_PROGRESS', 'DONE'])
export const ticketSource = pgEnum("ticket_source", ['MANUAL', 'EMAIL', 'VOICE'])
export const ticketStatus = pgEnum("ticket_status", ['OPEN', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED'])


export const sessions = pgTable("sessions", {
	id: text().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	token: text().notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("sessions_token_unique").on(table.token),
]);

export const organizations = pgTable("organizations", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	type: orgType().notNull(),
	status: orgStatus().default('PROSPECT').notNull(),
	location: text(),
	ownerId: text("owner_id").notNull(),
	notes: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	tenantId: text("tenant_id"),
}, (table) => [
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "organizations_tenant_id_fkey"
		}),
]);

export const errorLogs = pgTable("error_logs", {
	id: text().primaryKey().notNull(),
	level: text().notNull(),
	message: text().notNull(),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	source: text().default('api').notNull(),
	route: text(),
	userId: text("user_id"),
	requestId: text("request_id"),
	stack: text(),
	plainEnglish: text("plain_english"),
	resolved: boolean().default(false).notNull(),
	resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: 'string' }),
	resolvedNote: text("resolved_note"),
	method: text(),
	statusCode: integer("status_code"),
	requestBody: text("request_body"),
	resolvedBy: text("resolved_by"),
	occurrenceCount: integer("occurrence_count").default(1).notNull(),
	lastOccurredAt: timestamp("last_occurred_at", { withTimezone: true, mode: 'string' }),
	dedupHash: text("dedup_hash"),
});

export const funders = pgTable("funders", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	type: funderType().notNull(),
	fundingAreas: text("funding_areas").array().default([""]).notNull(),
	typicalGrantMin: integer("typical_grant_min"),
	typicalGrantMax: integer("typical_grant_max"),
	applicationDeadlines: text("application_deadlines"),
	relationshipOwnerId: text("relationship_owner_id").notNull(),
	website: text(),
	notes: text(),
	status: funderStatus().default('ACTIVE').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	tenantId: text("tenant_id"),
}, (table) => [
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "funders_tenant_id_fkey"
		}),
]);

export const passwordResetTokens = pgTable("password_reset_tokens", {
	token: text().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const requestLogs = pgTable("request_logs", {
	id: text().primaryKey().notNull(),
	requestId: text("request_id").notNull(),
	method: text().notNull(),
	path: text().notNull(),
	statusCode: integer("status_code"),
	durationMs: integer("duration_ms"),
	userId: text("user_id"),
	slowRequest: boolean("slow_request").default(false),
	isError: boolean("is_error").default(false),
	isCritical: boolean("is_critical").default(false),
	timestamp: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("request_logs_slow_request_idx").using("btree", table.slowRequest.asc().nullsLast().op("bool_ops")),
	index("request_logs_status_code_idx").using("btree", table.statusCode.asc().nullsLast().op("int4_ops")),
	index("request_logs_timestamp_idx").using("btree", table.timestamp.asc().nullsLast().op("timestamp_ops")),
	index("request_logs_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
]);

export const remediationPolicies = pgTable("remediation_policies", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	description: text().notNull(),
	trigger: text().notNull(),
	action: text().notNull(),
	isEnabled: boolean("is_enabled").default(false).notNull(),
	requiresApproval: boolean("requires_approval").default(true).notNull(),
	maxAutoRunsPerDay: integer("max_auto_runs_per_day").default(0).notNull(),
	createdById: text("created_by_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	tenantId: text("tenant_id"),
}, (table) => [
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "remediation_policies_tenant_id_fkey"
		}),
	unique("remediation_policies_name_unique").on(table.name),
]);

export const remediationRuns = pgTable("remediation_runs", {
	id: text().primaryKey().notNull(),
	policyId: text("policy_id").notNull(),
	triggeredById: text("triggered_by_id"),
	status: remediationStatus().notNull(),
	input: jsonb(),
	output: jsonb(),
	approvedById: text("approved_by_id"),
	approvedAt: timestamp("approved_at", { withTimezone: true, mode: 'string' }),
	executedAt: timestamp("executed_at", { withTimezone: true, mode: 'string' }),
	error: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	tenantId: text("tenant_id"),
}, (table) => [
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "remediation_runs_tenant_id_fkey"
		}),
]);

export const featureFlags = pgTable("feature_flags", {
	id: text().primaryKey().notNull(),
	module: text().notNull(),
	enabled: boolean().default(true).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedBy: text("updated_by"),
}, (table) => [
	unique("feature_flags_module_unique").on(table.module),
]);

export const aiConfig = pgTable("ai_config", {
	key: text().primaryKey().notNull(),
	value: text().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedBy: text("updated_by"),
});

export const tenantFeatureFlags = pgTable("tenant_feature_flags", {
	id: text().primaryKey().notNull(),
	tenantId: text("tenant_id").notNull(),
	module: text().notNull(),
	enabled: boolean().default(true).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedBy: text("updated_by"),
}, (table) => [
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "tenant_feature_flags_tenant_id_fkey"
		}),
	unique("tenant_module_unique").on(table.tenantId, table.module),
]);

export const users = pgTable("users", {
	id: text().primaryKey().notNull(),
	name: text(),
	email: text(),
	passwordHash: text("password_hash"),
	emailVerified: timestamp("email_verified", { withTimezone: true, mode: 'string' }),
	image: text(),
	role: role().default('OPERATOR').notNull(),
	active: boolean().default(true).notNull(),
	gmailRefreshToken: text("gmail_refresh_token"),
	inviteToken: text("invite_token"),
	inviteTokenExpiresAt: timestamp("invite_token_expires_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	tenantId: text("tenant_id"),
}, (table) => [
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "users_tenant_id_fkey"
		}),
	unique("users_email_unique").on(table.email),
]);

export const programmes = pgTable("programmes", {
	id: text().primaryKey().notNull(),
	schoolId: text("school_id").notNull(),
	fundingOpportunityId: text("funding_opportunity_id"),
	programmeName: text("programme_name").notNull(),
	programmeType: text("programme_type"),
	yearGroup: text("year_group"),
	startDate: text("start_date"),
	endDate: text("end_date"),
	status: text().default('PLANNED'),
	studentCount: integer("student_count").default(0),
	notes: text(),
	createdBy: text("created_by"),
	sourceTable: text("source_table"),
	sourceId: text("source_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	tenantId: text("tenant_id"),
}, (table) => [
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "programmes_tenant_id_fkey"
		}),
]);

export const students = pgTable("students", {
	id: text().primaryKey().notNull(),
	schoolId: text("school_id").notNull(),
	programmeId: text("programme_id"),
	firstName: text("first_name").notNull(),
	lastName: text("last_name").notNull(),
	yearGroup: text("year_group"),
	consentStatus: text("consent_status").default('PENDING'),
	attendanceCount: integer("attendance_count").default(0),
	safeguardingFlag: boolean("safeguarding_flag").default(false),
	supportNotes: text("support_notes"),
	notes: text(),
	createdBy: text("created_by"),
	sourceTable: text("source_table"),
	sourceId: text("source_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	tenantId: text("tenant_id"),
}, (table) => [
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "students_tenant_id_fkey"
		}),
]);

export const placements = pgTable("placements", {
	id: text().primaryKey().notNull(),
	volunteerId: text("volunteer_id").notNull(),
	programmeId: text("programme_id").notNull(),
	startDate: text("start_date"),
	endDate: text("end_date"),
	hoursDelivered: real("hours_delivered").default(0),
	status: text().default('CONFIRMED'),
	notes: text(),
	createdBy: text("created_by"),
	sourceTable: text("source_table"),
	sourceId: text("source_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	tenantId: text("tenant_id"),
}, (table) => [
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "placements_tenant_id_fkey"
		}),
]);

export const aiLogs = pgTable("ai_logs", {
	id: text().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	feature: text().notNull(),
	inputTokens: integer("input_tokens"),
	outputTokens: integer("output_tokens"),
	latencyMs: integer("latency_ms"),
	success: boolean().notNull(),
	error: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	provider: text(),
	model: text(),
	tenantId: text("tenant_id"),
}, (table) => [
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "ai_logs_tenant_id_fkey"
		}),
]);

export const tenants = pgTable("tenants", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	slug: text().notNull(),
	domain: text(),
	active: boolean().default(true).notNull(),
	suspended: boolean().default(false).notNull(),
	settings: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	status: text().default('active').notNull(),
}, (table) => [
	unique("tenants_slug_key").on(table.slug),
]);

export const opportunities = pgTable("opportunities", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	value: numeric({ precision: 15, scale:  2 }),
	stage: opportunityStage().default('PROSPECT').notNull(),
	funderId: text("funder_id"),
	organizationId: text("organization_id"),
	ownerId: text("owner_id").notNull(),
	expectedCloseDate: timestamp("expected_close_date", { withTimezone: true, mode: 'string' }),
	actualCloseDate: timestamp("actual_close_date", { withTimezone: true, mode: 'string' }),
	description: text(),
	notes: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	tenantId: text("tenant_id"),
}, (table) => [
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "opportunities_tenant_id_fkey"
		}),
]);

export const opportunityActivities = pgTable("opportunity_activities", {
	id: text().primaryKey().notNull(),
	opportunityId: text("opportunity_id").notNull(),
	activityId: text("activity_id").notNull(),
	tenantId: text("tenant_id"),
}, (table) => [
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "opportunity_activities_tenant_id_fkey"
		}),
	unique("opportunity_activities_opportunity_id_activity_id_unique").on(table.opportunityId, table.activityId),
]);

export const supportTickets = pgTable("support_tickets", {
	id: text().primaryKey().notNull(),
	ticketNumber: text("ticket_number").notNull(),
	title: text().notNull(),
	description: text().notNull(),
	status: ticketStatus().default('OPEN').notNull(),
	priority: text().default('MEDIUM').notNull(),
	source: ticketSource().default('MANUAL').notNull(),
	reportedById: text("reported_by_id").notNull(),
	assignedToId: text("assigned_to_id"),
	contactId: text("contact_id"),
	organizationId: text("organization_id"),
	resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: 'string' }),
	resolutionNotes: text("resolution_notes"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	tenantId: text("tenant_id"),
}, (table) => [
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "support_tickets_tenant_id_fkey"
		}),
	unique("support_tickets_ticket_number_unique").on(table.ticketNumber),
]);

export const ticketUpdates = pgTable("ticket_updates", {
	id: text().primaryKey().notNull(),
	ticketId: text("ticket_id").notNull(),
	authorId: text("author_id").notNull(),
	content: text().notNull(),
	isInternal: boolean("is_internal").default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	tenantId: text("tenant_id"),
}, (table) => [
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "ticket_updates_tenant_id_fkey"
		}),
]);

export const contacts = pgTable("contacts", {
	id: text().primaryKey().notNull(),
	firstName: text("first_name").notNull(),
	lastName: text("last_name").notNull(),
	role: text(),
	email: text().notNull(),
	phone: text(),
	status: contactStatus().default('PROSPECT').notNull(),
	lastContactedAt: timestamp("last_contacted_at", { withTimezone: true, mode: 'string' }),
	organizationId: text("organization_id").notNull(),
	ownerId: text("owner_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	tenantId: text("tenant_id"),
}, (table) => [
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "contacts_tenant_id_fkey"
		}),
]);

export const activities = pgTable("activities", {
	id: text().primaryKey().notNull(),
	type: activityType().notNull(),
	summary: text().notNull(),
	date: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	contactId: text("contact_id"),
	organizationId: text("organization_id"),
	opportunityId: text("opportunity_id"),
	userId: text("user_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	tenantId: text("tenant_id"),
}, (table) => [
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "activities_tenant_id_fkey"
		}),
]);

export const tasks = pgTable("tasks", {
	id: text().primaryKey().notNull(),
	title: text().notNull(),
	description: text(),
	dueDate: timestamp("due_date", { withTimezone: true, mode: 'string' }).notNull(),
	priority: priority().default('MEDIUM').notNull(),
	status: taskStatus().default('PENDING').notNull(),
	ownerId: text("owner_id").notNull(),
	contactId: text("contact_id"),
	organizationId: text("organization_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	tenantId: text("tenant_id"),
}, (table) => [
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "tasks_tenant_id_fkey"
		}),
]);

export const notes = pgTable("notes", {
	id: text().primaryKey().notNull(),
	content: text().notNull(),
	authorId: text("author_id").notNull(),
	contactId: text("contact_id"),
	organizationId: text("organization_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	tenantId: text("tenant_id"),
}, (table) => [
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "notes_tenant_id_fkey"
		}),
]);

export const emailTemplates = pgTable("email_templates", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	subject: text().notNull(),
	body: text().notNull(),
	variables: text().array().default([""]).notNull(),
	ownerId: text("owner_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	tenantId: text("tenant_id"),
}, (table) => [
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "email_templates_tenant_id_fkey"
		}),
]);

export const campaigns = pgTable("campaigns", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	subject: text().notNull(),
	bodyTemplate: text("body_template").notNull(),
	status: campaignStatus().default('DRAFT').notNull(),
	scheduledAt: timestamp("scheduled_at", { withTimezone: true, mode: 'string' }),
	ownerId: text("owner_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	tenantId: text("tenant_id"),
}, (table) => [
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "campaigns_tenant_id_fkey"
		}),
]);

export const campaignContacts = pgTable("campaign_contacts", {
	id: text().primaryKey().notNull(),
	campaignId: text("campaign_id").notNull(),
	contactId: text("contact_id").notNull(),
	status: sendStatus().default('PENDING').notNull(),
	sentAt: timestamp("sent_at", { withTimezone: true, mode: 'string' }),
	error: text(),
	tenantId: text("tenant_id"),
}, (table) => [
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "campaign_contacts_tenant_id_fkey"
		}),
]);

export const outboundEmails = pgTable("outbound_emails", {
	id: text().primaryKey().notNull(),
	campaignId: text("campaign_id"),
	contactId: text("contact_id"),
	userId: text("user_id").notNull(),
	toEmail: text("to_email").notNull(),
	subject: text().notNull(),
	bodySnapshot: text("body_snapshot").notNull(),
	status: sendStatus().notNull(),
	gmailMessageId: text("gmail_message_id"),
	gmailThreadId: text("gmail_thread_id"),
	sentAt: timestamp("sent_at", { withTimezone: true, mode: 'string' }),
	error: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	attachments: jsonb(),
	tenantId: text("tenant_id"),
}, (table) => [
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "outbound_emails_tenant_id_fkey"
		}),
]);

export const gmailCredentials = pgTable("gmail_credentials", {
	id: text().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	refreshToken: text("refresh_token").notNull(),
	accessToken: text("access_token"),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }),
	connectedAt: timestamp("connected_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	tenantId: text("tenant_id"),
}, (table) => [
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "gmail_credentials_tenant_id_fkey"
		}),
	unique("gmail_credentials_user_id_unique").on(table.userId),
]);

export const volunteers = pgTable("volunteers", {
	id: text().primaryKey().notNull(),
	contactId: text("contact_id").notNull(),
	dbsStatus: dbsStatus("dbs_status").default('NOT_CHECKED').notNull(),
	dbsCheckedAt: timestamp("dbs_checked_at", { withTimezone: true, mode: 'string' }),
	dbsExpiresAt: timestamp("dbs_expires_at", { withTimezone: true, mode: 'string' }),
	availability: text(),
	skills: text().array().default([""]).notNull(),
	references: text().array().default([""]).notNull(),
	internalNotes: text("internal_notes"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	tenantId: text("tenant_id"),
}, (table) => [
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "volunteers_tenant_id_fkey"
		}),
	unique("volunteers_contact_id_unique").on(table.contactId),
]);

export const funderContacts = pgTable("funder_contacts", {
	id: text().primaryKey().notNull(),
	funderId: text("funder_id").notNull(),
	contactId: text("contact_id").notNull(),
	tenantId: text("tenant_id"),
}, (table) => [
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "funder_contacts_tenant_id_fkey"
		}),
	unique("funder_contacts_funder_id_contact_id_unique").on(table.funderId, table.contactId),
]);

export const aiTicketDiagnoses = pgTable("ai_ticket_diagnoses", {
	id: text().primaryKey().notNull(),
	ticketId: text("ticket_id").notNull(),
	diagnosis: text().notNull(),
	suggestedAction: text("suggested_action").notNull(),
	confidence: text().notNull(),
	approvedById: text("approved_by_id"),
	approvedAt: timestamp("approved_at", { withTimezone: true, mode: 'string' }),
	applied: boolean().default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	tenantId: text("tenant_id"),
}, (table) => [
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "ai_ticket_diagnoses_tenant_id_fkey"
		}),
]);

export const notifications = pgTable("notifications", {
	id: text().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	title: text().notNull(),
	message: text().notNull(),
	type: text().default('INFO').notNull(),
	read: boolean().default(false).notNull(),
	link: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	tenantId: text("tenant_id"),
}, (table) => [
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "notifications_tenant_id_fkey"
		}),
]);
