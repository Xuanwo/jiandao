import type { Config } from "@/types/config/config"
import { createDeepSeek } from "@ai-sdk/deepseek"
import { createOpenAI } from "@ai-sdk/openai"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { storage } from "#imports"
import { isCustomLLMProvider } from "@/types/config/provider"
import { getLLMProvidersConfig, getProviderConfigById } from "../config/helpers"
import { CONFIG_STORAGE_KEY } from "../constants/config"
import { normalizeBaseURL } from "./base-url"
import { getProviderHeadersWithOverride } from "./headers"
import { resolveModelId } from "./model-id"

const CREATE_AI_MAPPER = {
  "openai-compatible": createOpenAICompatible,
  "openai": createOpenAI,
  "deepseek": createDeepSeek,
} as const

async function getLanguageModelById(providerId: string) {
  const config = await storage.getItem<Config>(`local:${CONFIG_STORAGE_KEY}`)
  if (!config) {
    throw new Error("Config not found")
  }

  const LLMProvidersConfig = getLLMProvidersConfig(config.providersConfig)
  const providerConfig = getProviderConfigById(LLMProvidersConfig, providerId)
  if (!providerConfig) {
    throw new Error(`Provider ${providerId} not found`)
  }

  const headers = getProviderHeadersWithOverride(providerConfig.provider, providerConfig.headers)
  const baseURL = normalizeBaseURL(providerConfig.baseURL)
  const provider = isCustomLLMProvider(providerConfig.provider)
    ? CREATE_AI_MAPPER[providerConfig.provider]({
        name: providerConfig.provider,
        baseURL,
        supportsStructuredOutputs: true,
        ...(providerConfig.apiKey && { apiKey: providerConfig.apiKey }),
        ...(headers && { headers }),
      })
    : CREATE_AI_MAPPER[providerConfig.provider]({
        ...(baseURL && { baseURL }),
        ...(providerConfig.apiKey && { apiKey: providerConfig.apiKey }),
        ...(headers && { headers }),
      })

  const modelId = resolveModelId(providerConfig.model)

  if (!modelId) {
    throw new Error("Model is undefined")
  }

  return provider.languageModel(modelId)
}

export async function getModelById(providerId: string) {
  return getLanguageModelById(providerId)
}
