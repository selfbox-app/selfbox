/**
 * Central model registry for all LLM-powered features.
 *
 * Any extension or feature that needs an LLM model picker should import from
 * here rather than defining its own list. The gateway in `./gateway.ts`
 * handles routing each model ID to the correct provider.
 */

export interface AIModel {
  /** Model ID in "provider/model" format, used by the gateway. */
  id: string;
  /** Human-readable name shown in UI selectors. */
  label: string;
  /** Provider display name (e.g. "OpenAI", "Anthropic"). */
  provider: string;
}

export const AVAILABLE_MODELS: readonly AIModel[] = [
  { id: "openai/gpt-4o", label: "GPT-4o", provider: "OpenAI" },
  { id: "openai/gpt-4o-mini", label: "GPT-4o Mini", provider: "OpenAI" },
  { id: "anthropic/claude-sonnet-4-20250514", label: "Claude Sonnet 4", provider: "Anthropic" },
  { id: "anthropic/claude-haiku-3-5-20241022", label: "Claude 3.5 Haiku", provider: "Anthropic" },
  { id: "google/gemini-2.0-flash", label: "Gemini 2.0 Flash", provider: "Google" },
  { id: "minimax/MiniMax-Text-01", label: "MiniMax-Text-01", provider: "MiniMax" },
  { id: "glm/glm-4-plus", label: "GLM-4 Plus", provider: "Zhipu" },
  { id: "kimi/moonshot-v1-auto", label: "Moonshot v1", provider: "Kimi" },
] as const;

export const DEFAULT_MODEL = "openai/gpt-4o";
