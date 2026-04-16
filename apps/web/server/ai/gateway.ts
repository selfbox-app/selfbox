import { createGateway } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

// Re-export from the central model registry for convenience
export { DEFAULT_MODEL, AVAILABLE_MODELS } from "./models";
export type { AIModel } from "./models";

/**
 * Provider registry for direct API key connections.
 * Each entry maps a model prefix to a provider factory using @ai-sdk packages.
 * Chinese providers (minimax, glm, kimi) use OpenAI-compatible APIs.
 */
const DIRECT_PROVIDERS: Record<
  string,
  { envKey: string; factory: (apiKey: string) => (model: string) => any; }
> = {
  openai: {
    envKey: "OPENAI_API_KEY",
    factory: (apiKey) => {
      const provider = createOpenAI({ apiKey });
      return (model) => provider(model);
    },
  },
  anthropic: {
    envKey: "ANTHROPIC_API_KEY",
    factory: (apiKey) => {
      const provider = createAnthropic({ apiKey });
      return (model) => provider(model);
    },
  },
  google: {
    envKey: "GOOGLE_GENERATIVE_AI_API_KEY",
    factory: (apiKey) => {
      const provider = createGoogleGenerativeAI({ apiKey });
      return (model) => provider(model);
    },
  },
  minimax: {
    envKey: "MINIMAX_API_KEY",
    factory: (apiKey) => {
      const provider = createOpenAI({
        apiKey,
        baseURL: "https://api.minimax.chat/v1",
      });
      return (model) => provider(model);
    },
  },
  glm: {
    envKey: "GLM_API_KEY",
    factory: (apiKey) => {
      const provider = createOpenAI({
        apiKey,
        baseURL: "https://open.bigmodel.cn/api/paas/v4",
      });
      return (model) => provider(model);
    },
  },
  kimi: {
    envKey: "KIMI_API_KEY",
    factory: (apiKey) => {
      const provider = createOpenAI({
        apiKey,
        baseURL: "https://api.moonshot.cn/v1",
      });
      return (model) => provider(model);
    },
  },
};

/**
 * Resolves a model from a "provider/model" string.
 *
 * Priority:
 * 1. Vercel AI Gateway (AI_GATEWAY_API_KEY) — routes all providers
 * 2. OpenRouter (OPENROUTER_API_KEY) — routes all providers
 * 3. Direct provider API keys (OPENAI_API_KEY, ANTHROPIC_API_KEY, etc.)
 */
function createProvider() {
  // Option 1: Vercel AI Gateway — handles all providers
  if (process.env.AI_GATEWAY_API_KEY) {
    return createGateway({ apiKey: process.env.AI_GATEWAY_API_KEY });
  }

  // Option 2: OpenRouter — handles all providers
  if (process.env.OPENROUTER_API_KEY) {
    const openrouter = createOpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
    });
    return (modelId: string) => openrouter(modelId);
  }

  // Option 3: Direct provider API keys — route by prefix
  return (modelId: string) => {
    const slashIndex = modelId.indexOf("/");
    if (slashIndex === -1) {
      throw new Error(
        `Invalid model ID "${modelId}". Expected format: "provider/model" (e.g. "openai/gpt-4o").`,
      );
    }

    const prefix = modelId.slice(0, slashIndex);
    const model = modelId.slice(slashIndex + 1);

    const config = DIRECT_PROVIDERS[prefix];
    if (!config) {
      throw new Error(
        `Unknown provider "${prefix}". Supported: ${Object.keys(DIRECT_PROVIDERS).join(", ")}.`,
      );
    }

    const apiKey = process.env[config.envKey];
    if (!apiKey) {
      throw new Error(
        `${config.envKey} is not configured. Set it to use ${prefix} models directly.`,
      );
    }

    return config.factory(apiKey)(model);
  };
}

export const gateway = createProvider();
