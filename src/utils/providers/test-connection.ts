import type { ProviderConfig } from "@/types/config/provider"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { executeTranslate } from "@/utils/host/translate/execute-translate"
import { getTranslatePrompt } from "@/utils/prompts/translate"

export type ConnectionTestResult
  = | { ok: true }
    | { ok: false, error: string }

/**
 * Sends one short translation through the given service with its stored
 * settings. The error text is returned verbatim, because the reader may
 * paste it back to the agent that produced the configuration.
 */
export async function testProviderConnection(providerConfig: ProviderConfig): Promise<ConnectionTestResult> {
  try {
    await executeTranslate("Hi", DEFAULT_CONFIG.language, providerConfig, getTranslatePrompt)
    return { ok: true }
  }
  catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
