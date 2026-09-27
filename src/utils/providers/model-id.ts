import type { LLMProviderConfig } from "@/types/config/provider"

/** Returns the model ID to send, or undefined when the provider has no model yet. */
export function resolveModelId(model: LLMProviderConfig["model"]) {
  return model.trim() || undefined
}
