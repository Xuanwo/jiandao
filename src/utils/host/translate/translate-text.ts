import type { LangCodeISO6393, LangLevel } from "@/definitions"
import type { Config } from "@/types/config/config"
import type { ProviderConfig } from "@/types/config/provider"
import type { WebPagePromptContext } from "@/types/content"
import { toast } from "sonner"
import { i18n } from "#imports"
import { LANG_CODE_TO_EN_NAME } from "@/definitions"
import { getProviderConfigById } from "@/utils/config/helpers"

import { logger } from "@/utils/logger"
import { getTranslatePrompt } from "@/utils/prompts/translate"
import { Sha256Hex } from "../../hash"
import { sendMessage } from "../../message"
import { prepareTranslationText } from "./text-preparation"

export function normalizePromptContextValue(value: string | null | undefined): string | null | undefined {
  if (value == null) {
    return value
  }
  return value.trim() === "" ? null : value
}

function normalizeWebPagePromptContext(webPageContext?: WebPagePromptContext): WebPagePromptContext | undefined {
  if (!webPageContext) {
    return undefined
  }

  return {
    webTitle: normalizePromptContextValue(webPageContext.webTitle),
    webDescription: normalizePromptContextValue(webPageContext.webDescription),
    webContent: normalizePromptContextValue(webPageContext.webContent),
    webSummary: normalizePromptContextValue(webPageContext.webSummary),
  }
}

async function buildWebPageHashComponents(
  text: string,
  providerConfig: ProviderConfig,
  partialLangConfig: { sourceCode: LangCodeISO6393 | "auto", targetCode: LangCodeISO6393 },
  enableAIContentAware: boolean,
  webPageContext?: WebPagePromptContext,
): Promise<string[]> {
  const preparedText = prepareTranslationText(text)
  const normalizedWebPageContext = normalizeWebPagePromptContext(webPageContext)
  const hashComponents = [
    preparedText,
    JSON.stringify(providerConfig),
    partialLangConfig.sourceCode,
    partialLangConfig.targetCode,
  ]

  const targetLangName = LANG_CODE_TO_EN_NAME[partialLangConfig.targetCode]
  const { systemPrompt, prompt } = await getTranslatePrompt(targetLangName, preparedText, {
    isBatch: true,
    context: normalizedWebPageContext,
  })
  hashComponents.push(systemPrompt, prompt)
  hashComponents.push(enableAIContentAware ? "enableAIContentAware=true" : "enableAIContentAware=false")

  if (enableAIContentAware && normalizedWebPageContext) {
    if (normalizedWebPageContext.webTitle) {
      hashComponents.push(`webTitle:${normalizedWebPageContext.webTitle}`)
    }
    if (normalizedWebPageContext.webDescription) {
      hashComponents.push(`webDescription:${normalizedWebPageContext.webDescription}`)
    }
    if (normalizedWebPageContext.webContent) {
      // Use a substring hash to avoid huge hash inputs while still differentiating contexts.
      hashComponents.push(`webContent:${normalizedWebPageContext.webContent.slice(0, 1000)}`)
    }
    if (normalizedWebPageContext.webSummary) {
      hashComponents.push(`webSummary:${normalizedWebPageContext.webSummary}`)
    }
  }

  return hashComponents
}

export interface TranslateTextOptions {
  text: string
  langConfig: { sourceCode: LangCodeISO6393 | "auto", targetCode: LangCodeISO6393, level: LangLevel }
  providerConfig: ProviderConfig
  enableAIContentAware?: boolean
  extraHashTags?: string[]
  webPageContext?: WebPagePromptContext
}

/**
 * Core translation function — pure, zero config fetching.
 * All dependencies must be provided explicitly.
 */
export async function translateTextCore(options: TranslateTextOptions): Promise<string> {
  const {
    text,
    langConfig,
    providerConfig,
    enableAIContentAware = false,
    extraHashTags = [],
    webPageContext,
  } = options

  const preparedText = prepareTranslationText(text)
  if (preparedText === "") {
    return ""
  }

  const normalizedWebPageContext = normalizeWebPagePromptContext(webPageContext)

  const hashComponents = await buildWebPageHashComponents(
    preparedText,
    providerConfig,
    { sourceCode: langConfig.sourceCode, targetCode: langConfig.targetCode },
    enableAIContentAware,
    normalizedWebPageContext,
  )

  // Add extra hash tags for cache differentiation
  hashComponents.push(...extraHashTags)

  return await sendMessage("enqueueTranslateRequest", {
    text: preparedText,
    langConfig,
    providerConfig,
    scheduleAt: Date.now(),
    hash: Sha256Hex(...hashComponents),
    webTitle: normalizedWebPageContext?.webTitle,
    webDescription: normalizedWebPageContext?.webDescription,
    webContent: normalizedWebPageContext?.webContent,
    webSummary: normalizedWebPageContext?.webSummary,
  })
}

export function validateTranslationConfigAndToast(
  config: Pick<Config, "providersConfig" | "translate" | "language">,
): boolean {
  const { providersConfig, translate: translateConfig, language: languageConfig } = config
  const providerConfig = getProviderConfigById(providersConfig, translateConfig.providerId)
  if (!providerConfig) {
    return false
  }

  if (languageConfig.sourceCode === languageConfig.targetCode) {
    toast.error(i18n.t("translation.sameLanguage"))
    logger.info("validateTranslationConfig: returning false (same language)")
    return false
  }

  // check if the API key is configured
  if (!providerConfig.apiKey?.trim()) {
    toast.error(i18n.t("translation.noApiKey"))
    logger.info("validateTranslationConfig: returning false (no API key)")
    return false
  }

  return true
}
