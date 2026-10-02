import type { ContentScriptContext } from "#imports"
import { subscribeLocalConfig } from "@/utils/config/storage"
import { PRELOAD_MARGIN_PX, PRELOAD_THRESHOLD } from "@/utils/constants/translate"
import { detectPageLanguageLightweight } from "@/utils/content/page-language"
import { ensurePresetStyles } from "@/utils/host/translate/ui/style-injector"
import { createWordPrefixEmphasisController } from "@/utils/host/word-prefix-emphasis"
import { logger } from "@/utils/logger"
import { onMessage, sendMessage } from "@/utils/message"
import { areSamePageTranslationOrigin } from "@/utils/url"
import { setupUrlChangeListener } from "./listen"
import { mountHostToast } from "./mount-host-toast"
import { bindTranslationShortcutKey } from "./translation-control/bind-translation-shortcut"
import { watchConfigChanges } from "./translation-control/handle-config-change"
import { PageTranslationManager } from "./translation-control/page-translation"

export async function bootstrapHostContent(ctx: ContentScriptContext) {
  ensurePresetStyles(document)
  const cleanupUrlListener = setupUrlChangeListener()
  const removeHostToast = window === window.top ? mountHostToast() : () => {}

  const manager = new PageTranslationManager({
    root: null,
    rootMargin: `${PRELOAD_MARGIN_PX}px`,
    threshold: PRELOAD_THRESHOLD,
  })

  const unwatchConfig = watchConfigChanges(manager)
  const wordPrefixEmphasis = createWordPrefixEmphasisController(document)
  const unsubscribeWordPrefixEmphasis = subscribeLocalConfig(config => wordPrefixEmphasis.setEnabled(config?.reading.wordPrefixEmphasis === true))

  // Register messages before awaiting storage or the background.
  const cleanupTranslationStateListener = onMessage("askManagerToTogglePageTranslation", (msg) => {
    const { enabled } = msg.data
    if (enabled === manager.isActive)
      return
    if (!enabled) {
      manager.stop()
      return
    }
    void manager.start().catch(error => logger.error("Failed to start page translation", error))
  })

  const cleanupFrameTranslationStateListener = window === window.top
    ? () => {}
    : onMessage("notifyTranslationStateChanged", (msg) => {
        const { enabled } = msg.data
        if (enabled === manager.isActive)
          return
        if (!enabled) {
          manager.stop()
          return
        }
        void manager.start().catch(error => logger.error("Failed to start page translation in an iframe", error))
      })

  const detectAndReportPageLanguage = async (url: string) => {
    try {
      const { detectedCodeOrUnd } = await detectPageLanguageLightweight()
      await sendMessage("reportDetectedPageLanguage", { url, detectedCodeOrUnd })
    }
    catch (error) {
      logger.error("Failed to detect and report the page language", error)
    }
  }

  const cleanupDetectedLanguageRefreshListener = window === window.top
    ? onMessage("refreshDetectedPageLanguage", () => {
        void detectAndReportPageLanguage(window.location.href)
      })
    : () => {}

  // A failed shortcut read must not disable the popup's translation button.
  let cleanupTranslationShortcut = () => {}
  try {
    cleanupTranslationShortcut = await bindTranslationShortcutKey(manager)
  }
  catch (error) {
    logger.error("Failed to bind the page-translation shortcut", error)
  }

  // For late-loading iframes: check if translation is already enabled for this tab
  let translationEnabled = false
  try {
    translationEnabled = await sendMessage("getEnablePageTranslationFromContentScript", undefined)
  }
  catch (error) {
    // Extension context may be invalidated during update, proceed without auto-start
    logger.error("Failed to check translation state:", error)
  }
  if (translationEnabled) {
    void manager.start().catch(error => logger.error("Failed to resume page translation", error))
  }

  const handleUrlChange = async (from: string, to: string) => {
    if (from !== to) {
      logger.info("URL changed from", from, "to", to)
      try {
        if (manager.isActive) {
          if (areSamePageTranslationOrigin(from, to)) {
            await manager.restart()
          }
          else {
            manager.stop()
          }
        }
      }
      catch (error) {
        logger.error("Failed to update page translation after a URL change", error)
      }
      // Only the top frame should detect and set language to avoid race conditions from iframes
      if (window === window.top) {
        await detectAndReportPageLanguage(to)
      }
    }
  }

  const handleExtensionUrlChange = (e: any) => {
    const { from, to } = e.detail
    void handleUrlChange(from, to)
  }
  window.addEventListener("extension:URLChange", handleExtensionUrlChange)

  ctx.onInvalidated(() => {
    removeHostToast()
    cleanupUrlListener()
    cleanupTranslationShortcut()
    unwatchConfig()
    unsubscribeWordPrefixEmphasis()
    wordPrefixEmphasis.setEnabled(false)
    cleanupTranslationStateListener()
    cleanupFrameTranslationStateListener()
    cleanupDetectedLanguageRefreshListener()
    window.removeEventListener("extension:URLChange", handleExtensionUrlChange)
    window.__READ_FROG_HOST_INJECTED__ = false
  })

  // Only the top frame should detect and set language to avoid race conditions from iframes
  if (window === window.top) {
    await detectAndReportPageLanguage(window.location.href)
  }
}
