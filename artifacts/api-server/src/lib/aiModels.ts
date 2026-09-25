// AI Model Registry — maps logical model names to provider-specific model IDs.

export type AIProvider = "openai" | "anthropic" | "openrouter";

export interface AIModelConfig {
  provider: AIProvider;
  modelId: string;
  displayName: string;
  supportsJsonMode: boolean;
}

const models: Record<string, AIModelConfig> = {
  // OpenAI models
  "gpt-4o": {
    provider: "openai",
    modelId: "gpt-4o",
    displayName: "GPT-4o",
    supportsJsonMode: true,
  },
  "gpt-4o-mini": {
    provider: "openai",
    modelId: "gpt-4o-mini",
    displayName: "GPT-4o Mini",
    supportsJsonMode: true,
  },
  "gpt-4-turbo": {
    provider: "openai",
    modelId: "gpt-4-turbo",
    displayName: "GPT-4 Turbo",
    supportsJsonMode: true,
  },
  "gpt-3.5-turbo": {
    provider: "openai",
    modelId: "gpt-3.5-turbo",
    displayName: "GPT-3.5 Turbo",
    supportsJsonMode: true,
  },

  // Anthropic models
  "claude-opus-4-5": {
    provider: "anthropic",
    modelId: "claude-opus-4-5-20250514",
    displayName: "Claude Opus 4.5",
    supportsJsonMode: false,
  },
  "claude-sonnet-4-5": {
    provider: "anthropic",
    modelId: "claude-sonnet-4-5-20250514",
    displayName: "Claude Sonnet 4.5",
    supportsJsonMode: false,
  },
  "claude-haiku-4-5": {
    provider: "anthropic",
    modelId: "claude-haiku-4-5-20251001",
    displayName: "Claude Haiku 4.5",
    supportsJsonMode: false,
  },
  "claude-opus-4": {
    provider: "anthropic",
    modelId: "claude-opus-4-20250514",
    displayName: "Claude Opus 4",
    supportsJsonMode: false,
  },
  "claude-sonnet-4": {
    provider: "anthropic",
    modelId: "claude-sonnet-4-20250514",
    displayName: "Claude Sonnet 4",
    supportsJsonMode: false,
  },

  // OpenRouter models
  "openai/gpt-4o": {
    provider: "openrouter",
    modelId: "openai/gpt-4o",
    displayName: "OpenRouter: GPT-4o",
    supportsJsonMode: true,
  },
  "openai/gpt-4o-mini": {
    provider: "openrouter",
    modelId: "openai/gpt-4o-mini",
    displayName: "OpenRouter: GPT-4o Mini",
    supportsJsonMode: true,
  },
  "anthropic/claude-opus-4": {
    provider: "openrouter",
    modelId: "anthropic/claude-opus-4",
    displayName: "OpenRouter: Claude Opus 4",
    supportsJsonMode: false,
  },
  "anthropic/claude-sonnet-4": {
    provider: "openrouter",
    modelId: "anthropic/claude-sonnet-4",
    displayName: "OpenRouter: Claude Sonnet 4",
    supportsJsonMode: false,
  },
  "anthropic/claude-haiku-4-5": {
    provider: "openrouter",
    modelId: "anthropic/claude-haiku-4-5",
    displayName: "OpenRouter: Claude Haiku 4.5",
    supportsJsonMode: false,
  },
  "google/gemini-pro-1.5": {
    provider: "openrouter",
    modelId: "google/gemini-pro-1.5",
    displayName: "OpenRouter: Gemini Pro 1.5",
    supportsJsonMode: true,
  },
  "google/gemini-flash-1.5": {
    provider: "openrouter",
    modelId: "google/gemini-flash-1.5",
    displayName: "OpenRouter: Gemini Flash 1.5",
    supportsJsonMode: true,
  },
  "meta-llama/llama-3.1-70b-instruct": {
    provider: "openrouter",
    modelId: "meta-llama/llama-3.1-70b-instruct",
    displayName: "OpenRouter: Llama 3.1 70B",
    supportsJsonMode: true,
  },
  "mistralai/mistral-large": {
    provider: "openrouter",
    modelId: "mistralai/mistral-large",
    displayName: "OpenRouter: Mistral Large",
    supportsJsonMode: true,
  },
  "cohere/command-r-plus": {
    provider: "openrouter",
    modelId: "cohere/command-r-plus",
    displayName: "OpenRouter: Command R+",
    supportsJsonMode: true,
  },
};

export function getModelConfig(modelName?: string): AIModelConfig {
  const name = modelName || getDefaultModel();
  const config = models[name];
  if (!config) {
    throw new Error(`Unknown AI model: ${name}. Available: ${Object.keys(models).join(", ")}`);
  }
  return config;
}

export function getDefaultModel(): string {
  return process.env.AI_DEFAULT_MODEL || "gpt-4o-mini";
}

export function getDefaultProvider(): AIProvider {
  return (process.env.AI_DEFAULT_PROVIDER as AIProvider) || "openai";
}

export function listModels(): AIModelConfig[] {
  return Object.values(models);
}
