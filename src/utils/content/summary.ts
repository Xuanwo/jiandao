import type { LLMProviderConfig } from "@/types/config/provider"
import { generateText } from "ai"
import { logger } from "@/utils/logger"
import { getModelById } from "@/utils/providers/model"
import { getProviderOptions } from "@/utils/providers/options"
import { cleanText } from "./utils"

/**
 * Generate a brief summary of article content for translation context. Throws
 * when the request fails.
 */
export async function generateArticleSummary(
  title: string,
  textContent: string,
  providerConfig: LLMProviderConfig,
): Promise<string | null> {
  const preparedText = cleanText(textContent)

  if (!preparedText) {
    return null
  }

  const { temperature } = providerConfig
  const providerOptions = getProviderOptions(providerConfig)
  const model = await getModelById(providerConfig.id)

  const prompt = `Summarize the following article in 2-3 sentences. Focus on the main topic and key points. Return ONLY the summary, no explanations or formatting.

Title: ${title}

Content:
${preparedText}`

  const { text: summary } = await generateText({
    model,
    prompt,
    temperature,
    providerOptions,
  })

  const cleanedSummary = summary.trim()
  logger.info("Generated article summary:", `${cleanedSummary.slice(0, 100)}...`)

  return cleanedSummary
}
