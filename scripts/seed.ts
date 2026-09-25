import { db } from "../lib/db/src";
import {
  usersTable,
  organizationsTable,
  contactsTable,
  tasksTable,
  activitiesTable,
  notesTable,
  emailTemplatesTable,
  remediationPoliciesTable,
} from "../lib/db/src/schema";
import { createHash, randomBytes } from "crypto";

function generateId(prefix?: string): string {
  const id = randomBytes(12).toString("base64url");
  return prefix ? `${prefix}_${id}` : id;
}

async function hashPassword(password: string): Promise<string> {
  const { default: bcrypt } = await import("bcryptjs");
  return bcrypt.hash(password, 10);
}

async function main() {
  console.log("Seeding database...");

  await db.delete(activitiesTable);
  await db.delete(notesTable);
  await db.delete(tasksTable);
  await db.delete(contactsTable);
  await db.delete(organizationsTable);
  await db.delete(emailTemplatesTable);
  await db.delete(remediationPoliciesTable);
  await db.delete(usersTable);

  const seedPassword = process.env.SEED_PASSWORD;
  if (!seedPassword) { console.error("ERROR: SEED_PASSWORD env var is required"); process.exit(1); }
  const adminEmail = process.env.ADMIN_EMAIL || "admin@crm.example";
  const passwordHash = await hashPassword(seedPassword);

  const adminId = generateId("usr");
  const managerId = generateId("usr");
  const operatorId = generateId("usr");
  const viewerId = generateId("usr");

  await db.insert(usersTable).values([
    { id: adminId, name: "Alex Johnson", email: adminEmail, passwordHash, role: "ADMIN", active: true },
    { id: managerId, name: "Sam Williams", email: "manager@crm.example", passwordHash, role: "MANAGER", active: true },
    { id: operatorId, name: "Jordan Lee", email: "operator@crm.example", passwordHash, role: "OPERATOR", active: true },
    { id: viewerId, name: "Casey Martin", email: "viewer@crm.example", passwordHash, role: "VIEWER", active: true },
  ]);
  console.log("Created users");

  const org1Id = generateId("org");
  const org2Id = generateId("org");
  const org3Id = generateId("org");
  const org4Id = generateId("org");
  const org5Id = generateId("org");

  await db.insert(organizationsTable).values([
    { id: org1Id, name: "Greenfield Academy", type: "SCHOOL", status: "ACTIVE", location: "Manchester, UK", notes: "Large secondary school with ~1200 students. Active partnership.", ownerId: adminId },
    { id: org2Id, name: "Horizon Technologies Ltd", type: "COMPANY", status: "PROSPECT", location: "London, UK", notes: "Tech company, potential sponsor.", ownerId: managerId },
    { id: org3Id, name: "The Oaks Foundation", type: "CHARITY", status: "ACTIVE", location: "Bristol, UK", notes: "Education-focused charity. Strong relationship.", ownerId: adminId },
    { id: org4Id, name: "Northern Council Education Authority", type: "GOVERNMENT", status: "ACTIVE", location: "Leeds, UK", notes: "Regional authority. Strategic partner.", ownerId: managerId },
    { id: org5Id, name: "Brightstone Family Trust", type: "TRUST", status: "INACTIVE", location: "York, UK", notes: "Previously engaged, currently dormant.", ownerId: operatorId },
  ]);
  console.log("Created organizations");

  const con1Id = generateId("con");
  const con2Id = generateId("con");
  const con3Id = generateId("con");
  const con4Id = generateId("con");
  const con5Id = generateId("con");
  const con6Id = generateId("con");

  const today = new Date();
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const nextWeek = new Date(today); nextWeek.setDate(nextWeek.getDate() + 7);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);

  await db.insert(contactsTable).values([
    { id: con1Id, firstName: "Emma", lastName: "Thompson", email: "e.thompson@greenfield.ac.uk", phone: "+44 7700 900001", role: "Head Teacher", status: "ACTIVE", organizationId: org1Id, ownerId: adminId, lastContactedAt: new Date(Date.now() - 3 * 86400000) },
    { id: con2Id, firstName: "David", lastName: "Chen", email: "d.chen@horizontech.co.uk", phone: "+44 7700 900002", role: "CEO", status: "PROSPECT", organizationId: org2Id, ownerId: managerId },
    { id: con3Id, firstName: "Sarah", lastName: "Patel", email: "s.patel@oaksfoundation.org", phone: "+44 7700 900003", role: "Director of Programmes", status: "ACTIVE", organizationId: org3Id, ownerId: adminId, lastContactedAt: new Date(Date.now() - 7 * 86400000) },
    { id: con4Id, firstName: "Michael", lastName: "Robertson", email: "m.robertson@northerncouncil.gov.uk", phone: "+44 7700 900004", role: "Education Commissioner", status: "ACTIVE", organizationId: org4Id, ownerId: managerId, lastContactedAt: new Date(Date.now() - 14 * 86400000) },
    { id: con5Id, firstName: "Rachel", lastName: "Summers", email: "r.summers@greenfield.ac.uk", phone: "+44 7700 900005", role: "Deputy Head", status: "ACTIVE", organizationId: org1Id, ownerId: adminId },
    { id: con6Id, firstName: "Tom", lastName: "Bradley", email: "t.bradley@brightstone.org", phone: "+44 7700 900006", role: "Trustee", status: "INACTIVE", organizationId: org5Id, ownerId: operatorId },
  ]);
  console.log("Created contacts");

  await db.insert(tasksTable).values([
    { id: generateId("tsk"), title: "Follow up with Emma Thompson re: partnership renewal", description: "Discuss the 2025-2026 partnership agreement terms.", dueDate: today, priority: "HIGH", status: "PENDING", ownerId: adminId, contactId: con1Id, organizationId: org1Id },
    { id: generateId("tsk"), title: "Send sponsorship proposal to Horizon Technologies", description: "Prepare and send formal proposal document.", dueDate: tomorrow, priority: "HIGH", status: "IN_PROGRESS", ownerId: managerId, contactId: con2Id, organizationId: org2Id },
    { id: generateId("tsk"), title: "Book meeting with Sarah Patel - Q2 review", description: "Arrange quarterly programme review meeting.", dueDate: nextWeek, priority: "MEDIUM", status: "PENDING", ownerId: adminId, contactId: con3Id, organizationId: org3Id },
    { id: generateId("tsk"), title: "Submit annual impact report", description: "Required by Northern Council - OVERDUE.", dueDate: yesterday, priority: "HIGH", status: "PENDING", ownerId: managerId, contactId: con4Id, organizationId: org4Id },
    { id: generateId("tsk"), title: "Update CRM contact list from conference", description: "Add new contacts met at EdTech North conference.", dueDate: nextWeek, priority: "LOW", status: "PENDING", ownerId: operatorId },
  ]);
  console.log("Created tasks");

  await db.insert(activitiesTable).values([
    { id: generateId("act"), type: "EMAIL", summary: "Sent partnership renewal documentation", date: new Date(Date.now() - 3 * 86400000), contactId: con1Id, organizationId: org1Id, userId: adminId },
    { id: generateId("act"), type: "CALL", summary: "Introductory call with David Chen - 30 mins", date: new Date(Date.now() - 10 * 86400000), contactId: con2Id, organizationId: org2Id, userId: managerId },
    { id: generateId("act"), type: "MEETING", summary: "Q1 programme review with Oaks Foundation - positive outcome", date: new Date(Date.now() - 7 * 86400000), contactId: con3Id, organizationId: org3Id, userId: adminId },
    { id: generateId("act"), type: "EMAIL", summary: "Impact report reminder sent to Michael Robertson", date: new Date(Date.now() - 5 * 86400000), contactId: con4Id, organizationId: org4Id, userId: managerId },
    { id: generateId("act"), type: "NOTE", summary: "Brightstone Trust relationship on hold pending trustee change", date: new Date(Date.now() - 30 * 86400000), contactId: con6Id, organizationId: org5Id, userId: adminId },
  ]);
  console.log("Created activities");

  await db.insert(notesTable).values([
    { id: generateId("note"), content: "Emma mentioned they are considering expanding the partnership to include a second school site in 2026.", authorId: adminId, contactId: con1Id, organizationId: org1Id },
    { id: generateId("note"), content: "David prefers email communication. Very data-driven - include ROI metrics in any proposal.", authorId: managerId, contactId: con2Id, organizationId: org2Id },
    { id: generateId("note"), content: "Sarah is a strong champion internally. Has board approval for multi-year engagement.", authorId: adminId, contactId: con3Id, organizationId: org3Id },
  ]);
  console.log("Created notes");

  await db.insert(emailTemplatesTable).values([
    {
      id: generateId("tpl"),
      name: "Partnership Introduction",
      subject: "Partnership Opportunity - {{organisationName}}",
      body: `Dear {{firstName}},\n\nI hope this message finds you well. I'm reaching out regarding a potential partnership opportunity.\n\nWe work with organisations like {{organisationName}} to deliver impactful programmes. I'd love to arrange a brief call to explore whether there might be a good fit.\n\nWould you have 20 minutes available in the next week or two?\n\nBest regards,\n{{senderName}}`,
      variables: ["firstName", "organisationName", "senderName"],
      ownerId: adminId,
    },
    {
      id: generateId("tpl"),
      name: "Follow-up After Meeting",
      subject: "Great to speak with you, {{firstName}}",
      body: `Hi {{firstName}},\n\nThank you for taking the time to meet with me today. It was great to learn more about the work at {{organisationName}}.\n\nI'll send over the documentation by the end of the week.\n\nWarm regards,\n{{senderName}}`,
      variables: ["firstName", "organisationName", "senderName"],
      ownerId: adminId,
    },
    {
      id: generateId("tpl"),
      name: "Annual Impact Report",
      subject: "Our Annual Impact Report - {{organisationName}}",
      body: `Dear {{firstName}},\n\nPlease find attached our annual impact report, showcasing outcomes achieved through our partnership with {{organisationName}}.\n\nWe're proud of what we've accomplished together and look forward to building on this success.\n\nKind regards,\n{{senderName}}`,
      variables: ["firstName", "organisationName", "senderName"],
      ownerId: managerId,
    },
  ]);
  console.log("Created email templates");

  await db.insert(remediationPoliciesTable).values([
    {
      id: generateId("rpol"),
      name: "Retry Failed Campaign Emails",
      description: "Detects campaign emails that failed to send and queues them for retry.",
      trigger: "Campaign email activities with status FAILED in the last 24 hours",
      action: "Re-queue failed email sends for retry",
      isEnabled: false,
      requiresApproval: true,
      maxAutoRunsPerDay: 3,
      createdById: adminId,
    },
    {
      id: generateId("rpol"),
      name: "Flag Expired DBS Volunteers",
      description: "Identifies volunteers whose DBS check has expired and marks them as non-compliant.",
      trigger: "Volunteers where dbsExpiresAt < today and dbsStatus = CLEAR",
      action: "Set dbsStatus to EXPIRED for affected volunteers",
      isEnabled: false,
      requiresApproval: false,
      maxAutoRunsPerDay: 1,
      createdById: adminId,
    },
    {
      id: generateId("rpol"),
      name: "Close Stale Tickets",
      description: "Closes support tickets that have been in WAITING status for more than 14 days with no updates.",
      trigger: "Tickets with status WAITING and no updates in 14+ days",
      action: "Set ticket status to CLOSED and add a resolution note",
      isEnabled: false,
      requiresApproval: true,
      maxAutoRunsPerDay: 1,
      createdById: adminId,
    },
    {
      id: generateId("rpol"),
      name: "Archive Inactive Contacts",
      description: "Archives contacts that have had no activity for more than 12 months.",
      trigger: "Contacts with status ACTIVE and no activities in 12+ months",
      action: "Set contact status to INACTIVE",
      isEnabled: false,
      requiresApproval: true,
      maxAutoRunsPerDay: 1,
      createdById: adminId,
    },
  ]);
  console.log("Created remediation policies");

  console.log("\n=== SEED COMPLETE ===");
  const displayPassword = process.env.SEED_PASSWORD ?? "(not set)";
  const displayAdmin = process.env.ADMIN_EMAIL || "admin@crm.example";
  console.log("Login credentials:");
  console.log(`  ${displayAdmin} / ${displayPassword} (ADMIN)`);
  console.log(`  manager@crm.example / ${displayPassword} (MANAGER)`);
  console.log(`  operator@crm.example / ${displayPassword} (OPERATOR)`);
  console.log(`  viewer@crm.example / ${displayPassword} (VIEWER)`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
