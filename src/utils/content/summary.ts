import type { ProviderConfig } from "@/types/config/provider"
import { logger } from "@/utils/logger"
import { requestText } from "@/utils/providers/request"
import { cleanText } from "./utils"

/**
 * Generate a brief summary of article content for translation context
 */
export async function generateArticleSummary(
  title: string,
  textContent: string,
  providerConfig: ProviderConfig,
): Promise<string | null> {
  const preparedText = cleanText(textContent)

  if (!preparedText) {
    return null
  }

  try {
    const prompt = `Summarize the following article in 2-3 sentences. Focus on the main topic and key points. Return ONLY the summary, no explanations or formatting.

Title: ${title}

Content:
${preparedText}`

    const summary = await requestText(providerConfig, { prompt, temperature: providerConfig.temperature })

    const cleanedSummary = summary.trim()
    logger.info("Generated article summary:", `${cleanedSummary.slice(0, 100)}...`)

    return cleanedSummary
  }
  catch (error) {
    logger.error("Failed to generate article summary:", error)
    return null
  }
}
