import type { LangCodeISO6393 } from "@/definitions"
import type { BackgroundGenerateTextPayload } from "@/types/background-generate-text"
import type { Config } from "@/types/config/config"
import type { ProviderConfig } from "@/types/config/provider"
import { franc } from "franc"
import { langCodeISO6393Schema } from "@/definitions"
import { getLocalConfig } from "@/utils/config/storage"
import { logger } from "@/utils/logger"
import { sendMessage } from "@/utils/message"
import { getLanguageDetectionSystemPrompt, parseDetectedLanguageCode } from "@/utils/prompts/language-detection"
import { cleanText } from "./utils"

const DEFAULT_MIN_LENGTH = 10
const DEFAULT_MAX_LENGTH_FOR_LLM = 500

export type DetectionSource = "llm" | "franc" | "fallback"

export interface DetectLanguageOptions {
  /** Minimum text length to attempt detection (default: 10) */
  minLength?: number
  /** Explicitly opt into LLM detection with this provider; otherwise detect locally. */
  providerConfig?: ProviderConfig
  /** Max text length for LLM detection (default: 500) */
  maxLengthForLLM?: number
}

export interface DetectLanguageResult {
  code: LangCodeISO6393 | "und"
  source: DetectionSource
}

/**
 * Detect language locally unless the caller explicitly supplies an LLM provider.
 * Returns both the detected code and the detection source.
 * @param text - Text to detect language for
 * @param options - Detection options
 * @returns Detection result with code and source
 */
export async function detectLanguageWithSource(
  text: string,
  options?: DetectLanguageOptions,
): Promise<DetectLanguageResult> {
  const trimmedText = text.trim()
  const minLength = options?.minLength ?? DEFAULT_MIN_LENGTH

  if (trimmedText.length < minLength) {
    return { code: "und", source: "fallback" }
  }

  // Page startup, navigation and tab activation must not send text to a provider.
  if (!options?.providerConfig) {
    const result = langCodeISO6393Schema.safeParse(franc(trimmedText))
    return result.success
      ? { code: result.data, source: "franc" }
      : { code: "und", source: "fallback" }
  }

  const maxLength = options?.maxLengthForLLM ?? DEFAULT_MAX_LENGTH_FOR_LLM
  const textForLLM = cleanText(trimmedText, maxLength)
  const llmResult = await detectLanguageWithLLM(
    textForLLM,
    options?.providerConfig,
  )
  if (llmResult && llmResult !== "und") {
    return { code: llmResult, source: "llm" }
  }

  return { code: "und", source: "fallback" }
}

/**
 * Detect language locally unless the caller explicitly supplies an LLM provider.
 * @param text - Text to detect language for
 * @param options - Detection options
 * @returns Detected language code or null if detection failed
 */
export async function detectLanguage(
  text: string,
  options?: DetectLanguageOptions,
): Promise<LangCodeISO6393 | null> {
  const result = await detectLanguageWithSource(text, options)
  return result.code === "und" ? null : result.code
}

function selectLanguageDetectionProvider(config: Config): ProviderConfig | undefined {
  const translateProvider = config.providersConfig.find(provider => provider.id === config.translate.providerId)
  if (translateProvider?.enabled) {
    return translateProvider
  }

  return config.providersConfig.find(provider => provider.enabled)
}

/**
 * Detect language using LLM with retry logic
 * @param text - Text to analyze (caller is responsible for combining title and content)
 * @param providerConfig - Optional provider config (if not provided, will get from global config)
 * @returns ISO 639-3 language code or null if all attempts fail (null = no LLM provider or all attempts failed)
 */
export async function detectLanguageWithLLM(
  text: string,
  providerConfig?: ProviderConfig,
): Promise<LangCodeISO6393 | "und" | null> {
  const MAX_ATTEMPTS = 3 // 1 original + 2 retries

  if (!text.trim()) {
    logger.warn("No text provided for language detection")
    return null
  }

  // Get provider config - use passed or fall back to global
  let config: ProviderConfig | undefined = providerConfig

  if (!config) {
    try {
      const globalConfig = await getLocalConfig()
      if (!globalConfig) {
        logger.warn("No config found for language detection")
        return null
      }
      const globalProvider = selectLanguageDetectionProvider(globalConfig)
      if (!globalProvider) {
        logger.info("No enabled LLM provider available for language detection")
        return null
      }
      config = globalProvider
    }
    catch (error) {
      logger.error("Failed to get global config for language detection:", error)
      return null
    }
  }

  try {
    const payload: BackgroundGenerateTextPayload = {
      providerId: config.id,
      system: getLanguageDetectionSystemPrompt(),
      prompt: text,
      temperature: config.temperature,
    }

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const response = await sendMessage("backgroundGenerateText", payload)
        const detectedCode = parseDetectedLanguageCode(response.text)

        if (detectedCode) {
          logger.info(`LLM language detection succeeded on attempt ${attempt}: ${detectedCode}`)
          return detectedCode
        }
        else {
          logger.warn(`LLM returned invalid language code on attempt ${attempt}: "${response.text}"`)
        }
      }
      catch (error) {
        logger.error(`LLM language detection attempt ${attempt}/${MAX_ATTEMPTS} failed:`, error)
      }

      if (attempt === MAX_ATTEMPTS) {
        logger.warn("All LLM language detection attempts failed")
        return null
      }
    }
  }
  catch (error) {
    logger.error("Failed to get model for language detection:", error)
    return null
  }

  return null
}
