import type { Config } from "@/types/config/config"
import type { ConnectionCheck, ProviderConfig } from "@/types/config/provider"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { executeTranslate } from "@/utils/host/translate/execute-translate"
import { getTranslatePrompt } from "@/utils/prompts/translate"

/**
 * How long a check waits for the service. Page translation gives a request
 * 20 seconds, so a service that needs longer for one word would not
 * translate a page either.
 */
export const CONNECTION_CHECK_TIMEOUT_MS = 30_000

/**
 * Sends one short translation through the given service with its stored
 * settings. The error text is kept verbatim, because the reader may paste it
 * back to the agent that produced the configuration. A service that does not
 * answer within `timeoutMs` fails the check.
 */
export async function checkConnection(
  providerConfig: ProviderConfig,
  { now = Date.now, timeoutMs = CONNECTION_CHECK_TIMEOUT_MS }: { now?: () => number, timeoutMs?: number } = {},
): Promise<ConnectionCheck> {
  const signal = AbortSignal.timeout(timeoutMs)
  try {
    await executeTranslate("Hi", DEFAULT_CONFIG.language, providerConfig, getTranslatePrompt, { signal })
    return { ok: true, checkedAt: now() }
  }
  catch (error) {
    const message = signal.aborted
      ? `No answer from the service within ${timeoutMs / 1000} seconds`
      : error instanceof Error ? error.message : String(error)
    return { ok: false, checkedAt: now(), error: message }
  }
}

/** The config with `check` stored on the given service, so the settings page can show it later without a request. */
export function withConnectionCheck(config: Config, providerId: string, check: ConnectionCheck): Config {
  return {
    ...config,
    providersConfig: config.providersConfig.map(provider => provider.id === providerId ? { ...provider, connectionCheck: check } : provider),
  }
}
