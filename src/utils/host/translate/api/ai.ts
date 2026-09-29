import type { ProviderConfig } from "@/types/config/provider"
import type { TranslatePromptOptions, TranslatePromptResult } from "@/utils/prompts/translate"
import { requestText } from "@/utils/providers/request"

const THINK_TAG_RE = /<\/think>([\s\S]*)/

export type PromptResolver<TContext = unknown> = (
  targetLang: string,
  input: string,
  options?: TranslatePromptOptions<TContext>,
) => Promise<TranslatePromptResult>

export async function aiTranslate<TContext>(
  text: string,
  targetLangName: string,
  providerConfig: ProviderConfig,
  promptResolver: PromptResolver<TContext>,
  options?: { isBatch?: boolean, context?: TContext, signal?: AbortSignal },
) {
  const { systemPrompt, prompt } = await promptResolver(targetLangName, text, options)

  const translatedText = await requestText(providerConfig, {
    system: systemPrompt,
    prompt,
    temperature: providerConfig.temperature,
  }, { signal: options?.signal })

  // Some local models return their reasoning inline; only the text after it is the translation.
  const [, finalTranslation = translatedText] = translatedText.match(THINK_TAG_RE) || []
  return finalTranslation
}
