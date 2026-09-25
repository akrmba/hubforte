import { Router, Request, Response } from "express";
import { authMiddleware, requireRole, denyDevRoles } from "../lib/auth";
import { db, aiLogsTable, contactsTable, tenantAiConfigTable } from "@workspace/db";
import { desc, eq, and } from "drizzle-orm";
import { draftEmail, summariseRelationship, suggestNextAction, cleanContactData } from "../lib/ai";
import { getAIProvider, chatCompletionWithContext } from "../lib/aiProvider";
import { logger } from "../lib/logger";

// Per-user nav helper rate limit: 10 requests/user/day
const navHelperUsage = new Map<string, { count: number; date: string }>();
const NAV_HELPER_DAILY_CAP = 10;

function checkNavHelperCap(userId: string): boolean {
  const today = new Date().toISOString().slice(0, 10);
  const entry = navHelperUsage.get(userId);
  if (!entry || entry.date !== today) {
    navHelperUsage.set(userId, { count: 1, date: today });
    return true;
  }
  if (entry.count >= NAV_HELPER_DAILY_CAP) return false;
  entry.count++;
  return true;
}

// Check if a specific AI feature toggle is enabled for a tenant.
// Returns true if no BYOK config exists (system default = all enabled).
async function isFeatureEnabled(tenantId: string | undefined, feature: keyof {
  emailComposerEnabled: boolean;
  contactSummaryEnabled: boolean;
  leadScoreEnabled: boolean;
  nextBestActionEnabled: boolean;
  navHelperEnabled: boolean;
}): Promise<boolean> {
  if (!tenantId) return true;
  try {
    const [cfg] = await db
      .select()
      .from(tenantAiConfigTable)
      .where(eq(tenantAiConfigTable.tenantId, tenantId))
      .limit(1);
    if (!cfg) return true; // no BYOK config = system default = all enabled
    return cfg[feature] !== false;
  } catch {
    return true; // fail open
  }
}

const router = Router();

// POST /ai/draft-email — requires OPERATOR+ (gated by emailComposer toggle)
router.post("/draft-email", authMiddleware, denyDevRoles, requireRole("OPERATOR", "MANAGER", "ADMIN"), async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId as string | undefined;
  if (!await isFeatureEnabled(tenantId, "emailComposerEnabled")) {
    res.status(403).json({ error: "Email Composer AI is disabled for your account.", success: false });
    return;
  }
  const { recipientName, context, tone } = req.body;
  if (!recipientName || !context) {
    res.status(400).json({ error: "recipientName and context are required" });
    return;
  }

  const result = await draftEmail({
    userId: req.user!.id,
    tenantId,
    recipientName,
    context,
    tone,
  });

  if (result.success) {
    res.json(result);
  } else {
    res.status(500).json(result);
  }
});

// POST /ai/summarise-contact — OPERATOR+ (gated by contactSummary toggle)
router.post("/summarise-contact", authMiddleware, denyDevRoles, requireRole("OPERATOR", "MANAGER", "ADMIN"), async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId as string | undefined;
  if (!await isFeatureEnabled(tenantId, "contactSummaryEnabled")) {
    res.status(403).json({ error: "Contact Summary AI is disabled for your account.", success: false });
    return;
  }
  const { contactName, history } = req.body;
  if (!contactName || !history) {
    res.status(400).json({ error: "contactName and history are required" });
    return;
  }

  const result = await summariseRelationship({
    userId: req.user!.id,
    tenantId,
    contactName,
    history,
  });

  if (result.success) {
    res.json(result);
  } else {
    res.status(500).json(result);
  }
});

// POST /ai/suggest-next-action — OPERATOR+ (gated by nextBestAction toggle)
router.post("/suggest-next-action", authMiddleware, denyDevRoles, requireRole("OPERATOR", "MANAGER", "ADMIN"), async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId as string | undefined;
  if (!await isFeatureEnabled(tenantId, "nextBestActionEnabled")) {
    res.status(403).json({ error: "Next Best Action AI is disabled for your account.", success: false });
    return;
  }
  const { contactName, history } = req.body;
  if (!contactName || !history) {
    res.status(400).json({ error: "contactName and history are required" });
    return;
  }

  const result = await suggestNextAction({
    userId: req.user!.id,
    tenantId,
    contactName,
    history,
  });

  if (result.success) {
    res.json(result);
  } else {
    res.status(500).json(result);
  }
});

// POST /ai/clean-data — MANAGER+ only
router.post("/clean-data", authMiddleware, denyDevRoles, requireRole("MANAGER", "ADMIN"), async (req: Request, res: Response) => {
  const { contacts } = req.body;
  if (!contacts || !Array.isArray(contacts)) {
    res.status(400).json({ error: "contacts array is required" });
    return;
  }

  const result = await cleanContactData({
    userId: req.user!.id,
    tenantId: req.user!.tenantId as string | undefined,
    contacts,
  });

  if (result.success) {
    res.json(result);
  } else {
    res.status(500).json(result);
  }
});

// GET /ai/logs — ADMIN only
router.get("/logs", authMiddleware, denyDevRoles, requireRole("ADMIN"), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const logs = await db
      .select()
      .from(aiLogsTable)
      .where(tenantId ? eq(aiLogsTable.tenantId, tenantId) : undefined)
      .orderBy(desc(aiLogsTable.createdAt))
      .limit(100);

    res.json(logs);
  } catch (error: any) {
    logger.error({ error }, "Failed to fetch AI logs");
    res.status(500).json({ error: "Failed to fetch AI logs" });
  }
});

// POST /ai/compose-email — Email Composer AI (client AI)
router.post("/compose-email", authMiddleware, denyDevRoles, requireRole("OPERATOR", "MANAGER", "ADMIN"), async (req: Request, res: Response): Promise<void> => {
  try {
    const { audience, tone, keyMessage } = req.body;
    if (!audience || !keyMessage) {
      res.status(400).json({ error: "audience and keyMessage are required" });
      return;
    }
    const tenantId = req.user!.tenantId as string | undefined;
    if (!await isFeatureEnabled(tenantId, "emailComposerEnabled")) {
      res.status(403).json({ error: "Email Composer AI is disabled for your account." });
      return;
    }
    const ctx = await getAIProvider("client", tenantId);
    const prompt = `You are an expert email copywriter for a CRM sales team.
Write a professional outreach email for the following:
- Target audience: ${audience}
- Tone: ${tone || "professional"}
- Key message: ${keyMessage}

Respond with JSON: { "subject": "...", "body": "..." }
Keep the body under 200 words. No markdown in the body.`;

    const result = await chatCompletionWithContext(ctx, prompt, true);
    let parsed: { subject: string; body: string };
    try {
      parsed = JSON.parse(result.content);
    } catch {
      res.status(500).json({ error: "AI returned an unexpected response. Please try again." });
      return;
    }
    res.json({ success: true, subject: parsed.subject, body: parsed.body });
  } catch (err: any) {
    logger.warn({ err }, "compose-email AI failed");
    const msg = err?.message || "";
    const isBudget = msg.includes("AI budget reached");
    res.json({ success: false, error: isBudget ? msg : "AI unavailable. Please write your email manually." });
  }
});

// POST /ai/contact-summary/:contactId — Contact Summary AI (client AI)
router.post("/contact-summary/:contactId", authMiddleware, denyDevRoles, requireRole("OPERATOR", "MANAGER", "ADMIN"), async (req: Request, res: Response): Promise<void> => {
  try {
    const contactId = req.params.contactId as string;
    const tenantId = req.user!.tenantId as string;
    if (!tenantId) { res.status(400).json({ error: "No tenant context" }); return; }
    if (!await isFeatureEnabled(tenantId, "contactSummaryEnabled")) {
      res.json({ success: false, error: "Contact Summary AI is disabled for your account." });
      return;
    }

    const [contact] = await db
      .select()
      .from(contactsTable)
      .where(and(eq(contactsTable.id, contactId), tenantId ? eq(contactsTable.tenantId, tenantId) : undefined))
      .limit(1);

    if (!contact) { res.status(404).json({ error: "Contact not found" }); return; }

    const ctx = await getAIProvider("client", tenantId);
    const prompt = `Summarise this CRM contact in 2-3 sentences for a sales team member.
Name: ${contact.firstName} ${contact.lastName}
Role: ${contact.role || "unknown"}
Status: ${contact.status}
Last contacted: ${contact.lastContactedAt ? new Date(contact.lastContactedAt).toLocaleDateString() : "never"}
Notes: ${contact.notes || "none"}
Tags: ${(contact.tags || []).join(", ") || "none"}

Be concise and actionable. Focus on relationship status and next steps.`;

    const result = await chatCompletionWithContext(ctx, prompt);
    res.json({ success: true, summary: result.content.trim() });
  } catch (err: any) {
    logger.warn({ err }, "contact-summary AI failed");
    const msg = err?.message || "";
    res.json({ success: false, error: msg.includes("AI budget reached") ? msg : "AI unavailable", summary: null });
  }
});

// POST /ai/score-lead/:contactId — Lead Score AI (client AI, background-safe)
router.post("/score-lead/:contactId", authMiddleware, denyDevRoles, requireRole("OPERATOR", "MANAGER", "ADMIN"), async (req: Request, res: Response): Promise<void> => {
  try {
    const contactId = req.params.contactId as string;
    const tenantId = req.user!.tenantId as string;
    if (!tenantId) { res.status(400).json({ error: "No tenant context" }); return; }
    if (!await isFeatureEnabled(tenantId, "leadScoreEnabled")) {
      res.json({ success: false, error: "Lead Scoring AI is disabled for your account." });
      return;
    }

    const [contact] = await db
      .select()
      .from(contactsTable)
      .where(and(eq(contactsTable.id, contactId), tenantId ? eq(contactsTable.tenantId, tenantId) : undefined))
      .limit(1);

    if (!contact) { res.status(404).json({ error: "Contact not found" }); return; }

    // Rules-based scoring
    let score = 30; // base
    if (contact.status === "ACTIVE") score += 20;
    if (contact.lastContactedAt) {
      const daysSince = (Date.now() - new Date(contact.lastContactedAt).getTime()) / 86400000;
      if (daysSince < 7) score += 20;
      else if (daysSince < 30) score += 10;
      else if (daysSince > 90) score -= 10;
    }
    if (contact.email) score += 5;
    if (contact.phone) score += 5;
    if (contact.isDecisionMaker) score += 10;
    if (contact.consentToContact) score += 5;
    score = Math.max(0, Math.min(100, score));

    const label =
      score <= 30 ? "Cold" :
      score <= 60 ? "Warm" :
      score <= 80 ? "Hot" : "Ready";

    // AI explanation
    const ctx = await getAIProvider("client", tenantId);
    const prompt = `A CRM contact has been scored ${score}/100 (${label}).
Contact: ${contact.firstName} ${contact.lastName}, status: ${contact.status}, last contacted: ${contact.lastContactedAt ? new Date(contact.lastContactedAt).toLocaleDateString() : "never"}.
Write one sentence explaining why this score makes sense and what the sales team should do next.`;

    let explanation = `Score: ${score}/100 (${label})`;
    try {
      const result = await chatCompletionWithContext(ctx, prompt);
      explanation = result.content.trim();
    } catch (aiErr: any) {
      // Budget exhaustion must propagate — rethrow so the outer handler returns 402
      if (aiErr?.message?.includes("AI budget reached")) throw aiErr;
      // Non-budget AI failure: explanation is optional, score still saved
    }

    // Persist score to contact
    await db
      .update(contactsTable)
      .set({
        leadScore: score,
        leadScoreLabel: label,
        leadScoreExplanation: explanation,
        leadScoreUpdatedAt: new Date(),
      })
      .where(and(eq(contactsTable.id, contactId), tenantId ? eq(contactsTable.tenantId, tenantId) : undefined));

    res.json({ success: true, score, label, explanation });
  } catch (err: any) {
    logger.warn({ err }, "score-lead AI failed");
    const msg = err?.message || "";
    res.status(msg.includes("AI budget reached") ? 402 : 500).json({ success: false, error: msg.includes("AI budget reached") ? msg : "Failed to score lead" });
  }
});

// POST /ai/next-best-action/:contactId — Next Best Action (client AI)
router.post("/next-best-action/:contactId", authMiddleware, denyDevRoles, requireRole("OPERATOR", "MANAGER", "ADMIN"), async (req: Request, res: Response): Promise<void> => {
  try {
    const contactId = req.params.contactId as string;
    const tenantId = req.user!.tenantId as string;
    if (!tenantId) { res.status(400).json({ error: "No tenant context" }); return; }
    if (!await isFeatureEnabled(tenantId, "nextBestActionEnabled")) {
      res.json({ success: false, error: "Next Best Action AI is disabled for your account.", action: null });
      return;
    }

    const [contact] = await db
      .select()
      .from(contactsTable)
      .where(and(eq(contactsTable.id, contactId), tenantId ? eq(contactsTable.tenantId, tenantId) : undefined))
      .limit(1);

    if (!contact) { res.status(404).json({ error: "Contact not found" }); return; }

    const ctx = await getAIProvider("client", tenantId);
    const daysSince = contact.lastContactedAt
      ? Math.round((Date.now() - new Date(contact.lastContactedAt).getTime()) / 86400000)
      : null;

    const prompt = `You are a CRM sales coach. Recommend ONE specific next action for this contact.
Name: ${contact.firstName} ${contact.lastName}
Status: ${contact.status}
Last contacted: ${daysSince !== null ? `${daysSince} days ago` : "never"}
Lead score: ${contact.leadScore ?? "not scored"}
Notes: ${contact.notes || "none"}

Respond with a single actionable sentence starting with a verb (e.g. "Send a follow-up email...", "Schedule a call to...").
Maximum 30 words.`;

    const result = await chatCompletionWithContext(ctx, prompt);
    res.json({ success: true, action: result.content.trim() });
  } catch (err: any) {
    logger.warn({ err }, "next-best-action AI failed");
    const msg = err?.message || "";
    res.json({ success: false, error: msg.includes("AI budget reached") ? msg : "AI unavailable", action: null });
  }
});

// POST /ai/nav-helper — Navigation Helper (strict navigation scope, 10/user/day cap)
router.post("/nav-helper", authMiddleware, denyDevRoles, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const tenantId = req.user!.tenantId as string | undefined;

    if (!await isFeatureEnabled(tenantId, "navHelperEnabled")) {
      res.json({ success: false, error: "Navigation Helper AI is disabled for your account.", answer: null });
      return;
    }

    if (!checkNavHelperCap(userId)) {
      res.status(429).json({ error: "Daily AI navigation limit reached (10 requests/day). Try again tomorrow." });
      return;
    }

    const { question } = req.body;
    if (!question || typeof question !== "string" || question.trim().length === 0) {
      res.status(400).json({ error: "question is required" });
      return;
    }

    const ctx = await getAIProvider("client", tenantId);

    const prompt = `You are a navigation assistant for Hubforte. Help the user find where to go in the app.
Available pages: Dashboard, Contacts, Organizations, Activities, Tasks, Outreach/Campaigns, Reports, Settings, Integrations, Health Dashboard, Admin.

User question: "${question.trim()}"

Respond with ONE sentence telling them exactly where to go. If the question is not about navigation, say: "I can only help with navigation. Please use the search bar for other questions."
Maximum 25 words.`;

    const result = await chatCompletionWithContext(ctx, prompt);
    res.json({ success: true, answer: result.content.trim() });
  } catch (err: any) {
    logger.warn({ err }, "nav-helper AI failed");
    const msg = err?.message || "";
    res.json({ success: false, error: msg.includes("AI budget reached") ? msg : "AI unavailable", answer: null });
  }
});

export default router;
