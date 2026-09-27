/* ──────────────────────────────
  Derived provider names
  ────────────────────────────── */

// translate provider names
export const TRANSLATE_PROVIDER_TYPES = ["openai", "deepseek", "openai-compatible"] as const
export type TranslateProviderTypes = typeof TRANSLATE_PROVIDER_TYPES[number]
export function isTranslateProvider(provider: string): provider is TranslateProviderTypes {
  return TRANSLATE_PROVIDER_TYPES.includes(provider)
}

export const LLM_PROVIDER_TYPES = ["openai", "deepseek", "openai-compatible"] as const satisfies Readonly<
  TranslateProviderTypes[]
>
export type LLMProviderTypes = typeof LLM_PROVIDER_TYPES[number]
export function isLLMProvider(provider: string): provider is LLMProviderTypes {
  return LLM_PROVIDER_TYPES.includes(provider)
}

export const CUSTOM_LLM_PROVIDER_TYPES = ["openai-compatible"] as const satisfies Readonly<
  LLMProviderTypes[]
>
export type CustomLLMProviderTypes = typeof CUSTOM_LLM_PROVIDER_TYPES[number]
export function isCustomLLMProvider(provider: string): provider is CustomLLMProviderTypes {
  return CUSTOM_LLM_PROVIDER_TYPES.includes(provider)
}

export const NON_CUSTOM_LLM_PROVIDER_TYPES = ["openai", "deepseek"] as const satisfies Readonly<
  Exclude<LLMProviderTypes, CustomLLMProviderTypes>[]
>
export type NonCustomLLMProviderTypes = typeof NON_CUSTOM_LLM_PROVIDER_TYPES[number]
export function isNonCustomLLMProvider(provider: string): provider is NonCustomLLMProviderTypes {
  return NON_CUSTOM_LLM_PROVIDER_TYPES.includes(provider)
}

export const API_PROVIDER_TYPES = ["openai-compatible", "openai", "deepseek"] as const satisfies Readonly<
  LLMProviderTypes[]
>
export type APIProviderTypes = typeof API_PROVIDER_TYPES[number]
export function isAPIProvider(provider: string): provider is APIProviderTypes {
  return API_PROVIDER_TYPES.includes(provider)
}

// all provider names
export const ALL_PROVIDER_TYPES = ["openai-compatible", "openai", "deepseek"] as const satisfies Readonly<
  TranslateProviderTypes[]
>
export type AllProviderTypes = typeof ALL_PROVIDER_TYPES[number]
