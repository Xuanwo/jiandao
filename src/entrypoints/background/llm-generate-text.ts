import type {
  BackgroundGenerateTextPayload,
  BackgroundGenerateTextResponse,
} from "@/types/background-generate-text"
import { getLocalConfig } from "@/utils/config/storage"
import { logger } from "@/utils/logger"
import { onMessage } from "@/utils/message"
import { requestText } from "@/utils/providers/request"

/**
 * Content scripts cannot reach every service directly (a page's CSP applies to
 * them), so short requests such as language detection run here with the
 * stored service config.
 */
export async function runGenerateTextInBackground(
  payload: BackgroundGenerateTextPayload,
): Promise<BackgroundGenerateTextResponse> {
  const { providerId, ...request } = payload
  const config = await getLocalConfig()
  const provider = config?.providersConfig.find(candidate => candidate.id === providerId)
  if (!provider) {
    throw new Error(`Provider ${providerId} not found`)
  }

  const text = await requestText(provider, request)
  return { text }
}

export function setupLLMGenerateTextMessageHandlers() {
  onMessage("backgroundGenerateText", async (message) => {
    try {
      return await runGenerateTextInBackground(message.data)
    }
    catch (error) {
      logger.error("[Background] backgroundGenerateText failed", error)
      throw error
    }
  })
}
