import type { WebPageContext } from "@/types/content"
import { extractArticleText } from "@/utils/content/article"
import { getDocumentDescription } from "@/utils/content/metadata"
import { logger } from "@/utils/logger"
import { truncateWebPageContent } from "./webpage-content"

export interface CachedWebPageContext extends WebPageContext {
  url: string
  webContent: string
}

let cachedWebPageContext: CachedWebPageContext | null = null

function extractWebpageContent(): string {
  try {
    return extractArticleText(document)
  }
  catch (error) {
    logger.warn("Article extraction failed, falling back to body text:", error)
    return document.body?.textContent || ""
  }
}

/**
 * Title, description and main text of the page, read once per URL before
 * translation changes the DOM, so the model's context stays the original.
 */
export async function getOrCreateWebPageContext(): Promise<CachedWebPageContext | null> {
  if (typeof window === "undefined" || typeof document === "undefined")
    return null

  const currentUrl = window.location.href
  if (cachedWebPageContext?.url === currentUrl) {
    return cachedWebPageContext
  }

  cachedWebPageContext = {
    url: currentUrl,
    webTitle: document.title || "",
    webDescription: getDocumentDescription(document),
    webContent: truncateWebPageContent(extractWebpageContent()),
  }
  return cachedWebPageContext
}
