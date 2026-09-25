import { Router, Request, Response } from "express";
import { authMiddleware, requireRole, denyDevRoles } from "../lib/auth";
import { db, remediationPoliciesTable, remediationRunsTable, usersTable } from "@workspace/db";
import { eq, desc, and, gte, notInArray, count, sql } from "drizzle-orm";
import { generateId } from "../lib/id";
import { logger } from "../lib/logger";
import * as engine from "../lib/remediationEngine";
import { notifyAdminUsers } from "../lib/notifications";
import { auditMiddleware } from "../lib/audit";

const router = Router();

// GET /remediation/policies — ADMIN only
router.get("/policies", authMiddleware, denyDevRoles, requireRole("ADMIN"), async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId;
    const policies = await db
      .select()
      .from(remediationPoliciesTable)
      .where(tenantId ? eq(remediationPoliciesTable.tenantId, tenantId) : undefined)
      .orderBy(remediationPoliciesTable.name);
    res.json(policies);
    return;
  } catch (error: unknown) {
    logger.error({ error }, "Error fetching policies");
    res.status(500).json({ error: "Internal Server Error" });
    return;
  }
});

// PATCH /remediation/policies/:id — ADMIN only
router.patch("/policies/:id", authMiddleware, denyDevRoles, requireRole("ADMIN"), async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const { isEnabled, requiresApproval, maxAutoRunsPerDay } = req.body;
  const tenantId = req.user!.tenantId;

  try {
    const [updated] = await db
      .update(remediationPoliciesTable)
      .set({
        isEnabled,
        requiresApproval,
        maxAutoRunsPerDay,
        updatedAt: new Date(),
      })
      .where(and(eq(remediationPoliciesTable.id, id), tenantId ? eq(remediationPoliciesTable.tenantId, tenantId) : undefined))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Policy not found" });
      return;
    }

    res.json(updated);
    return;
  } catch (error: unknown) {
    logger.error({ error }, "Error updating policy");
    res.status(500).json({ error: "Internal Server Error" });
    return;
  }
});

// POST /remediation/policies/:id/evaluate — ADMIN/MANAGER
router.post("/policies/:id/evaluate", authMiddleware, denyDevRoles, requireRole("ADMIN", "MANAGER"), async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  try {
    const tenantId = req.user!.tenantId;
    const [policy] = await db
      .select({ id: remediationPoliciesTable.id })
      .from(remediationPoliciesTable)
      .where(and(eq(remediationPoliciesTable.id, id), tenantId ? eq(remediationPoliciesTable.tenantId, tenantId) : undefined));
    if (!policy) {
      res.status(404).json({ error: "Policy not found" });
      return;
    }
    const result = await engine.evaluatePolicy(id);
    res.json(result);
    return;
  } catch (error: unknown) {
    logger.error({ error }, "Error evaluating policy");
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    return;
  }
});

// POST /remediation/policies/:id/run — ADMIN/MANAGER
router.post("/policies/:id/run", authMiddleware, denyDevRoles, requireRole("ADMIN", "MANAGER"), auditMiddleware("remediation_policy"), async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  try {
    const tenantId = req.user!.tenantId;
    const [policy] = await db
      .select()
      .from(remediationPoliciesTable)
      .where(and(eq(remediationPoliciesTable.id, id), tenantId ? eq(remediationPoliciesTable.tenantId, tenantId) : undefined));
    if (!policy) {
      res.status(404).json({ error: "Policy not found" });
      return;
    }

    if (policy.maxAutoRunsPerDay > 0) {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const [{ value: todayCount }] = await db
        .select({ value: count() })
        .from(remediationRunsTable)
        .where(
          and(
            eq(remediationRunsTable.policyId, id),
            gte(remediationRunsTable.createdAt, startOfToday),
            notInArray(remediationRunsTable.status, ["REJECTED", "SKIPPED"]),
            tenantId ? eq(remediationRunsTable.tenantId, tenantId) : undefined
          )
        );
      if (todayCount >= policy.maxAutoRunsPerDay) {
        res.status(429).json({ error: `Daily run limit of ${policy.maxAutoRunsPerDay} reached for this policy` });
        return;
      }
    }

    const evaluation = await engine.evaluatePolicy(id);
    const runId = generateId("run");
    const status = policy.requiresApproval ? "PENDING_APPROVAL" : ("APPROVED" as const);

    const [run] = await db.insert(remediationRunsTable).values({
      id: runId,
      tenantId,
      policyId: id,
      triggeredById: req.user?.id,
      status,
      input: { ids: (evaluation as any).ids || [], context: (evaluation as any).context },
      createdAt: new Date(),
    }).returning();

    if (status === "APPROVED") {
      engine.executePolicy(runId, req.user?.id)
        .then(() => {
          notifyAdminUsers({
            title: "Remediation policy completed",
            message: `Policy "${policy.name}" has finished executing.`,
            type: "SUCCESS",
            link: "/admin",
          }).catch(err => logger.error({ err }, "Failed to send remediation notification"));
        })
        .catch((err) => logger.error({ err }, "Background policy execution failed"));
    }

    res.json(run);
    return;
  } catch (error: unknown) {
    logger.error({ error }, "Error starting policy run");
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    return;
  }
});

// POST /remediation/runs/:id/approve — ADMIN/MANAGER
router.post("/runs/:id/approve", authMiddleware, denyDevRoles, requireRole("ADMIN", "MANAGER"), auditMiddleware("remediation_run"), async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  try {
    const tenantId = req.user!.tenantId;
    const [run] = await db
      .select()
      .from(remediationRunsTable)
      .where(and(eq(remediationRunsTable.id, id), tenantId ? eq(remediationRunsTable.tenantId, tenantId) : undefined));
    if (!run || run.status !== "PENDING_APPROVAL") {
      res.status(400).json({ error: "Run not found or not in pending status" });
      return;
    }

    await db.update(remediationRunsTable).set({
      status: "APPROVED" as const,
      approvedById: req.user?.id,
      approvedAt: new Date(),
    }).where(and(eq(remediationRunsTable.id, id), tenantId ? eq(remediationRunsTable.tenantId, tenantId) : undefined));

    await engine.executePolicy(id, req.user?.id);

    const [updatedRun] = await db
      .select()
      .from(remediationRunsTable)
      .where(and(eq(remediationRunsTable.id, id), tenantId ? eq(remediationRunsTable.tenantId, tenantId) : undefined));
    res.json(updatedRun);
    return;
  } catch (error: unknown) {
    logger.error({ error }, "Error approving run");
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    return;
  }
});

// POST /remediation/runs/:id/reject — ADMIN/MANAGER
router.post("/runs/:id/reject", authMiddleware, denyDevRoles, requireRole("ADMIN", "MANAGER"), auditMiddleware("remediation_run"), async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  try {
    const tenantId = req.user!.tenantId;
    const [updated] = await db
      .update(remediationRunsTable)
      .set({
        status: "REJECTED" as const,
      })
      .where(and(eq(remediationRunsTable.id, id), tenantId ? eq(remediationRunsTable.tenantId, tenantId) : undefined))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Run not found" });
      return;
    }

    res.json(updated);
    return;
  } catch (error: unknown) {
    logger.error({ error }, "Error rejecting run");
    res.status(500).json({ error: "Internal Server Error" });
    return;
  }
});

// GET /remediation/runs — ADMIN/MANAGER. Optional ?status= filter.
router.get("/runs", authMiddleware, denyDevRoles, requireRole("ADMIN", "MANAGER"), async (req: Request, res: Response): Promise<void> => {
  try {
    const { status } = req.query;
    const tenantId = req.user!.tenantId;
    const conditions = [];
    if (tenantId) conditions.push(eq(remediationRunsTable.tenantId, tenantId));
    if (status) conditions.push(eq(remediationRunsTable.status, status as any));
    const runs = await db
      .select()
      .from(remediationRunsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(remediationRunsTable.createdAt));
    res.json(runs);
    return;
  } catch (error: unknown) {
    logger.error({ error }, "Error fetching runs");
    res.status(500).json({ error: "Internal Server Error" });
    return;
  }
});

// GET /remediation/dashboard — ADMIN only. Summary for the admin UI.
router.get("/dashboard", authMiddleware, denyDevRoles, requireRole("ADMIN"), async (req: Request, res: Response): Promise<void> => {
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const tenantId = req.user!.tenantId;

    // Pending approval runs
    const pendingRuns = await db
      .select({
        id: remediationRunsTable.id,
        policyId: remediationRunsTable.policyId,
        triggeredById: remediationRunsTable.triggeredById,
        input: remediationRunsTable.input,
        createdAt: remediationRunsTable.createdAt,
      })
      .from(remediationRunsTable)
      .where(and(eq(remediationRunsTable.status, "PENDING_APPROVAL"), tenantId ? eq(remediationRunsTable.tenantId, tenantId) : undefined))
      .orderBy(desc(remediationRunsTable.createdAt));

    // Completed today
    const completedToday = await db
      .select({
        id: remediationRunsTable.id,
        policyId: remediationRunsTable.policyId,
        status: remediationRunsTable.status,
        input: remediationRunsTable.input,
        output: remediationRunsTable.output,
        error: remediationRunsTable.error,
        createdAt: remediationRunsTable.createdAt,
        executedAt: remediationRunsTable.executedAt,
        approvedById: remediationRunsTable.approvedById,
      })
      .from(remediationRunsTable)
      .where(
        and(
          eq(remediationRunsTable.status, "EXECUTED"),
          gte(remediationRunsTable.createdAt, startOfToday),
          tenantId ? eq(remediationRunsTable.tenantId, tenantId) : undefined
        )
      )
      .orderBy(desc(remediationRunsTable.createdAt));

    // Failed runs (recent)
    const failedRuns = await db
      .select({
        id: remediationRunsTable.id,
        policyId: remediationRunsTable.policyId,
        error: remediationRunsTable.error,
        input: remediationRunsTable.input,
        createdAt: remediationRunsTable.createdAt,
      })
      .from(remediationRunsTable)
      .where(and(eq(remediationRunsTable.status, "FAILED"), tenantId ? eq(remediationRunsTable.tenantId, tenantId) : undefined))
      .orderBy(desc(remediationRunsTable.createdAt))
      .limit(10);

    // Enrich with policy names
    const policyIds = [...new Set([
      ...pendingRuns.map(r => r.policyId),
      ...completedToday.map(r => r.policyId),
      ...failedRuns.map(r => r.policyId),
    ])];

    const policies = policyIds.length > 0
      ? await db
          .select({ id: remediationPoliciesTable.id, name: remediationPoliciesTable.name })
          .from(remediationPoliciesTable)
          .where(and(sql`${remediationPoliciesTable.id} IN ${policyIds}`, tenantId ? eq(remediationPoliciesTable.tenantId, tenantId) : undefined))
      : [];
    const policyNameMap = new Map(policies.map(p => [p.id, p.name]));

    // Enrich with user names
    const userIds = [...new Set([
      ...pendingRuns.map(r => r.triggeredById).filter(Boolean),
      ...completedToday.map(r => r.approvedById).filter(Boolean),
    ])];
    const users = userIds.length > 0
      ? await db
          .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
          .from(usersTable)
          .where(and(sql`${usersTable.id} IN ${userIds}`, tenantId ? eq(usersTable.tenantId, tenantId) : undefined))
      : [];
    const userNameMap = new Map(users.map(u => [u.id, u.name || u.email || u.id]));

    const enrichRun = (run: Record<string, unknown>) => ({
      ...run,
      policyName: policyNameMap.get(run.policyId as string) || run.policyId,
      triggeredByName: run.triggeredById ? userNameMap.get(run.triggeredById as string) || run.triggeredById : "System (auto)",
      approvedByName: run.approvedById ? userNameMap.get(run.approvedById as string) || run.approvedById : null,
    });

    res.json({
      pendingRuns: pendingRuns.map(enrichRun),
      completedToday: completedToday.map(enrichRun),
      failedRuns: failedRuns.map(enrichRun),
    });
    return;
  } catch (error: unknown) {
    logger.error({ error }, "Error fetching remediation dashboard");
    res.status(500).json({ error: "Internal Server Error" });
    return;
  }
});

// POST /remediation/super-admin/trigger — SUPER_ADMIN only. Manual trigger for any policy against any target.
router.post("/super-admin/trigger", authMiddleware, denyDevRoles, requireRole("SUPER_ADMIN"), auditMiddleware("remediation_policy"), async (req: Request, res: Response): Promise<void> => {
  const { policyName, targetId } = req.body;

  if (!policyName || !targetId) {
    res.status(400).json({ error: "policyName and targetId are required" });
    return;
  }

  try {
    const [policy] = await db
      .select()
      .from(remediationPoliciesTable)
      .where(eq(remediationPoliciesTable.name, policyName));

    if (!policy) {
      res.status(404).json({ error: `Policy "${policyName}" not found` });
      return;
    }

    // Evaluate the policy to get context
    const evaluation = await engine.evaluatePolicy(policy.id);

    if ((evaluation as any).actionableItems === 0) {
      res.status(400).json({ error: "No trigger condition met for this policy. The issue may have been resolved." });
      return;
    }

    const context = (evaluation as any).context || { targetId };

    // SUPER_ADMIN bypasses approval — always auto-execute
    const run = await engine.firePolicyFromTrigger(policyName, context, req.user?.id);

    if (!run) {
      res.status(409).json({ error: "A recent run already exists for this target" });
      return;
    }

    res.json({ success: true, run });
    return;
  } catch (error: unknown) {
    logger.error({ error }, "Error in SUPER_ADMIN manual trigger");
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    return;
  }
});

export default router;
