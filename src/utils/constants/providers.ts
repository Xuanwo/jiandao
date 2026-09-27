import type { ProviderConfig, ProviderType } from "@/types/config/provider"

export interface ProviderItem {
  name: string
  /** One or two characters drawn in the provider mark; no remote logo is fetched. */
  monogram: string
  website: string
}

export const PROVIDER_ITEMS: Record<ProviderType, ProviderItem> = {
  "openai": {
    name: "OpenAI",
    monogram: "O",
    website: "https://platform.openai.com",
  },
  "anthropic": {
    name: "Anthropic",
    monogram: "A",
    website: "https://platform.claude.com",
  },
  "gemini": {
    name: "Gemini",
    monogram: "G",
    website: "https://aistudio.google.com",
  },
  "deepseek": {
    name: "DeepSeek",
    monogram: "D",
    website: "https://platform.deepseek.com",
  },
  "openai-compatible": {
    name: "Custom Provider",
    monogram: "AI",
    website: "",
  },
}

/**
 * A fresh install has one service without a key, so the popup shows the
 * setup card. The agent's document replaces it or adds to it.
 */
export const DEFAULT_PROVIDER_CONFIG: ProviderConfig = {
  id: "openai-default",
  name: PROVIDER_ITEMS.openai.name,
  enabled: true,
  provider: "openai",
  model: "gpt-6-luna",
}

export const DEFAULT_PROVIDER_CONFIG_LIST: ProviderConfig[] = [DEFAULT_PROVIDER_CONFIG]
