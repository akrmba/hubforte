import { db, aiLogsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { generateId } from "./id";
import { logger } from "./logger";
import { getRequestId } from "./requestContext";
import { getAIProvider, chatCompletionWithContext } from "./aiProvider";

async function logAiInteraction({
  userId,
  feature,
  input,
  output,
  startTime,
  success,
  error,
  provider,
  model,
  inputTokens,
  outputTokens,
}: {
  userId: string;
  feature: string;
  input: string;
  output?: string;
  startTime: number;
  success: boolean;
  error?: string;
  provider?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
}) {
  const latencyMs = Date.now() - startTime;
  try {
    const [user] = await db
      .select({ tenantId: usersTable.tenantId })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    await db.insert(aiLogsTable).values({
      id: generateId("ailog"),
      tenantId: user?.tenantId ?? null,
      userId,
      feature,
      provider,
      model,
      inputTokens,
      outputTokens,
      latencyMs,
      success,
      error,
    });
  } catch (err) {
    logger.error({ err }, "Failed to log AI interaction");
  }
}

export async function draftEmail({
  userId,
  tenantId,
  recipientName,
  context,
  tone = "professional",
}: {
  userId: string;
  tenantId?: string;
  recipientName: string;
  context: string;
  tone?: string;
}) {
  const startTime = Date.now();
  const prompt = `Draft a ${tone} email to ${recipientName}. Context: ${context}`;

  try {
    const ctx = await getAIProvider("client", tenantId);
    const response = await chatCompletionWithContext(ctx, prompt);
    await logAiInteraction({ userId, feature: "draftEmail", input: prompt, output: response.content, startTime, success: true, provider: response.provider, model: response.model, inputTokens: response.inputTokens, outputTokens: response.outputTokens });
    return { success: true, result: response.content };
  } catch (error: any) {
    await logAiInteraction({ userId, feature: "draftEmail", input: prompt, startTime, success: false, error: error.message });
    return { success: false, error: error.message };
  }
}

export async function summariseRelationship({
  userId,
  tenantId,
  contactName,
  history,
}: {
  userId: string;
  tenantId?: string;
  contactName: string;
  history: string;
}) {
  const startTime = Date.now();
  const prompt = `Summarise the relationship history with contact ${contactName} based on these activities: ${history}`;

  try {
    const ctx = await getAIProvider("client", tenantId);
    const response = await chatCompletionWithContext(ctx, prompt);
    await logAiInteraction({ userId, feature: "summariseRelationship", input: prompt, output: response.content, startTime, success: true, provider: response.provider, model: response.model, inputTokens: response.inputTokens, outputTokens: response.outputTokens });
    return { success: true, result: response.content };
  } catch (error: any) {
    await logAiInteraction({ userId, feature: "summariseRelationship", input: prompt, startTime, success: false, error: error.message });
    return { success: false, error: error.message };
  }
}

export async function suggestNextAction({
  userId,
  tenantId,
  contactName,
  history,
}: {
  userId: string;
  tenantId?: string;
  contactName: string;
  history: string;
}) {
  const startTime = Date.now();
  const prompt = `Based on the following history with ${contactName}, suggest the single most important next action: ${history}`;

  try {
    const ctx = await getAIProvider("client", tenantId);
    const response = await chatCompletionWithContext(ctx, prompt);
    await logAiInteraction({ userId, feature: "suggestNextAction", input: prompt, output: response.content, startTime, success: true, provider: response.provider, model: response.model, inputTokens: response.inputTokens, outputTokens: response.outputTokens });
    return { success: true, result: response.content };
  } catch (error: any) {
    await logAiInteraction({ userId, feature: "suggestNextAction", input: prompt, startTime, success: false, error: error.message });
    return { success: false, error: error.message };
  }
}

export async function cleanContactData({
  userId,
  tenantId,
  contacts,
}: {
  userId: string;
  tenantId?: string;
  contacts: any[];
}) {
  const startTime = Date.now();
  const prompt = `Identify data quality issues (missing fields, inconsistent formatting, potential duplicates) in this JSON array of contacts: ${JSON.stringify(contacts)}. Return a JSON object with an "issues" array.`;

  try {
    const ctx = await getAIProvider("client", tenantId);
    const response = await chatCompletionWithContext(ctx, prompt, true);
    const result = JSON.parse(response.content);
    await logAiInteraction({ userId, feature: "cleanContactData", input: prompt, output: response.content, startTime, success: true, provider: response.provider, model: response.model, inputTokens: response.inputTokens, outputTokens: response.outputTokens });
    return { success: true, result };
  } catch (error: any) {
    await logAiInteraction({ userId, feature: "cleanContactData", input: prompt, startTime, success: false, error: error.message });
    return { success: false, error: error.message };
  }
}

export async function diagnoseTicket({
  userId,
  ticketTitle,
  ticketDescription,
  updates,
}: {
  userId: string;
  ticketTitle: string;
  ticketDescription: string;
  updates: string;
}) {
  const startTime = Date.now();
  const prompt = `Diagnose this support ticket and suggest an action.
Title: ${ticketTitle}
Description: ${ticketDescription}
Updates: ${updates}

Return JSON with: diagnosis, suggestedAction, confidence (0-1).`;

  try {
    // Always use SYSTEM AI — diagnosis is a technical/platform feature, never tenant BYOK.
    const ctx = await getAIProvider("system");
    const response = await chatCompletionWithContext(ctx, prompt, true);
    const result = JSON.parse(response.content);
    await logAiInteraction({ userId, feature: "diagnoseTicket", input: prompt, output: response.content, startTime, success: true, provider: response.provider, model: response.model, inputTokens: response.inputTokens, outputTokens: response.outputTokens });
    return { success: true, result };
  } catch (error: any) {
    await logAiInteraction({ userId, feature: "diagnoseTicket", input: prompt, startTime, success: false, error: error.message });
    return { success: false, error: error.message };
  }
}
