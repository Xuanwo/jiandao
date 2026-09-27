import type {
  BackgroundGenerateTextPayload,
  BackgroundGenerateTextResponse,
} from "@/types/background-generate-text"
import { generateText } from "ai"
import { getLLMProvidersConfig, getProviderConfigById } from "@/utils/config/helpers"
import { getLocalConfig } from "@/utils/config/storage"
import { logger } from "@/utils/logger"
import { onMessage } from "@/utils/message"
import { getModelById } from "@/utils/providers/model"
import { getProviderOptions } from "@/utils/providers/options"
import { withThinkingFallback } from "./thinking-fallback"

/**
 * Runs generateText with the saved provider and its saved provider options,
 * with the thinking fallback. `tabId` is the tab that asked for the text.
 */
export async function runGenerateTextInBackground(
  payload: BackgroundGenerateTextPayload,
  tabId?: number,
): Promise<BackgroundGenerateTextResponse> {
  const { providerId, ...generateTextParams } = payload
  const config = await getLocalConfig()
  const providerConfig = config && getProviderConfigById(getLLMProvidersConfig(config.providersConfig), providerId)
  if (!providerConfig) {
    throw new Error(`Provider ${providerId} not found`)
  }
  const model = await getModelById(providerId)

  const { text } = await withThinkingFallback(providerConfig, provider => generateText({
    ...generateTextParams,
    providerOptions: getProviderOptions(provider),
    model,
  }), { tabIds: [tabId] })

  return { text }
}

export function setupLLMGenerateTextMessageHandlers() {
  onMessage("backgroundGenerateText", async (message) => {
    try {
      return await runGenerateTextInBackground(message.data, message.sender?.tab?.id)
    }
    catch (error) {
      logger.error("[Background] backgroundGenerateText failed", error)
      throw error
    }
  })
}
