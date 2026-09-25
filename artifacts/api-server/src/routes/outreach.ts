import { Router, type IRouter } from "express";
import { db, gmailCredentialsTable, outboundEmailsTable, activitiesTable, contactsTable, organizationsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { authMiddleware, requireRole, denyDevRoles } from "../lib/auth";
import { generateId } from "../lib/id";
import { sendGmailEmail, type EmailAttachment } from "../lib/gmail";
import { mergeTemplate } from "../lib/templateEngine";
import multer from "multer";

const ALLOWED_MIMES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/png",
  "image/jpeg",
]);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 3 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} is not allowed. Accepted: pdf, docx, xlsx, png, jpg`));
    }
  },
});

const router: IRouter = Router();

// Preview personalised email (resolve tokens against contact data)
router.post("/outreach/preview", authMiddleware, denyDevRoles, requireRole("ADMIN", "MANAGER", "OPERATOR"), async (req, res): Promise<void> => {
  const { contactId, subject, body } = req.body;
  const tenantId = req.user!.tenantId;
  if (!contactId || !subject || !body) {
    res.status(400).json({ error: "contactId, subject, and body are required" });
    return;
  }

  const [contact] = await db
    .select()
    .from(contactsTable)
    .where(and(eq(contactsTable.id, contactId), tenantId ? eq(contactsTable.tenantId, tenantId) : undefined));
  if (!contact) {
    res.status(404).json({ error: "Contact not found" });
    return;
  }

  let orgName = "";
  if (contact.organizationId) {
    const [org] = await db
      .select({ name: organizationsTable.name })
      .from(organizationsTable)
      .where(and(eq(organizationsTable.id, contact.organizationId), tenantId ? eq(organizationsTable.tenantId, tenantId) : undefined));
    if (org) orgName = org.name;
  }

  const vars: Record<string, string> = {
    firstName: contact.firstName,
    lastName: contact.lastName,
    email: contact.email || '',
    organisationName: orgName,
    organizationName: orgName,
    company: orgName,
  };

  res.json({
    subject: mergeTemplate(subject, vars),
    body: mergeTemplate(body, vars),
  });
});

router.post("/outreach/send", authMiddleware, denyDevRoles, requireRole("ADMIN", "MANAGER", "OPERATOR"), upload.array("attachments", 3), async (req, res): Promise<void> => {
  const user = req.user!;
  const tenantId = user.tenantId;

  const { contactId, to, subject, body } = req.body;
  if (!contactId || !to || !subject || !body) {
    res.status(400).json({ error: "contactId, to, subject, and body are required" });
    return;
  }

  const [cred] = await db
    .select()
    .from(gmailCredentialsTable)
    .where(and(eq(gmailCredentialsTable.userId, user.id), tenantId ? eq(gmailCredentialsTable.tenantId, tenantId) : undefined));
  if (!cred) {
    res.status(400).json({ error: "Gmail account not connected. Please connect Gmail in Settings." });
    return;
  }

  // Resolve personalisation tokens
  const [contact] = await db
    .select()
    .from(contactsTable)
    .where(and(eq(contactsTable.id, contactId), tenantId ? eq(contactsTable.tenantId, tenantId) : undefined));
  if (!contact) {
    res.status(404).json({ error: "Contact not found" });
    return;
  }
  let resolvedSubject = subject;
  let resolvedBody = body;

  let orgName = "";
  if (contact.organizationId) {
    const [org] = await db
      .select({ name: organizationsTable.name })
      .from(organizationsTable)
      .where(and(eq(organizationsTable.id, contact.organizationId), tenantId ? eq(organizationsTable.tenantId, tenantId) : undefined));
    if (org) orgName = org.name;
  }
  const vars: Record<string, string> = {
    firstName: contact.firstName,
    lastName: contact.lastName,
    email: contact.email || '',
    organisationName: orgName,
    organizationName: orgName,
    company: orgName,
  };
  resolvedSubject = mergeTemplate(subject, vars);
  resolvedBody = mergeTemplate(body, vars);

  // Process file attachments
  const files = (req.files as Express.Multer.File[]) || [];
  const emailAttachments: EmailAttachment[] = files.map((f) => ({
    filename: f.originalname,
    mimeType: f.mimetype,
    content: f.buffer,
  }));
  const attachmentFilenames = files.map((f) => f.originalname);

  const fromEmail = process.env.GMAIL_FROM_ADDRESS || user.email || "noreply@hubforte.com";

  const result = await sendGmailEmail({
    to,
    subject: resolvedSubject,
    body: resolvedBody,
    from: fromEmail,
    refreshToken: cred.refreshToken,
    attachments: emailAttachments,
  });

  const emailId = generateId("em");
  await db.insert(outboundEmailsTable).values({
    id: emailId,
    tenantId: user.tenantId,
    campaignId: null,
    contactId,
    userId: user.id,
    toEmail: to,
    subject: resolvedSubject,
    bodySnapshot: resolvedBody,
    status: "SENT",
    gmailMessageId: result.messageId,
    gmailThreadId: result.threadId,
    sentAt: new Date(),
    error: null,
    attachments: attachmentFilenames.length > 0 ? attachmentFilenames : null,
  });

  const actId = generateId("act");
  await db.insert(activitiesTable).values({
    id: actId,
    tenantId: user.tenantId,
    type: "EMAIL",
    summary: resolvedSubject,
    date: new Date(),
    contactId,
    organizationId: null,
    userId: user.id,
  });

  await db
    .update(contactsTable)
    .set({ lastContactedAt: new Date() })
    .where(and(eq(contactsTable.id, contactId), tenantId ? eq(contactsTable.tenantId, tenantId) : undefined));

  res.json({ success: true, messageId: result.messageId });
});

export default router;
