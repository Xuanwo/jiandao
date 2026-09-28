import type { Config } from "@/types/config/config"
import type { ConnectionCheck, ProviderConfig } from "@/types/config/provider"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { executeTranslate } from "@/utils/host/translate/execute-translate"
import { getTranslatePrompt } from "@/utils/prompts/translate"

/**
 * Sends one short translation through the given service with its stored
 * settings. The error text is kept verbatim, because the reader may paste it
 * back to the agent that produced the configuration.
 */
export async function checkConnection(providerConfig: ProviderConfig, now: () => number = Date.now): Promise<ConnectionCheck> {
  try {
    await executeTranslate("Hi", DEFAULT_CONFIG.language, providerConfig, getTranslatePrompt)
    return { ok: true, checkedAt: now() }
  }
  catch (error) {
    return { ok: false, checkedAt: now(), error: error instanceof Error ? error.message : String(error) }
  }
}

/** The config with `check` stored on the given service, so the settings page can show it later without a request. */
export function withConnectionCheck(config: Config, providerId: string, check: ConnectionCheck): Config {
  return {
    ...config,
    providersConfig: config.providersConfig.map(provider => provider.id === providerId ? { ...provider, connectionCheck: check } : provider),
  }
}
