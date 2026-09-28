import type { Config } from "@/types/config/config"
import type { WebPagePromptContext } from "@/types/content"
import { getLocalConfig } from "@/utils/config/storage"
import { DEFAULT_CONFIG } from "../constants/config"
import {
  DEFAULT_BATCH_TRANSLATE_PROMPT,
  getTokenCellText,
  INPUT,
  TARGET_LANGUAGE,
  WEB_CONTENT,
  WEB_DESCRIPTION,
  WEB_SUMMARY,
  WEB_TITLE,
} from "../constants/prompt"
import { renderBuiltinTranslatePrompt } from "./builtin-prompt"

export interface TranslatePromptOptions<TContext = unknown> {
  isBatch?: boolean
  context?: TContext
}

export interface TranslatePromptResult {
  /** Undefined when the prompt has no system prompt, so that the request has no system message. */
  systemPrompt?: string
  prompt: string
}

export function resolvePromptReplacementValue(value: string | null | undefined, fallback: string): string {
  return typeof value === "string" && value.trim() !== "" ? value : fallback
}

export function getTranslatePromptFromConfig(
  translateConfig: Pick<Config["translate"], "customPromptsConfig">,
  targetLang: string,
  input: string,
  options?: TranslatePromptOptions<WebPagePromptContext>,
): TranslatePromptResult {
  const customPromptsConfig = translateConfig.customPromptsConfig
  const { patterns = [], promptId } = customPromptsConfig

  const customPrompt = patterns.find(pattern => pattern.id === promptId)
  if (!customPrompt) {
    // The built-in prompt has no system prompt.
    return {
      prompt: renderBuiltinTranslatePrompt({
        targetLang,
        input,
        webTitle: options?.context?.webTitle,
        webSummary: options?.context?.webSummary,
        isBatch: options?.isBatch,
      }),
    }
  }

  // Custom prompts use the English language name and the English batch rules.
  const systemPrompt = [customPrompt.systemPrompt, options?.isBatch && DEFAULT_BATCH_TRANSLATE_PROMPT].filter(Boolean).join("\n\n")

  // Build title and summary replacement values
  const title = resolvePromptReplacementValue(options?.context?.webTitle, "No title available")
  const description = resolvePromptReplacementValue(options?.context?.webDescription, "No description available")
  const contentText = resolvePromptReplacementValue(options?.context?.webContent, "No content available")
  const summary = resolvePromptReplacementValue(options?.context?.webSummary, "No summary available")

  // Replace tokens in both prompts
  const replaceTokens = (text: string) =>
    text
      .replaceAll(getTokenCellText(TARGET_LANGUAGE), targetLang)
      .replaceAll(getTokenCellText(INPUT), input)
      .replaceAll(getTokenCellText(WEB_TITLE), title)
      .replaceAll(getTokenCellText(WEB_DESCRIPTION), description)
      .replaceAll(getTokenCellText(WEB_CONTENT), contentText)
      .replaceAll(getTokenCellText(WEB_SUMMARY), summary)

  return {
    // An empty system prompt gives no system message.
    ...(systemPrompt && { systemPrompt: replaceTokens(systemPrompt) }),
    prompt: replaceTokens(customPrompt.prompt),
  }
}

export async function getTranslatePrompt(
  targetLang: string,
  input: string,
  options?: TranslatePromptOptions<WebPagePromptContext>,
): Promise<TranslatePromptResult> {
  const config = await getLocalConfig() ?? DEFAULT_CONFIG
  return getTranslatePromptFromConfig(config.translate, targetLang, input, options)
}
