import type { Config } from "@/types/config/config"
import { resolveProviderConfig } from "@/utils/constants/feature-providers"
import { getLocalConfig } from "../../config/storage"
import { prepareTranslationText } from "./text-preparation"
import { translateTextCore } from "./translate-text"
import { getOrCreateWebPageContext } from "./webpage-context"
import { getOrGenerateWebPageSummary } from "./webpage-summary"

async function getConfigOrThrow(): Promise<Config> {
  const config = await getLocalConfig()
  if (!config) {
    throw new Error("No global config when translate text")
  }
  return config
}

async function getWebPagePromptContext(
  providerConfig: ReturnType<typeof resolveProviderConfig>,
  enableAIContentAware: boolean,
  includeSummary: boolean,
): Promise<{ webTitle: string, webDescription?: string, webContent: string, webSummary?: string } | undefined> {
  const webPageContext = await getOrCreateWebPageContext()
  if (!webPageContext) {
    return undefined
  }

  const webSummary = includeSummary
    ? await getOrGenerateWebPageSummary(webPageContext, providerConfig, enableAIContentAware)
    : undefined

  return {
    webTitle: webPageContext.webTitle,
    webDescription: webPageContext.webDescription,
    webContent: webPageContext.webContent,
    webSummary: webSummary ?? undefined,
  }
}

async function translateTextUsingPageConfig(
  config: Config,
  text: string,
  options: {
    extraHashTags?: string[]
    webPageContext?: { webTitle?: string | null, webDescription?: string | null, webContent?: string | null, webSummary?: string | null }
  } = {},
): Promise<string> {
  const preparedText = prepareTranslationText(text)
  if (preparedText === "") {
    return ""
  }

  const providerConfig = resolveProviderConfig(config, "translate")

  return translateTextCore({
    text: preparedText,
    langConfig: config.language,
    providerConfig,
    enableAIContentAware: config.translate.enableAIContentAware,
    extraHashTags: options.extraHashTags,
    webPageContext: options.webPageContext,
  })
}

/**
 * Page translation — uses FEATURE_PROVIDER_DEFS['translate'].
 * Includes skip-language logic (page translation only).
 */
export async function translateTextForPage(text: string): Promise<string> {
  const config = await getConfigOrThrow()
  const providerConfig = resolveProviderConfig(config, "translate")
  const webPageContext = await getWebPagePromptContext(providerConfig, config.translate.enableAIContentAware, true)

  return translateTextUsingPageConfig(config, text, {
    webPageContext,
  })
}

/**
 * Page title translation — uses page translation settings, but always treats the
 * current source title as the webpage title context.
 */
export async function translateTextForPageTitle(text: string): Promise<string> {
  const config = await getConfigOrThrow()
  const providerConfig = resolveProviderConfig(config, "translate")
  const webPageContext = config.translate.enableAIContentAware
    ? await getWebPagePromptContext(providerConfig, true, false)
    : undefined

  return translateTextUsingPageConfig(config, text, {
    extraHashTags: ["pageTitleTranslation"],
    webPageContext: {
      webTitle: text,
      webDescription: webPageContext?.webDescription,
      webContent: webPageContext?.webContent,
      webSummary: webPageContext?.webSummary,
    },
  })
}
