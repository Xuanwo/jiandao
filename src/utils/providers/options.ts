import type { JSONValue } from "ai"
import type { LLMProviderConfig } from "@/types/config/provider"
import { CUSTOM_LLM_PROVIDER_TYPES } from "@/types/config/provider"

const OPENAI_COMPATIBLE_PROVIDER_TYPES = new Set<string>(CUSTOM_LLM_PROVIDER_TYPES)

const OPENAI_COMPATIBLE_OPTION_ALIASES = {
  reasoning_effort: "reasoningEffort",
  verbosity: "textVerbosity",
} as const satisfies Record<string, string>

function normalizeUserProviderOptions(
  provider: string,
  userOptions: Record<string, JSONValue>,
): Record<string, JSONValue> {
  if (!OPENAI_COMPATIBLE_PROVIDER_TYPES.has(provider)) {
    return userOptions
  }

  let changed = false
  const normalizedOptions: Record<string, JSONValue> = { ...userOptions }

  for (const [rawKey, canonicalKey] of Object.entries(OPENAI_COMPATIBLE_OPTION_ALIASES)) {
    if (!(rawKey in normalizedOptions)) {
      continue
    }

    if (!(canonicalKey in normalizedOptions)) {
      normalizedOptions[canonicalKey] = normalizedOptions[rawKey]
    }

    delete normalizedOptions[rawKey]
    changed = true
  }

  return changed ? normalizedOptions : userOptions
}

/**
 * Get provider options for AI SDK calls. Only the saved provider options are
 * sent. A provider without saved options sends none.
 */
export function getProviderOptions(
  { provider, providerOptions }: Pick<LLMProviderConfig, "provider" | "providerOptions">,
): Record<string, Record<string, JSONValue>> | undefined {
  return providerOptions && { [provider]: normalizeUserProviderOptions(provider, providerOptions) }
}
