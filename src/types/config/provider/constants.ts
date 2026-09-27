/**
 * A provider type names a service with its own request shape or its own
 * official endpoint. Every other service speaks one of these wire formats at
 * a base URL the agent supplies, and is configured as "openai-compatible".
 */
export const PROVIDER_TYPES = ["openai", "anthropic", "gemini", "deepseek", "openai-compatible"] as const
export type ProviderType = typeof PROVIDER_TYPES[number]
export function isProviderType(provider: string): provider is ProviderType {
  return (PROVIDER_TYPES as readonly string[]).includes(provider)
}

/** The wire formats Plainly speaks. Each is one HTTP request and one JSON response. */
export const REQUEST_APIS = ["openai-chat", "openai-responses", "anthropic", "gemini"] as const
export type RequestApi = typeof REQUEST_APIS[number]

/** The wire format a provider type uses unless the config names another one. */
export const DEFAULT_REQUEST_API: Record<ProviderType, RequestApi> = {
  "openai": "openai-responses",
  "anthropic": "anthropic",
  "gemini": "gemini",
  "deepseek": "openai-chat",
  "openai-compatible": "openai-chat",
}

/** Official endpoints. "openai-compatible" has none: its base URL is always part of the config. */
export const DEFAULT_BASE_URLS: Record<Exclude<ProviderType, "openai-compatible">, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta",
  deepseek: "https://api.deepseek.com",
}
