// AI Provider Abstraction — routes chat completions to OpenAI, Anthropic, or OpenRouter.

import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { getModelConfig, getDefaultModel, getDefaultProvider, type AIProvider } from "./aiModels";
import { logger } from "./logger";
import { getRequestId } from "./requestContext";

// --- Resilience constants (P3-T3, per docs/INTEGRATION_RESILIENCE.md) ---
const AI_TIMEOUT_MS = 60_000;
const AI_MAX_RETRIES = 1;
const AI_RETRY_DELAY_MS = 2_000;
const RETRYABLE_STATUS = new Set([429, 500, 503]);

// Provider fallback order per INTEGRATION_RESILIENCE.md
const FALLBACK_ORDER: AIProvider[] = ["openai", "anthropic", "openrouter"];

// Lazy singletons
let _openai: OpenAI | null = null;
let _anthropic: Anthropic | null = null;
let _openrouter: OpenAI | null = null;

function isRetryableAiError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (error instanceof TypeError) return true;

  const candidate = error as { status?: number; code?: string; message?: string; name?: string } | undefined;
  if (candidate?.status && RETRYABLE_STATUS.has(candidate.status)) return true;

  const code = candidate?.code?.toUpperCase?.();
  if (code && ["ECONNRESET", "ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT"].includes(code)) return true;

  const message = `${candidate?.name ?? ""} ${candidate?.message ?? ""}`.toLowerCase();
  return /timeout|timed out|network|connection reset|connection refused|rate limit|overloaded|service unavailable/.test(message);
}

async function sleep(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms));
}

function getOpenAIClient(): OpenAI {
  if (!_openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not set.");
    _openai = new OpenAI({ apiKey, timeout: AI_TIMEOUT_MS });
  }
  return _openai;
}

function getAnthropicClient(): Anthropic {
  if (!_anthropic) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set.");
    _anthropic = new Anthropic({ apiKey, timeout: AI_TIMEOUT_MS });
  }
  return _anthropic;
}

function getOpenRouterClient(): OpenAI {
  if (!_openrouter) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set.");
    _openrouter = new OpenAI({
      apiKey,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: { "HTTP-Referer": process.env.APP_URL || "http://localhost:5173" },
      timeout: AI_TIMEOUT_MS,
    });
  }
  return _openrouter;
}

export interface ChatCompletionRequest {
  prompt: string;
  provider?: AIProvider;
  model?: string;
  jsonMode?: boolean;
}

export interface ChatCompletionResult {
  content: string;
  provider: AIProvider;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
}

export async function chatCompletion(req: ChatCompletionRequest): Promise<ChatCompletionResult> {
  const requestedProvider = req.provider || getDefaultProvider();
  const model = req.model || getDefaultModel();
  const startTime = Date.now();

  // Try requested provider first, then fallback to others if available
  const availableProviders = getAvailableProviders();
  const providersToTry = [requestedProvider, ...FALLBACK_ORDER.filter(p => p !== requestedProvider && availableProviders.includes(p))];

  let lastError: any;
  for (const provider of providersToTry) {
    try {
      const result = await chatCompletionWithProvider(provider, req.prompt, req.jsonMode, model);

      if (provider !== requestedProvider) {
        logger.warn({
          event: "ai_provider_fallback",
          requestedProvider,
          usedProvider: provider,
          requestId: getRequestId(),
        }, `Fell back to ${provider} after ${requestedProvider} failed`);
      }

      logger.info({
        event: "external_api_call",
        service: provider,
        model: result.model,
        durationMs: Date.now() - startTime,
        success: true,
        requestId: getRequestId(),
      });

      return { ...result, provider };
    } catch (error: any) {
      lastError = error;
      logger.warn({
        event: "external_api_call",
        service: provider,
        model,
        durationMs: Date.now() - startTime,
        success: false,
        error: error.message,
        requestId: getRequestId(),
      }, `AI call failed (${provider}), trying next provider if available`);

      // If this was the last provider, throw
      if (provider === providersToTry[providersToTry.length - 1]) {
        throw error;
      }
    }
  }

  throw lastError || new Error("All AI providers failed");
}

async function chatCompletionWithProvider(provider: AIProvider, prompt: string, jsonMode: boolean | undefined, modelHint: string): Promise<{ content: string; model: string; inputTokens?: number; outputTokens?: number }> {
  // Use provider-specific default model if the hint doesn't match this provider
  let modelToUse = modelHint;
  try {
    const config = getModelConfig(modelHint);
    if (config.provider !== provider) {
      // Model hint is for a different provider, use provider's default
      modelToUse = getDefaultModelForProvider(provider);
    }
  } catch {
    // Unknown model, use provider default
    modelToUse = getDefaultModelForProvider(provider);
  }

  const config = getModelConfig(modelToUse);

  for (let attempt = 0; attempt <= AI_MAX_RETRIES; attempt++) {
    try {
      if (config.provider === "anthropic") {
        const result = await callAnthropic(config.modelId, prompt, jsonMode);
        return { ...result, model: config.modelId };
      }

      if (config.provider === "openrouter") {
        const result = await callOpenAICompatible(getOpenRouterClient(), config.modelId, prompt, jsonMode && config.supportsJsonMode);
        return { ...result, model: config.modelId };
      }

      const result = await callOpenAICompatible(getOpenAIClient(), config.modelId, prompt, jsonMode && config.supportsJsonMode);
      return { ...result, model: config.modelId };
    } catch (error) {
      if (!isRetryableAiError(error) || attempt === AI_MAX_RETRIES) {
        throw error;
      }

      logger.warn({
        event: "integration_retry",
        service: provider,
        model: config.modelId,
        attempt: attempt + 1,
        requestId: getRequestId(),
      }, `Retrying AI provider ${provider} after retryable failure`);

      await sleep(AI_RETRY_DELAY_MS);
    }
  }

  throw new Error(`AI provider ${provider} exhausted retries unexpectedly`);
}

function getDefaultModelForProvider(provider: AIProvider): string {
  if (provider === "openai") return "gpt-4o-mini";
  if (provider === "anthropic") return "claude-sonnet-4";
  if (provider === "openrouter") return "openai/gpt-4o-mini";
  return "gpt-4o-mini";
}

async function callOpenAICompatible(client: OpenAI, model: string, prompt: string, jsonMode?: boolean): Promise<{ content: string; inputTokens?: number; outputTokens?: number }> {
  const response = await client.chat.completions.create({
    model,
    messages: [{ role: "user", content: prompt }],
    ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
  });
  return {
    content: response.choices[0]?.message?.content || "",
    inputTokens: response.usage?.prompt_tokens ?? undefined,
    outputTokens: response.usage?.completion_tokens ?? undefined,
  };
}

async function callAnthropic(model: string, prompt: string, jsonMode?: boolean): Promise<{ content: string; inputTokens?: number; outputTokens?: number }> {
  const systemPrompt = jsonMode ? "You must respond with valid JSON only. No markdown, no explanation." : undefined;
  const response = await getAnthropicClient().messages.create({
    model,
    max_tokens: 1024,
    ...(systemPrompt ? { system: systemPrompt } : {}),
    messages: [{ role: "user", content: prompt }],
  });
  const block = response.content[0];
  return {
    content: block.type === "text" ? block.text : "",
    inputTokens: response.usage?.input_tokens ?? undefined,
    outputTokens: response.usage?.output_tokens ?? undefined,
  };
}

/** Check which providers are configured */
export function getAvailableProviders(): AIProvider[] {
  const providers: AIProvider[] = [];
  if (process.env.OPENAI_API_KEY) providers.push("openai");
  if (process.env.ANTHROPIC_API_KEY) providers.push("anthropic");
  if (process.env.OPENROUTER_API_KEY) providers.push("openrouter");
  return providers;
}

// ---------------------------------------------------------------------------
// Phase 10: Dual AI context — system AI vs client AI with BYOK support
// ---------------------------------------------------------------------------

export interface AIContext {
  provider: AIProvider;
  model: string;
  /** Decrypted API key — only set for BYOK tenants */
  apiKey?: string;
  /** tenantId — set for client context to enable usage tracking */
  tenantId?: string;
  /** Monthly budget in USD — set for BYOK tenants */
  monthlyBudgetUSD?: number;
  /** Current usage this month in USD — set for BYOK tenants */
  usageThisMonth?: number;
}

/**
 * Returns the AI configuration for a given context.
 *
 * - "system": owner/platform workflows (health, remediation, daily briefing).
 *   Uses SYSTEM_AI_PROVIDER (default: anthropic).
 * - "client": tenant-facing features (email composer, lead score, etc.).
 *   Checks tenant_ai_config for BYOK first, then falls back to
 *   DEFAULT_CLIENT_AI_PROVIDER + DEFAULT_CLIENT_AI_MODEL (default: openrouter/deepseek).
 */
export async function getAIProvider(
  context: "system" | "client",
  tenantId?: string,
): Promise<AIContext> {
  if (context === "system") {
    const provider = (process.env.SYSTEM_AI_PROVIDER as AIProvider) || "anthropic";
    const model =
      provider === "anthropic"
        ? "claude-sonnet-4-5"
        : provider === "openai"
        ? "gpt-4o-mini"
        : "openai/gpt-4o-mini";
    return { provider, model };
  }

  // client context — check BYOK first, but only if owner has enabled BYOK for this tenant
  if (tenantId) {
    try {
      const { db, tenantAiConfigTable, tenantsTable } = await import("@workspace/db");
      const { eq } = await import("drizzle-orm");
      const { decrypt } = await import("./encrypt");

      // Respect owner-controlled BYOK flag — if not enabled, skip BYOK lookup entirely
      const [tenant] = await db
        .select({ byokEnabled: tenantsTable.byokEnabled })
        .from(tenantsTable)
        .where(eq(tenantsTable.id, tenantId))
        .limit(1);

      if (!tenant?.byokEnabled) {
        // BYOK not enabled for this tenant — fall through to system default client AI
        const provider = (process.env.DEFAULT_CLIENT_AI_PROVIDER as AIProvider) || "openrouter";
        const model = process.env.DEFAULT_CLIENT_AI_MODEL || "deepseek/deepseek-chat";
        return { provider, model };
      }

      const [cfg] = await db
        .select()
        .from(tenantAiConfigTable)
        .where(eq(tenantAiConfigTable.tenantId, tenantId))
        .limit(1);

      if (cfg) {
        // Reset monthly usage if we've rolled into a new month
        const now = new Date();
        const resetAt = new Date(cfg.usageResetAt);
        let usageThisMonth = cfg.usageThisMonth;
        if (now.getMonth() !== resetAt.getMonth() || now.getFullYear() !== resetAt.getFullYear()) {
          await db
            .update(tenantAiConfigTable)
            .set({ usageThisMonth: 0, usageResetAt: now })
            .where(eq(tenantAiConfigTable.tenantId, tenantId));
          usageThisMonth = 0;
        }

        const decryptedKey = decrypt(cfg.encryptedApiKey);
        return {
          provider: cfg.provider as AIProvider,
          model: cfg.model,
          apiKey: decryptedKey,
          tenantId,
          monthlyBudgetUSD: cfg.monthlyBudgetUSD,
          usageThisMonth,
        };
      }
    } catch (err) {
      logger.warn({ err, tenantId }, "Failed to load tenant AI config, falling back to default client AI");
    }
  }

  // Default client AI — OpenRouter + DeepSeek V3
  const provider = (process.env.DEFAULT_CLIENT_AI_PROVIDER as AIProvider) || "openrouter";
  const model = process.env.DEFAULT_CLIENT_AI_MODEL || "deepseek/deepseek-chat";
  return { provider, model };
}

/**
 * chatCompletion variant that accepts an AIContext (from getAIProvider).
 * Uses the tenant's own API key when present (BYOK), otherwise uses env keys.
 * Enforces monthly budget and tracks usage for BYOK tenants.
 */
export async function chatCompletionWithContext(
  ctx: AIContext,
  prompt: string,
  jsonMode?: boolean,
): Promise<ChatCompletionResult> {
  // Budget enforcement for BYOK tenants
  if (ctx.apiKey && ctx.tenantId && ctx.monthlyBudgetUSD != null && ctx.usageThisMonth != null) {
    if (ctx.usageThisMonth >= ctx.monthlyBudgetUSD) {
      throw new Error("AI budget reached. Update your AI settings to continue using AI features.");
    }
  }

  let result: ChatCompletionResult;

  if (ctx.apiKey) {
    // BYOK — create a one-off client with the tenant's key
    if (ctx.provider === "anthropic") {
      const client = new Anthropic({ apiKey: ctx.apiKey, timeout: AI_TIMEOUT_MS });
      const systemPrompt = jsonMode ? "You must respond with valid JSON only. No markdown, no explanation." : undefined;
      const response = await client.messages.create({
        model: ctx.model,
        max_tokens: 1024,
        ...(systemPrompt ? { system: systemPrompt } : {}),
        messages: [{ role: "user", content: prompt }],
      });
      const block = response.content[0];
      result = {
        content: block.type === "text" ? block.text : "",
        provider: ctx.provider,
        model: ctx.model,
        inputTokens: response.usage?.input_tokens,
        outputTokens: response.usage?.output_tokens,
      };
    } else {
      // openai / openrouter compatible
      const baseURL = ctx.provider === "openrouter" ? "https://openrouter.ai/api/v1" : undefined;
      const client = new OpenAI({
        apiKey: ctx.apiKey,
        ...(baseURL ? { baseURL } : {}),
        timeout: AI_TIMEOUT_MS,
      });
      const response = await client.chat.completions.create({
        model: ctx.model,
        messages: [{ role: "user", content: prompt }],
        ...(jsonMode ? { response_format: { type: "json_object" as const } } : {}),
      });
      result = {
        content: response.choices[0]?.message?.content || "",
        provider: ctx.provider,
        model: ctx.model,
        inputTokens: response.usage?.prompt_tokens,
        outputTokens: response.usage?.completion_tokens,
      };
    }

    // Track usage for BYOK tenants — estimate cost at ~$0.001 per 1k tokens (conservative)
    if (ctx.tenantId) {
      const totalTokens = (result.inputTokens ?? 0) + (result.outputTokens ?? 0);
      const estimatedCostUSD = (totalTokens / 1000) * 0.001;
      if (estimatedCostUSD > 0) {
        try {
          const { db, tenantAiConfigTable } = await import("@workspace/db");
          const { eq, sql } = await import("drizzle-orm");
          await db
            .update(tenantAiConfigTable)
            .set({ usageThisMonth: sql`usage_this_month + ${estimatedCostUSD}` })
            .where(eq(tenantAiConfigTable.tenantId, ctx.tenantId));
        } catch {
          // swallow — usage tracking failure must not block the response
        }
      }
    }

    return result;
  }

  // No BYOK key — use standard chatCompletion with env keys
  return chatCompletion({ prompt, provider: ctx.provider, model: ctx.model, jsonMode });
}
