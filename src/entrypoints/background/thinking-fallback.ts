import type { JSONValue } from "ai"
import type { Config } from "@/types/config/config"
import type { LLMProviderConfig } from "@/types/config/provider"
import type { ThinkingFallback } from "@/utils/providers/thinking-fallback"
import { dequal } from "dequal"
import { configSchema } from "@/types/config/config"
import { storageAdapter } from "@/utils/atoms/storage-adapter"
import { getLLMProvidersConfig, getProviderConfigById } from "@/utils/config/helpers"
import { getLocalConfig } from "@/utils/config/storage"
import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG } from "@/utils/constants/config"
import { logger } from "@/utils/logger"
import { sendMessage } from "@/utils/message"
import { runWithThinkingFallback } from "@/utils/providers/thinking-fallback"

let saving = Promise.resolve(false)

/**
 * Saves the fallback options for the provider when its saved provider
 * options are still `failedOptions`. Returns true when it saved them. Saves
 * run one at a time, so that parallel requests save and report only once.
 */
function saveThinkingFallback(providerId: string, failedOptions: Record<string, JSONValue> | undefined, fallback: ThinkingFallback): Promise<boolean> {
  saving = saving.catch(() => false).then(async () => {
    const config = await storageAdapter.get<Config>(CONFIG_STORAGE_KEY, DEFAULT_CONFIG, configSchema)
    const saved = config.providersConfig.find(provider => provider.id === providerId)
    if (!saved || !dequal(saved.providerOptions, failedOptions))
      return false
    const providersConfig = config.providersConfig.map(provider => provider.id === providerId ? { ...provider, providerOptions: fallback.options } : provider)
    await storageAdapter.set<Config>(CONFIG_STORAGE_KEY, { ...config, providersConfig }, configSchema)
    await storageAdapter.setMeta(CONFIG_STORAGE_KEY, { lastModifiedAt: Date.now() })
    return true
  })
  return saving
}

/**
 * Runs `call` with the provider, with the thinking fallback of
 * runWithThinkingFallback. It uses the stored config of the provider, so a
 * request that waited in a queue uses the options that an earlier fallback
 * saved. When the provider is not stored, it uses `queuedConfig`. When the
 * fallback works, saves the provider options that worked and tells the tabs
 * that asked for the request why they changed. Only the first request that
 * saves them tells the tabs. A failed save does not fail the request, which
 * already has a result.
 */
export async function withThinkingFallback<T>(
  queuedConfig: LLMProviderConfig,
  call: (providerConfig: LLMProviderConfig) => Promise<T>,
  { tabIds }: { tabIds: (number | undefined)[] },
): Promise<T> {
  const config = await getLocalConfig()
  const providerConfig = (config && getProviderConfigById(getLLMProvidersConfig(config.providersConfig), queuedConfig.id)) ?? queuedConfig
  const { result, fallback } = await runWithThinkingFallback(providerConfig, call)
  if (!fallback)
    return result
  const saved = await saveThinkingFallback(providerConfig.id, providerConfig.providerOptions, fallback)
    .catch((error) => {
      logger.warn("Failed to save the thinking fallback options", error)
      return false
    })
  if (saved) {
    for (const tabId of new Set(tabIds)) {
      if (tabId !== undefined)
        void sendMessage("notifyThinkingFallback", { kind: fallback.kind, reason: fallback.reason }, tabId).catch(error => logger.warn("Failed to tell the tab about the thinking fallback", error))
    }
  }
  return result
}
