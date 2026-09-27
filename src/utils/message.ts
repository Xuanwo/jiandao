import type { LangCodeISO6393 } from "@/definitions"
import type {
  BackgroundGenerateTextPayload,
  BackgroundGenerateTextResponse,
} from "@/types/background-generate-text"
import type { Config } from "@/types/config/config"
import type { ProviderConfig } from "@/types/config/provider"
import type { BatchQueueConfig, RequestQueueConfig } from "@/types/config/translate"
import type { TranslationProgress } from "@/types/translation-progress"
import type { ThinkingFallback } from "@/utils/providers/thinking-fallback"
import { defineExtensionMessaging } from "@webext-core/messaging"

interface ProtocolMap {
  // navigation
  openOptionsPage: (data?: { section?: string }) => void
  // translation state
  getEnablePageTranslationByTabId: (data: { tabId: number }) => boolean | undefined
  getEnablePageTranslationFromContentScript: () => Promise<boolean>
  tryToSetEnablePageTranslationByTabId: (data: { tabId: number, enabled: boolean }) => void
  setAndNotifyPageTranslationStateChangedByManager: (data: { enabled: boolean, url?: string }) => void
  notifyTranslationStateChanged: (data: { enabled: boolean }) => void
  reportDetectedPageLanguage: (data: { detectedCodeOrUnd: LangCodeISO6393 | "und", url: string }) => void
  refreshDetectedPageLanguage: () => void
  getDetectedCode: () => LangCodeISO6393
  detectedPageLanguageChanged: (data: { detectedCode: LangCodeISO6393 }) => void
  // broadcast to extension pages (popup) when a tab's translation state changes
  pageTranslationStateChanged: (data: { tabId: number, enabled: boolean }) => void
  // ask host to start page translation
  askManagerToTogglePageTranslation: (data: { enabled: boolean }) => void
  // translation progress (content script -> background -> popup)
  reportTranslationProgress: (data: TranslationProgress) => void
  getTranslationProgressByTabId: (data: { tabId: number }) => TranslationProgress | null
  translationProgressChanged: (data: { tabId: number, progress: TranslationProgress }) => void
  // request
  enqueueTranslateRequest: (data: { text: string, langConfig: Config["language"], providerConfig: ProviderConfig, scheduleAt: number, hash: string, webTitle?: string | null, webDescription?: string | null, webContent?: string | null, webSummary?: string | null }) => Promise<string>
  // Background to the tab: a custom provider now uses the thinking fallback options.
  notifyThinkingFallback: (data: Pick<ThinkingFallback, "kind" | "reason">) => void
  getOrGenerateWebPageSummary: (data: { webTitle: string, webContent: string, providerConfig: ProviderConfig }) => Promise<string | null>
  backgroundGenerateText: (data: BackgroundGenerateTextPayload) => Promise<BackgroundGenerateTextResponse>
  setTranslateRequestQueueConfig: (data: Partial<RequestQueueConfig>) => void
  setTranslateBatchQueueConfig: (data: Partial<BatchQueueConfig>) => void
  // cache management
  clearAllTranslationRelatedCache: () => Promise<void>
}

export const { sendMessage, onMessage }
  = defineExtensionMessaging<ProtocolMap>()
