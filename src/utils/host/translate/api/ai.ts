import type { LLMProviderConfig } from "@/types/config/provider"
import type { TranslatePromptOptions, TranslatePromptResult } from "@/utils/prompts/translate"
import { generateText } from "ai"
import { extractAISDKErrorMessage } from "@/utils/error/extract-message"
import { getModelById } from "@/utils/providers/model"
import { getProviderOptions } from "@/utils/providers/options"
import { attachRequestErrorMeta, getRequestErrorMeta } from "@/utils/request/retry-policy"

const THINK_TAG_RE = /<\/think>([\s\S]*)/

export type PromptResolver<TContext = unknown> = (
  targetLang: string,
  input: string,
  options?: TranslatePromptOptions<TContext>,
) => Promise<TranslatePromptResult>

export async function aiTranslate<TContext>(
  text: string,
  targetLangName: string,
  providerConfig: LLMProviderConfig,
  promptResolver: PromptResolver<TContext>,
  options?: { isBatch?: boolean, context?: TContext },
) {
  const { id: providerId, temperature } = providerConfig
  const model = await getModelById(providerId)

  const providerOptions = getProviderOptions(providerConfig)
  const { systemPrompt, prompt } = await promptResolver(targetLangName, text, options)

  try {
    const { text: translatedText } = await generateText({
      model,
      system: systemPrompt,
      prompt,
      temperature,
      providerOptions,
      maxRetries: 0, // Disable SDK built-in retries, let RequestQueue/BatchQueue handle it
    })

    const [, finalTranslation = translatedText] = translatedText.match(THINK_TAG_RE) || []

    return finalTranslation
  }
  catch (error) {
    const message = extractAISDKErrorMessage(error)
    const meta = getRequestErrorMeta(error)
    if (error instanceof Error) {
      error.message = message
      throw attachRequestErrorMeta(error, meta)
    }

    throw attachRequestErrorMeta(new Error(message), meta)
  }
}
