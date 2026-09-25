import { Router, type IRouter } from "express";
import { db, errorLogsTable, errorKnowledgeBaseTable, tasksTable, usersTable } from "@workspace/db";
import { eq, desc, ilike, and, or, sql } from "drizzle-orm";
import { authMiddleware, isSuperRole } from "../lib/auth";
import { generateId } from "../lib/id";
import { logger } from "../lib/logger";
import { chatCompletion } from "../lib/aiProvider";
import crypto from "crypto";

const router: IRouter = Router();

// Fix 6: derive relevant source file names from module + error pattern — file names only, no client data
function deriveRelevantFiles(module: string | null, errorPattern: string): string[] {
  const files: string[] = [];
  const m = (module || "").toLowerCase();
  const p = errorPattern.toLowerCase();

  // Map known modules to their likely source files
  const moduleFileMap: Record<string, string[]> = {
    contacts: ["routes/contacts.ts", "schema/contacts.ts"],
    organizations: ["routes/organizations.ts", "schema/organizations.ts"],
    activities: ["routes/activities.ts", "schema/activities.ts"],
    notes: ["routes/notes.ts", "schema/notes.ts"],
    auth: ["lib/auth.ts", "routes/auth.ts"],
    admin: ["routes/admin.ts"],
    ai: ["lib/aiProvider.ts", "routes/ai.ts"],
    lms: ["routes/lms.ts"],
    safeguarding: ["routes/safeguardingNotes.ts", "schema/safeguarding_notes.ts"],
    webhooks: ["routes/webhooks.ts", "schema/webhooks.ts"],
    integrations: ["routes/integrations.ts"],
    remediation: ["routes/remediation.ts"],
    support: ["routes/support.ts"],
    import: ["routes/import.ts"],
    export: ["routes/export.ts"],
  };

  if (m && moduleFileMap[m]) {
    files.push(...moduleFileMap[m]);
  }

  // Add db/index.ts for schema-related errors
  if (p.includes("column") || p.includes("table") || p.includes("schema") || p.includes("relation")) {
    files.push("lib/db/src/schema/index.ts");
  }

  // Add migration hint for migration errors
  if (p.includes("migration") || p.includes("alter table") || p.includes("does not exist")) {
    files.push("lib/db/migrations/");
  }

  return [...new Set(files)]; // deduplicate
}

const superAdminOnly = (req: any, res: any, next: any) => {
  if (!req.user || !isSuperRole(req.user.role)) {
    res.status(403).json({ error: "Super admin only" });
    return;
  }
  next();
};

// GET /api/super-admin/knowledge-base
router.get("/knowledge-base", authMiddleware, superAdminOnly, async (req, res): Promise<void> => {
  const { search, status, module, page = "1", limit = "50" } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(200, parseInt(limit, 10));
  const offset = (pageNum - 1) * limitNum;

  const conditions: any[] = [];
  if (search) {
    conditions.push(
      or(
        ilike(errorKnowledgeBaseTable.errorPattern, `%${search}%`),
        ilike(errorKnowledgeBaseTable.plainEnglish, `%${search}%`)
      )
    );
  }
  if (status) conditions.push(eq(errorKnowledgeBaseTable.status, status));
  if (module) conditions.push(eq(errorKnowledgeBaseTable.module, module));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const entries = await db
    .select()
    .from(errorKnowledgeBaseTable)
    .where(where)
    .orderBy(desc(errorKnowledgeBaseTable.lastSeenAt))
    .limit(limitNum)
    .offset(offset);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(errorKnowledgeBaseTable)
    .where(where);

  res.json({ data: entries, total, page: pageNum, totalPages: Math.ceil(total / limitNum) });
});

// Fix 4: static routes MUST come before /:id to avoid shadowing
// GET /api/super-admin/knowledge-base/export — CSV/Markdown export
router.get("/knowledge-base/export", authMiddleware, superAdminOnly, async (req, res): Promise<void> => {
  const { format = "csv" } = req.query as { format?: string };

  const entries = await db
    .select()
    .from(errorKnowledgeBaseTable)
    .orderBy(desc(errorKnowledgeBaseTable.lastSeenAt));

  if (format === "markdown") {
    const md = entries.map((e) =>
      `## ${e.errorPattern}\n\n**Status:** ${e.status}  \n**Module:** ${e.module || "unknown"}  \n**Occurrences:** ${e.occurrenceCount}  \n**Last seen:** ${e.lastSeenAt?.toISOString() || "unknown"}\n\n### Plain English\n${e.plainEnglish || "_Not yet explained_"}\n\n### Fix Steps\n${e.fixSteps || "_Not yet documented_"}\n\n---`
    ).join("\n\n");
    res.setHeader("Content-Type", "text/markdown");
    res.setHeader("Content-Disposition", "attachment; filename=error-knowledge-base.md");
    res.send(md);
    return;
  }

  // CSV
  const header = "id,errorPattern,status,module,occurrenceCount,firstSeenAt,lastSeenAt,plainEnglish,fixSteps";
  const rows = entries.map((e) => [
    e.id,
    `"${(e.errorPattern || "").replace(/"/g, '""')}"`,
    e.status,
    e.module || "",
    e.occurrenceCount,
    e.firstSeenAt?.toISOString() || "",
    e.lastSeenAt?.toISOString() || "",
    `"${(e.plainEnglish || "").replace(/"/g, '""')}"`,
    `"${(e.fixSteps || "").replace(/"/g, '""')}"`,
  ].join(","));

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=error-knowledge-base.csv");
  res.send([header, ...rows].join("\n"));
});

// GET /api/super-admin/knowledge-base/share/:token — accessible by DEVELOPER/PLATFORM_BUILDER
// Fix 6: include relevant code file names (module-derived) in the safe payload
router.get("/knowledge-base/share/:token", authMiddleware, async (req, res): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const allowedRoles = ["SUPER_ADMIN", "PLATFORM_OWNER", "DEVELOPER", "PLATFORM_BUILDER"];
  if (!allowedRoles.includes(req.user.role)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const token = Array.isArray(req.params.token) ? req.params.token[0] : req.params.token;
  const [entry] = await db
    .select()
    .from(errorKnowledgeBaseTable)
    .where(eq(errorKnowledgeBaseTable.shareToken, token));

  if (!entry) {
    res.status(404).json({ error: "Share link not found or expired" });
    return;
  }

  // Enforce 30-day expiry on read access — same window as the write (mark-fixed) action
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  if (!entry.shareTokenCreatedAt || Date.now() - entry.shareTokenCreatedAt.getTime() > THIRTY_DAYS_MS) {
    res.status(410).json({ error: "Share link has expired" });
    return;
  }

  // Derive relevant code file names from the module — file names only, no client data
  const relevantFiles = deriveRelevantFiles(entry.module, entry.errorPattern);

  // Return only safe fields — no client data
  res.json({
    id: entry.id,
    errorPattern: entry.errorPattern,
    plainEnglish: entry.plainEnglish,
    fixSteps: entry.fixSteps,
    status: entry.status,
    module: entry.module,
    occurrenceCount: entry.occurrenceCount,
    firstSeenAt: entry.firstSeenAt,
    lastSeenAt: entry.lastSeenAt,
    autoFixed: entry.autoFixed,
    relevantFiles,
  });
});

// POST /api/super-admin/knowledge-base/sync-from-logs
router.post("/knowledge-base/sync-from-logs", authMiddleware, superAdminOnly, async (req, res): Promise<void> => {
  const logs = await db
    .select()
    .from(errorLogsTable)
    .orderBy(desc(errorLogsTable.createdAt))
    .limit(500);

  let created = 0;
  let updated = 0;

  for (const log of logs) {
    const pattern = log.dedupHash || log.message.slice(0, 200);
    const [existing] = await db
      .select({ id: errorKnowledgeBaseTable.id, occurrenceCount: errorKnowledgeBaseTable.occurrenceCount })
      .from(errorKnowledgeBaseTable)
      .where(eq(errorKnowledgeBaseTable.errorPattern, pattern));

    if (existing) {
      await db
        .update(errorKnowledgeBaseTable)
        .set({
          occurrenceCount: (existing.occurrenceCount || 1) + 1,
          lastSeenAt: log.createdAt || new Date(),
          updatedAt: new Date(),
        })
        .where(eq(errorKnowledgeBaseTable.id, existing.id));
      updated++;
    } else {
      await db.insert(errorKnowledgeBaseTable).values({
        id: generateId(),
        errorLogId: log.id,
        errorPattern: pattern,
        plainEnglish: log.plainEnglish || null,
        module: log.source || null,
        occurrenceCount: log.occurrenceCount || 1,
        firstSeenAt: log.createdAt || new Date(),
        lastSeenAt: log.lastOccurredAt || log.createdAt || new Date(),
        autoFixed: log.resolved ? "yes" : "no",
        status: log.resolved ? "fixed" : "needs_investigation",
      });
      created++;
    }
  }

  res.json({ created, updated, total: logs.length });
});

// GET /api/super-admin/knowledge-base/:id — MUST come after all static /knowledge-base/* routes
router.get("/knowledge-base/:id", authMiddleware, superAdminOnly, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const [entry] = await db
    .select()
    .from(errorKnowledgeBaseTable)
    .where(eq(errorKnowledgeBaseTable.id, id));

  if (!entry) {
    res.status(404).json({ error: "Entry not found" });
    return;
  }
  res.json(entry);
});

// PATCH /api/super-admin/knowledge-base/:id
router.patch("/knowledge-base/:id", authMiddleware, superAdminOnly, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { plainEnglish, fixSteps, status, module, fixedInVersion } = req.body as {
    plainEnglish?: string;
    fixSteps?: string;
    status?: string;
    module?: string;
    fixedInVersion?: string;
  };

  const updates: Record<string, any> = { updatedAt: new Date() };
  if (plainEnglish !== undefined) updates.plainEnglish = plainEnglish;
  if (fixSteps !== undefined) updates.fixSteps = fixSteps;
  if (status !== undefined) updates.status = status;
  if (module !== undefined) updates.module = module;
  if (fixedInVersion !== undefined) updates.fixedInVersion = fixedInVersion;

  const [updated] = await db
    .update(errorKnowledgeBaseTable)
    .set(updates)
    .where(eq(errorKnowledgeBaseTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Entry not found" });
    return;
  }
  res.json(updated);
});

// POST /api/super-admin/knowledge-base/:id/generate-explanation
router.post("/knowledge-base/:id/generate-explanation", authMiddleware, superAdminOnly, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const [entry] = await db
    .select()
    .from(errorKnowledgeBaseTable)
    .where(eq(errorKnowledgeBaseTable.id, id));

  if (!entry) {
    res.status(404).json({ error: "Entry not found" });
    return;
  }

  try {
    const prompt = `You are a helpful software engineer. Explain this error in plain English for a non-technical user, then provide step-by-step fix instructions for a developer.

Error pattern: ${entry.errorPattern}
Module: ${entry.module || "unknown"}
Occurrence count: ${entry.occurrenceCount}

Respond in JSON: { "plainEnglish": "...", "fixSteps": "..." }`;

    const result = await chatCompletion({ prompt, jsonMode: true });
    let parsed: { plainEnglish?: string; fixSteps?: string } = {};
    try {
      parsed = JSON.parse(result.content);
    } catch {
      parsed = { plainEnglish: result.content, fixSteps: "" };
    }

    const [updated] = await db
      .update(errorKnowledgeBaseTable)
      .set({
        plainEnglish: parsed.plainEnglish || entry.plainEnglish,
        fixSteps: parsed.fixSteps || entry.fixSteps,
        updatedAt: new Date(),
      })
      .where(eq(errorKnowledgeBaseTable.id, id))
      .returning();

    res.json(updated);
  } catch (err) {
    logger.error({ event: "kb_generate_explanation_failed", id, err });
    res.status(500).json({ error: "Failed to generate explanation" });
  }
});

// POST /api/super-admin/knowledge-base/:id/share
router.post("/knowledge-base/:id/share", authMiddleware, superAdminOnly, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const [entry] = await db
    .select()
    .from(errorKnowledgeBaseTable)
    .where(eq(errorKnowledgeBaseTable.id, id));

  if (!entry) {
    res.status(404).json({ error: "Entry not found" });
    return;
  }

  const shareToken = crypto.randomBytes(32).toString("hex");
  const [updated] = await db
    .update(errorKnowledgeBaseTable)
    .set({ shareToken, shareTokenCreatedAt: new Date(), updatedAt: new Date() })
    .where(eq(errorKnowledgeBaseTable.id, id))
    .returning();

  const appUrl = process.env.APP_URL || "http://localhost:5173";
  res.json({
    shareToken,
    shareUrl: `${appUrl}/developer/share/${shareToken}`,
    entry: updated,
  });
});

// POST /api/super-admin/knowledge-base/:id/mark-fixed
// SUPER_ADMIN/PLATFORM_OWNER: can mark fixed directly by id.
// DEVELOPER/PLATFORM_BUILDER: must supply the shareToken in the request body — validates the link and its 30-day expiry.
router.post("/knowledge-base/:id/mark-fixed", authMiddleware, async (req, res): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const allowedRoles = ["SUPER_ADMIN", "PLATFORM_OWNER", "DEVELOPER", "PLATFORM_BUILDER"];
  if (!allowedRoles.includes(req.user.role)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { shareToken } = req.body as { shareToken?: string };

  const [entry] = await db
    .select()
    .from(errorKnowledgeBaseTable)
    .where(eq(errorKnowledgeBaseTable.id, id));

  if (!entry) {
    res.status(404).json({ error: "Entry not found" });
    return;
  }

  // DEVELOPER/PLATFORM_BUILDER must present the share token and it must not be expired
  const isDevRole = req.user.role === "DEVELOPER" || req.user.role === "PLATFORM_BUILDER";
  if (isDevRole) {
    if (!shareToken) {
      res.status(403).json({ error: "shareToken is required for developer roles" });
      return;
    }
    if (entry.shareToken !== shareToken) {
      res.status(403).json({ error: "Invalid share token" });
      return;
    }
    // 30-day expiry
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    if (!entry.shareTokenCreatedAt || Date.now() - entry.shareTokenCreatedAt.getTime() > THIRTY_DAYS_MS) {
      res.status(403).json({ error: "Share link has expired" });
      return;
    }
  }

  const [updated] = await db
    .update(errorKnowledgeBaseTable)
    .set({
      status: "fixed",
      markedFixedAt: new Date(),
      markedFixedBy: req.user.id,
      updatedAt: new Date(),
    })
    .where(eq(errorKnowledgeBaseTable.id, id))
    .returning();

  res.json(updated);
});

// POST /api/super-admin/knowledge-base/:id/create-task
router.post("/knowledge-base/:id/create-task", authMiddleware, superAdminOnly, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { assigneeId } = req.body as { assigneeId?: string };

  const [entry] = await db
    .select()
    .from(errorKnowledgeBaseTable)
    .where(eq(errorKnowledgeBaseTable.id, id));

  if (!entry) {
    res.status(404).json({ error: "Entry not found" });
    return;
  }

  const taskId = generateId();
  const title = `Fix: ${entry.errorPattern.slice(0, 80)}${entry.errorPattern.length > 80 ? "..." : ""}`;
  const description = entry.plainEnglish
    ? `${entry.plainEnglish}\n\nFix steps:\n${entry.fixSteps || "See knowledge base entry."}`
    : `Error pattern: ${entry.errorPattern}\n\nSee knowledge base for details.`;

  await db.insert(tasksTable).values({
    id: taskId,
    tenantId: req.user!.tenantId || null,
    title,
    description,
    status: "PENDING",
    priority: "HIGH",
    ownerId: assigneeId || req.user!.id,
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  res.status(201).json({ taskId, title });
});

export default router;
