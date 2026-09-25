import { db, reportTypesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// Seed platform report types (tenant_id = null means platform-seeded, available to all tenants)
const platformReportTypes = [
  {
    id: "rpt_org_summary",
    tenantId: null,
    entityType: "organizations",
    label: "Organisation Summary",
    description: "Summary of all organisations with key metrics",
    availableFields: ["id", "name", "type", "status", "city", "postcode", "createdAt"],
    availableFilters: ["type", "status", "city"],
    availableGroupings: ["type", "status"],
    joinConfig: [
      { entity: "contacts", on: "contacts.orgId = organizations.id", fields: ["firstName", "lastName", "email"] }
    ],
  },
  {
    id: "rpt_contact_activity",
    tenantId: null,
    entityType: "contacts",
    label: "Contact Activity",
    description: "Activity history for contacts",
    availableFields: ["id", "firstName", "lastName", "email", "phone", "orgId", "lastActivityDate"],
    availableFilters: ["orgId", "status"],
    availableGroupings: ["orgId"],
    joinConfig: [
      { entity: "organizations", on: "organizations.id = contacts.orgId", fields: ["name", "type"] },
      { entity: "activities", on: "activities.contactId = contacts.id", fields: ["type", "date", "notes"] }
    ],
  },
  {
    id: "rpt_programme_delivery",
    tenantId: null,
    entityType: "programmes",
    label: "Programme Delivery",
    description: "Programme delivery status and metrics",
    availableFields: ["id", "name", "status", "startDate", "endDate", "cohortId"],
    availableFilters: ["status", "cohortId"],
    availableGroupings: ["status"],
    joinConfig: [
      { entity: "students", on: "students.programmeId = programmes.id", fields: ["firstName", "lastName"] },
      { entity: "programme_sessions", on: "programme_sessions.programmeId = programmes.id", fields: ["date", "location"] }
    ],
  },
  {
    id: "rpt_student_outcomes",
    tenantId: null,
    entityType: "students",
    label: "Student Outcomes",
    description: "Student outcome measures and progress",
    availableFields: ["id", "firstName", "lastName", "programmeId", "status"],
    availableFilters: ["programmeId", "status"],
    availableGroupings: ["programmeId", "status"],
    joinConfig: [
      { entity: "programmes", on: "programmes.id = students.programmeId", fields: ["name", "status"] },
      { entity: "outcome_records", on: "outcome_records.studentId = students.id", fields: ["assessmentType", "score", "date"] }
    ],
  },
  {
    id: "rpt_volunteer_deployment",
    tenantId: null,
    entityType: "volunteers",
    label: "Volunteer Deployment",
    description: "Volunteer placement and deployment status",
    availableFields: ["id", "firstName", "lastName", "status", "skills", "availability"],
    availableFilters: ["status", "skills"],
    availableGroupings: ["status"],
    joinConfig: [
      { entity: "placements", on: "placements.volunteerId = volunteers.id", fields: ["startDate", "endDate", "status"] }
    ],
  },
  {
    id: "rpt_funding_pipeline",
    tenantId: null,
    entityType: "funding_opportunities",
    label: "Funding Pipeline",
    description: "Funding opportunity pipeline and status",
    availableFields: ["id", "title", "status", "amount", "deadline", "funderId"],
    availableFilters: ["status", "funderId"],
    availableGroupings: ["status"],
    joinConfig: [
      { entity: "funders", on: "funders.id = funding_opportunities.funderId", fields: ["name", "type"] }
    ],
  },
  {
    id: "rpt_safeguarding_overview",
    tenantId: null,
    entityType: "safeguarding_notes",
    label: "Safeguarding Overview",
    description: "Safeguarding case overview (restricted access)",
    availableFields: ["id", "studentId", "category", "severity", "status", "createdAt"],
    availableFilters: ["category", "severity", "status"],
    availableGroupings: ["category", "severity", "status"],
    joinConfig: [
      { entity: "students", on: "students.id = safeguarding_notes.studentId", fields: ["firstName", "lastName"] }
    ],
  },
  {
    id: "rpt_consent_status",
    tenantId: null,
    entityType: "consent_records",
    label: "Consent Status",
    description: "Consent records status overview",
    availableFields: ["id", "studentId", "consentType", "status", "obtainedDate", "expiryDate"],
    availableFilters: ["consentType", "status"],
    availableGroupings: ["consentType", "status"],
    joinConfig: [
      { entity: "students", on: "students.id = consent_records.studentId", fields: ["firstName", "lastName"] }
    ],
  },
  {
    id: "rpt_attendance_analysis",
    tenantId: null,
    entityType: "session_attendance",
    label: "Attendance Analysis",
    description: "Student attendance rates and patterns",
    availableFields: ["id", "studentId", "sessionId", "status", "date"],
    availableFilters: ["status", "sessionId"],
    availableGroupings: ["status", "sessionId"],
    joinConfig: [
      { entity: "students", on: "students.id = session_attendance.studentId", fields: ["firstName", "lastName"] },
      { entity: "programme_sessions", on: "programme_sessions.id = session_attendance.sessionId", fields: ["date", "programmeId"] }
    ],
  },
  {
    id: "rpt_impact_report",
    tenantId: null,
    entityType: "programmes",
    label: "Impact Report",
    description: "Comprehensive programme impact analysis",
    availableFields: ["id", "name", "status", "startDate", "endDate"],
    availableFilters: ["status"],
    availableGroupings: ["status"],
    joinConfig: [
      { entity: "students", on: "students.programmeId = programmes.id", fields: ["firstName", "lastName", "status"] },
      { entity: "outcome_records", on: "outcome_records.studentId = students.id", fields: ["assessmentType", "score"] },
      { entity: "programme_sessions", on: "programme_sessions.programmeId = programmes.id", fields: ["date"] },
      { entity: "session_attendance", on: "session_attendance.sessionId = programme_sessions.id", fields: ["status"] }
    ],
  },
  // Phase 8 additions
  {
    id: "rpt_lead_velocity",
    tenantId: null,
    entityType: "funding_opportunities",
    label: "Lead Velocity",
    description: "Time from lead created to won/lost — identify bottlenecks in your pipeline",
    availableFields: ["id", "title", "status", "amount", "createdAt", "updatedAt", "deadline"],
    availableFilters: ["status", "funderId"],
    availableGroupings: ["status"],
    joinConfig: [
      { entity: "funders", on: "funders.id = funding_opportunities.funderId", fields: ["name", "type"] }
    ],
  },
  {
    id: "rpt_contacts_no_activity",
    tenantId: null,
    entityType: "contacts",
    label: "Contacts Without Activity",
    description: "At-risk relationships — contacts with no activity in 30, 60, or 90 days",
    availableFields: ["id", "firstName", "lastName", "email", "phone", "orgId", "lastActivityDate", "createdAt"],
    availableFilters: ["orgId", "status", "lastActivityDate"],
    availableGroupings: ["orgId"],
    joinConfig: [
      { entity: "organizations", on: "organizations.id = contacts.orgId", fields: ["name", "type"] }
    ],
  },
  {
    id: "rpt_campaign_roi",
    tenantId: null,
    entityType: "activities",
    label: "Campaign ROI",
    description: "Activities and outcomes attributed to each outreach campaign",
    availableFields: ["id", "type", "date", "notes", "contactId", "createdAt"],
    availableFilters: ["type", "date"],
    availableGroupings: ["type"],
    joinConfig: [
      { entity: "contacts", on: "contacts.id = activities.contactId", fields: ["firstName", "lastName", "email"] }
    ],
  },
  {
    id: "rpt_volunteer_pipeline",
    tenantId: null,
    entityType: "volunteers",
    label: "Volunteer Pipeline",
    description: "Volunteer status, DBS expiry, and placement history",
    availableFields: ["id", "firstName", "lastName", "email", "status", "dbsExpiry", "skills", "createdAt"],
    availableFilters: ["status", "dbsExpiry"],
    availableGroupings: ["status"],
    joinConfig: [
      { entity: "placements", on: "placements.volunteerId = volunteers.id", fields: ["startDate", "endDate", "status"] }
    ],
  },
  {
    id: "rpt_outcome_summary",
    tenantId: null,
    entityType: "outcome_records",
    label: "Outcome Summary",
    description: "Outcome data across programmes — track impact metrics",
    availableFields: ["id", "frameworkId", "studentId", "score", "notes", "recordedAt"],
    availableFilters: ["frameworkId", "recordedAt"],
    availableGroupings: ["frameworkId"],
    joinConfig: [
      { entity: "students", on: "students.id = outcome_records.studentId", fields: ["firstName", "lastName"] }
    ],
  },
  {
    id: "rpt_win_rate_by_source",
    tenantId: null,
    entityType: "funding_opportunities",
    label: "Win Rate by Source",
    description: "Won vs lost funding opportunities grouped by funder type — identify your best lead sources",
    availableFields: ["id", "title", "status", "amount", "funderId", "createdAt", "updatedAt"],
    availableFilters: ["status", "funderId"],
    availableGroupings: ["status", "funderId"],
    joinConfig: [
      { entity: "funders", on: "funders.id = funding_opportunities.funderId", fields: ["name", "type"] }
    ],
  },
  {
    id: "rpt_rep_leaderboard",
    tenantId: null,
    entityType: "activities",
    label: "Rep Leaderboard",
    description: "Activity volume and outcomes per team member — see who is driving the most engagement",
    availableFields: ["id", "type", "date", "notes", "contactId", "ownerId", "createdAt"],
    availableFilters: ["type", "ownerId", "date"],
    availableGroupings: ["ownerId", "type"],
    joinConfig: [
      { entity: "contacts", on: "contacts.id = activities.contactId", fields: ["firstName", "lastName"] }
    ],
  },
];

export async function seedReportTypes() {
  for (const reportType of platformReportTypes) {
    const existing = await db.select().from(reportTypesTable).where(eq(reportTypesTable.id, reportType.id));
    if (existing.length === 0) {
      await db.insert(reportTypesTable).values(reportType);
    }
  }
}
