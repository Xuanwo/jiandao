import type { DeepSeekLanguageModelOptions } from "@ai-sdk/deepseek"
import type { OpenAIResponsesProviderOptions } from "@ai-sdk/openai"
import type { OpenAICompatibleProviderOptions } from "@ai-sdk/openai-compatible"
import type { AllProviderTypes, APIProviderTypes, LLMProviderConfig, LLMProviderTypes, ProviderConfig, ProvidersConfig } from "@/types/config/provider"
import { API_PROVIDER_TYPES, TRANSLATE_PROVIDER_TYPES } from "@/types/config/provider"
import { pick } from "@/types/utils"

export const DEFAULT_LLM_PROVIDER_MODELS = {
  "openai-compatible": "",
  "openai": "gpt-6-luna",
  "deepseek": "deepseek-flash",
} as const satisfies Record<LLMProviderTypes, LLMProviderConfig["model"]>

/**
 * The base URL of each provider type when the provider has none. These are
 * the defaults of the AI SDK providers. A custom provider has no default.
 */
export const DEFAULT_LLM_PROVIDER_BASE_URLS = {
  "openai-compatible": "",
  "openai": "https://api.openai.com/v1",
  "deepseek": "https://api.deepseek.com",
} as const satisfies Record<LLMProviderTypes, string>

/**
 * The provider options that turn off thinking, because translation needs fast
 * answers. A new provider starts with the options of its type. They show in
 * the provider options field, where the user can change or remove them.
 */
export const THINKING_OFF_PROVIDER_OPTIONS = {
  "openai": { reasoningEffort: "none" },
  "deepseek": { thinking: { type: "disabled" } },
  "openai-compatible": { reasoningEffort: "none" },
} as const satisfies {
  "openai": OpenAIResponsesProviderOptions
  "deepseek": DeepSeekLanguageModelOptions
  "openai-compatible": OpenAICompatibleProviderOptions
}

export interface ProviderItem {
  name: string
  /** One or two characters drawn in the provider mark; no remote logo is fetched. */
  monogram: string
  website: string
}

export const PROVIDER_ITEMS: Record<AllProviderTypes, ProviderItem> = {
  "openai-compatible": {
    name: "Custom Provider",
    monogram: "AI",
    website: "",
  },
  "openai": {
    name: "OpenAI",
    monogram: "O",
    website: "https://platform.openai.com",
  },
  "deepseek": {
    name: "DeepSeek",
    monogram: "D",
    website: "https://platform.deepseek.com",
  },
}

export const DEFAULT_PROVIDER_CONFIG = {
  "openai-compatible": {
    id: "openai-compatible-default",
    name: PROVIDER_ITEMS["openai-compatible"].name,
    enabled: true,
    provider: "openai-compatible",
    baseURL: "https://api.example.com/v1",
    model: DEFAULT_LLM_PROVIDER_MODELS["openai-compatible"],
    providerOptions: THINKING_OFF_PROVIDER_OPTIONS["openai-compatible"],
  },
  "openai": {
    id: "openai-default",
    name: PROVIDER_ITEMS.openai.name,
    enabled: true,
    provider: "openai",
    model: DEFAULT_LLM_PROVIDER_MODELS.openai,
    providerOptions: THINKING_OFF_PROVIDER_OPTIONS.openai,
  },
  "deepseek": {
    id: "deepseek-default",
    name: PROVIDER_ITEMS.deepseek.name,
    enabled: true,
    provider: "deepseek",
    model: DEFAULT_LLM_PROVIDER_MODELS.deepseek,
    providerOptions: THINKING_OFF_PROVIDER_OPTIONS.deepseek,
  },
} as const satisfies Record<AllProviderTypes, ProviderConfig>

export const DEFAULT_PROVIDER_CONFIG_LIST: ProvidersConfig = [
  DEFAULT_PROVIDER_CONFIG.openai,
  DEFAULT_PROVIDER_CONFIG.deepseek,
  DEFAULT_PROVIDER_CONFIG["openai-compatible"],
]

export const TRANSLATE_PROVIDER_ITEMS = pick(
  PROVIDER_ITEMS,
  TRANSLATE_PROVIDER_TYPES,
)

export const API_PROVIDER_ITEMS = pick(
  PROVIDER_ITEMS,
  API_PROVIDER_TYPES,
)

/** Order providers are offered in the "add a service" menu. */
export const ADDABLE_PROVIDER_TYPES: readonly APIProviderTypes[] = ["openai", "deepseek", "openai-compatible"]
