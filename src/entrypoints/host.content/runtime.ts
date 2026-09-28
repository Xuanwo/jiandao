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

  // Translate the page again when the popup or the options page changes the translation mode.
  // A change before this point needs no action: page translation starts later and reads the current config.
  const unwatchConfig = watchConfigChanges(manager)

  // Turn the word-prefix emphasis on and off when the reader changes the setting.
  const wordPrefixEmphasis = createWordPrefixEmphasisController(document)
  const unsubscribeWordPrefixEmphasis = subscribeLocalConfig(config => wordPrefixEmphasis.setEnabled(config?.reading.wordPrefixEmphasis === true))

  const cleanupTranslationShortcut = await bindTranslationShortcutKey(manager)

  const detectAndReportPageLanguage = async (url: string) => {
    const { detectedCodeOrUnd } = await detectPageLanguageLightweight()
    void sendMessage("reportDetectedPageLanguage", { url, detectedCodeOrUnd })
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
    void manager.start()
  }

  const handleUrlChange = async (from: string, to: string) => {
    if (from !== to) {
      logger.info("URL changed from", from, "to", to)
      if (manager.isActive) {
        if (areSamePageTranslationOrigin(from, to)) {
          await manager.restart()
        }
        else {
          manager.stop()
        }
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

  // Listen for translation state changes from background
  const cleanupTranslationStateListener = onMessage("askManagerToTogglePageTranslation", (msg) => {
    const { enabled } = msg.data
    if (enabled === manager.isActive)
      return
    enabled ? void manager.start() : manager.stop()
  })

  const cleanupFrameTranslationStateListener = window === window.top
    ? () => {}
    : onMessage("notifyTranslationStateChanged", (msg) => {
        const { enabled } = msg.data
        if (enabled === manager.isActive)
          return
        enabled ? void manager.start() : manager.stop()
      })

  const cleanupDetectedLanguageRefreshListener = window === window.top
    ? onMessage("refreshDetectedPageLanguage", () => {
        void detectAndReportPageLanguage(window.location.href)
      })
    : () => {}

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
