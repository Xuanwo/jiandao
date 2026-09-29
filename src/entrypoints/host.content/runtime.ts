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
  const manager = new PageTranslationManager({
    root: null,
    rootMargin: `${PRELOAD_MARGIN_PX}px`,
    threshold: PRELOAD_THRESHOLD,
  })

  // The message handlers come first, before anything that can fail.
  //
  // The popup's translate button talks to `askManagerToTogglePageTranslation`.
  // Everything below reads storage or asks the background, and each of those can
  // throw — a storage hiccup, an extension context invalidated by a reload, a
  // profile that never had a config. Registering this handler after them meant
  // any such failure left the page permanently unable to translate: the button
  // did nothing, nothing was shown to the reader, and nothing was logged.
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

  // Everything from here on is best-effort: it must not be able to take the
  // handlers above down with it.
  try {
    ensurePresetStyles(document)
  }
  catch (error) {
    logger.error("Failed to inject the preset styles", error)
  }

  let cleanupUrlListener = () => {}
  try {
    cleanupUrlListener = setupUrlChangeListener()
  }
  catch (error) {
    logger.error("Failed to set up URL change detection", error)
  }

  const removeHostToast = window === window.top
    ? (() => {
        try {
          return mountHostToast()
        }
        catch (error) {
          logger.error("Failed to mount the page toast", error)
          return () => {}
        }
      })()
    : () => {}

  // Translate the page again when the popup or the options page changes the translation mode.
  // A change before this point needs no action: page translation starts later and reads the current config.
  const unwatchConfig = setupStorageWatch("the config watch", () => watchConfigChanges(manager))

  // Turn the word-prefix emphasis on and off when the reader changes the setting.
  let wordPrefixEmphasis = { setEnabled: (_enabled: boolean) => {} }
  try {
    wordPrefixEmphasis = createWordPrefixEmphasisController(document)
  }
  catch (error) {
    logger.error("Failed to set up word-prefix emphasis", error)
  }
  const unsubscribeWordPrefixEmphasis = setupStorageWatch(
    "the word-prefix emphasis watch",
    () => subscribeLocalConfig(config => wordPrefixEmphasis.setEnabled(config?.reading.wordPrefixEmphasis === true)),
  )

  // The shortcut is a convenience; the popup's button is the main way in.
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

/**
 * Storage watches talk to the storage area, which throws in an invalidated
 * extension context. Returns a cleanup function either way, so the caller's
 * teardown stays correct.
 */
function setupStorageWatch(what: string, setup: () => () => void): () => void {
  try {
    return setup()
  }
  catch (error) {
    logger.error(`Failed to set up ${what}`, error)
    return () => {}
  }
}
