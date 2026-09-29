import type { PromptResolver } from "./api/ai"
import type { Config } from "@/types/config/config"
import type { ProviderConfig } from "@/types/config/provider"
import { LANG_CODE_TO_EN_NAME } from "@/definitions"
import { aiTranslate } from "./api/ai"
import { prepareTranslationText } from "./text-preparation"

export async function executeTranslate<TContext>(
  text: string,
  langConfig: Config["language"],
  providerConfig: ProviderConfig,
  promptResolver: PromptResolver<TContext>,
  options?: {
    forceBackgroundFetch?: boolean
    isBatch?: boolean
    context?: TContext
    signal?: AbortSignal
  },
) {
  const preparedText = prepareTranslationText(text)
  if (preparedText === "") {
    return ""
  }

  const targetLangName = LANG_CODE_TO_EN_NAME[langConfig.targetCode]
  const translatedText = await aiTranslate(preparedText, targetLangName, providerConfig, promptResolver, options)

  return translatedText.trim()
}
