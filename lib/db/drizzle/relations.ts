import { relations } from "drizzle-orm/relations";
import { tenants, organizations, funders, remediationPolicies, remediationRuns, tenantFeatureFlags, users, programmes, students, placements, aiLogs, opportunities, opportunityActivities, supportTickets, ticketUpdates, contacts, activities, tasks, notes, emailTemplates, campaigns, campaignContacts, outboundEmails, gmailCredentials, volunteers, funderContacts, aiTicketDiagnoses, notifications } from "./schema";

export const organizationsRelations = relations(organizations, ({one}) => ({
	tenant: one(tenants, {
		fields: [organizations.tenantId],
		references: [tenants.id]
	}),
}));

export const tenantsRelations = relations(tenants, ({many}) => ({
	organizations: many(organizations),
	funders: many(funders),
	remediationPolicies: many(remediationPolicies),
	remediationRuns: many(remediationRuns),
	tenantFeatureFlags: many(tenantFeatureFlags),
	users: many(users),
	programmes: many(programmes),
	students: many(students),
	placements: many(placements),
	aiLogs: many(aiLogs),
	opportunities: many(opportunities),
	opportunityActivities: many(opportunityActivities),
	supportTickets: many(supportTickets),
	ticketUpdates: many(ticketUpdates),
	contacts: many(contacts),
	activities: many(activities),
	tasks: many(tasks),
	notes: many(notes),
	emailTemplates: many(emailTemplates),
	campaigns: many(campaigns),
	campaignContacts: many(campaignContacts),
	outboundEmails: many(outboundEmails),
	gmailCredentials: many(gmailCredentials),
	volunteers: many(volunteers),
	funderContacts: many(funderContacts),
	aiTicketDiagnoses: many(aiTicketDiagnoses),
	notifications: many(notifications),
}));

export const fundersRelations = relations(funders, ({one}) => ({
	tenant: one(tenants, {
		fields: [funders.tenantId],
		references: [tenants.id]
	}),
}));

export const remediationPoliciesRelations = relations(remediationPolicies, ({one}) => ({
	tenant: one(tenants, {
		fields: [remediationPolicies.tenantId],
		references: [tenants.id]
	}),
}));

export const remediationRunsRelations = relations(remediationRuns, ({one}) => ({
	tenant: one(tenants, {
		fields: [remediationRuns.tenantId],
		references: [tenants.id]
	}),
}));

export const tenantFeatureFlagsRelations = relations(tenantFeatureFlags, ({one}) => ({
	tenant: one(tenants, {
		fields: [tenantFeatureFlags.tenantId],
		references: [tenants.id]
	}),
}));

export const usersRelations = relations(users, ({one}) => ({
	tenant: one(tenants, {
		fields: [users.tenantId],
		references: [tenants.id]
	}),
}));

export const programmesRelations = relations(programmes, ({one}) => ({
	tenant: one(tenants, {
		fields: [programmes.tenantId],
		references: [tenants.id]
	}),
}));

export const studentsRelations = relations(students, ({one}) => ({
	tenant: one(tenants, {
		fields: [students.tenantId],
		references: [tenants.id]
	}),
}));

export const placementsRelations = relations(placements, ({one}) => ({
	tenant: one(tenants, {
		fields: [placements.tenantId],
		references: [tenants.id]
	}),
}));

export const aiLogsRelations = relations(aiLogs, ({one}) => ({
	tenant: one(tenants, {
		fields: [aiLogs.tenantId],
		references: [tenants.id]
	}),
}));

export const opportunitiesRelations = relations(opportunities, ({one}) => ({
	tenant: one(tenants, {
		fields: [opportunities.tenantId],
		references: [tenants.id]
	}),
}));

export const opportunityActivitiesRelations = relations(opportunityActivities, ({one}) => ({
	tenant: one(tenants, {
		fields: [opportunityActivities.tenantId],
		references: [tenants.id]
	}),
}));

export const supportTicketsRelations = relations(supportTickets, ({one}) => ({
	tenant: one(tenants, {
		fields: [supportTickets.tenantId],
		references: [tenants.id]
	}),
}));

export const ticketUpdatesRelations = relations(ticketUpdates, ({one}) => ({
	tenant: one(tenants, {
		fields: [ticketUpdates.tenantId],
		references: [tenants.id]
	}),
}));

export const contactsRelations = relations(contacts, ({one}) => ({
	tenant: one(tenants, {
		fields: [contacts.tenantId],
		references: [tenants.id]
	}),
}));

export const activitiesRelations = relations(activities, ({one}) => ({
	tenant: one(tenants, {
		fields: [activities.tenantId],
		references: [tenants.id]
	}),
}));

export const tasksRelations = relations(tasks, ({one}) => ({
	tenant: one(tenants, {
		fields: [tasks.tenantId],
		references: [tenants.id]
	}),
}));

export const notesRelations = relations(notes, ({one}) => ({
	tenant: one(tenants, {
		fields: [notes.tenantId],
		references: [tenants.id]
	}),
}));

export const emailTemplatesRelations = relations(emailTemplates, ({one}) => ({
	tenant: one(tenants, {
		fields: [emailTemplates.tenantId],
		references: [tenants.id]
	}),
}));

export const campaignsRelations = relations(campaigns, ({one}) => ({
	tenant: one(tenants, {
		fields: [campaigns.tenantId],
		references: [tenants.id]
	}),
}));

export const campaignContactsRelations = relations(campaignContacts, ({one}) => ({
	tenant: one(tenants, {
		fields: [campaignContacts.tenantId],
		references: [tenants.id]
	}),
}));

export const outboundEmailsRelations = relations(outboundEmails, ({one}) => ({
	tenant: one(tenants, {
		fields: [outboundEmails.tenantId],
		references: [tenants.id]
	}),
}));

export const gmailCredentialsRelations = relations(gmailCredentials, ({one}) => ({
	tenant: one(tenants, {
		fields: [gmailCredentials.tenantId],
		references: [tenants.id]
	}),
}));

export const volunteersRelations = relations(volunteers, ({one}) => ({
	tenant: one(tenants, {
		fields: [volunteers.tenantId],
		references: [tenants.id]
	}),
}));

export const funderContactsRelations = relations(funderContacts, ({one}) => ({
	tenant: one(tenants, {
		fields: [funderContacts.tenantId],
		references: [tenants.id]
	}),
}));

export const aiTicketDiagnosesRelations = relations(aiTicketDiagnoses, ({one}) => ({
	tenant: one(tenants, {
		fields: [aiTicketDiagnoses.tenantId],
		references: [tenants.id]
	}),
}));

export const notificationsRelations = relations(notifications, ({one}) => ({
	tenant: one(tenants, {
		fields: [notifications.tenantId],
		references: [tenants.id]
	}),
}));