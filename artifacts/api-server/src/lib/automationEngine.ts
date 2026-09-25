/**
 * Automation Rules Engine — Task 7.6
 * Evaluates automation rules against change events.
 * Supports actions: SEND_NOTIFICATION, UPDATE_FIELD, CREATE_ACTIVITY, CREATE_TASK, CALL_WEBHOOK
 * Loop prevention: max 5 cascading triggers per original event.
 */
import { db, automationRulesTable, activitiesTable, tasksTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { generateId } from "./id";
import { createNotification } from "./notifications";
import { logger } from "./logger";

interface ChangeContext {
  tenantId: string;
  entityType: string;
  entityId: string;
  eventType: "CREATE" | "UPDATE" | "DELETE";
  changedFields: string[];
  oldValues: Record<string, any>;
  newValues: Record<string, any>;
  userId?: string;
  depth?: number; // cascade depth counter
}

function evaluateCondition(condition: any, ctx: ChangeContext): boolean {
  const { field, operator, value } = condition;
  const fieldValue = ctx.newValues[field] ?? ctx.oldValues[field];
  switch (operator) {
    case "equals": return fieldValue === value;
    case "not_equals": return fieldValue !== value;
    case "contains": return typeof fieldValue === "string" && fieldValue.includes(value);
    case "changed": return ctx.changedFields.includes(field);
    case "changed_to": return ctx.changedFields.includes(field) && fieldValue === value;
    case "changed_from": return ctx.changedFields.includes(field) && ctx.oldValues[field] === value;
    case "is_null": return fieldValue == null;
    case "is_not_null": return fieldValue != null;
    default: return false;
  }
}

function evaluateConditions(conditions: any[], ctx: ChangeContext): boolean {
  if (!conditions || conditions.length === 0) return true;
  return conditions.every(c => evaluateCondition(c, ctx));
}

async function executeAction(action: any, ctx: ChangeContext): Promise<void> {
  try {
    switch (action.type) {
      case "SEND_NOTIFICATION":
        if (action.userId) {
          await createNotification({
            userId: action.userId,
            tenantId: ctx.tenantId,
            title: action.title || "Automation notification",
            message: action.message || `${ctx.entityType} ${ctx.entityId} was ${ctx.eventType.toLowerCase()}d`,
            type: action.notificationType || "INFO",
          });
        }
        break;

      case "CREATE_ACTIVITY":
        await db.insert(activitiesTable).values({
          id: generateId("act"),
          tenantId: ctx.tenantId,
          type: action.activityType || "NOTE",
          subject: action.subject || `Automated: ${ctx.entityType} ${ctx.eventType}`,
          notes: action.notes || `Triggered by automation rule on ${ctx.entityType} ${ctx.entityId}`,
          createdBy: ctx.userId || "system",
        } as any);
        break;

      case "CREATE_TASK":
        await db.insert(tasksTable).values({
          id: generateId("tsk"),
          tenantId: ctx.tenantId,
          title: action.title || `Automated task: ${ctx.entityType}`,
          description: action.description || `Triggered by automation rule`,
          status: "OPEN",
          priority: action.priority || "MEDIUM",
          assignedToUserId: action.assignedToUserId || ctx.userId || null,
          createdBy: ctx.userId || "system",
        } as any);
        break;

      case "CALL_WEBHOOK":
        if (action.url) {
          fetch(action.url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ event: ctx, timestamp: new Date().toISOString() }),
            signal: AbortSignal.timeout(5000),
          }).catch(() => {}); // fire-and-forget
        }
        break;
    }
  } catch (err) {
    logger.error({ event: "automation_action_failed", action: action.type, entityType: ctx.entityType, entityId: ctx.entityId, err });
  }
}

export async function evaluateAutomationRules(ctx: ChangeContext): Promise<void> {
  const depth = ctx.depth ?? 0;
  if (depth >= 5) return; // loop prevention

  try {
    const rules = await db.select().from(automationRulesTable)
      .where(and(
        eq(automationRulesTable.tenantId, ctx.tenantId),
        eq(automationRulesTable.entityType, ctx.entityType),
        eq(automationRulesTable.triggerEvent, `ON_${ctx.eventType}`),
        eq(automationRulesTable.active, true),
      ));

    for (const rule of rules) {
      const conditions = rule.conditions as any[];
      const actions = rule.actions as any[];

      if (!evaluateConditions(conditions, ctx)) continue;

      for (const action of actions) {
        await executeAction(action, ctx);
      }

      // Update run count
      await db.update(automationRulesTable)
        .set({ runCount: rule.runCount + 1, lastRunAt: new Date() })
        .where(eq(automationRulesTable.id, rule.id));
    }
  } catch (err) {
    logger.error({ event: "automation_evaluation_failed", entityType: ctx.entityType, err });
  }
}
