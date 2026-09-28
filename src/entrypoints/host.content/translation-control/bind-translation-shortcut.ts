import type { PageTranslationManager } from "./page-translation"
import { getLocalConfig } from "@/utils/config/storage"
import { eventMatchesHotkey, isEditableTarget } from "@/utils/hotkeys"
import { isPageTranslationShortcutEmpty, isValidConfiguredPageTranslationShortcut } from "@/utils/page-translation-shortcut"

/**
 * Toggles page translation on the configured shortcut. Typing into a field
 * never triggers it, and a matched press does not reach the page.
 */
export async function bindTranslationShortcutKey(pageTranslationManager: PageTranslationManager, target: Document = document) {
  const config = await getLocalConfig()
  if (!config || isPageTranslationShortcutEmpty(config.translate.page.shortcut)) {
    return () => {}
  }

  const shortcut = config.translate.page.shortcut
  if (!isValidConfiguredPageTranslationShortcut(shortcut)) {
    return () => {}
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.repeat || isEditableTarget(event.target) || !eventMatchesHotkey(event, shortcut))
      return
    event.preventDefault()
    event.stopPropagation()
    if (pageTranslationManager.isActive) {
      pageTranslationManager.stop()
    }
    else {
      void pageTranslationManager.start()
    }
  }

  target.addEventListener("keydown", onKeyDown, true)
  return () => {
    target.removeEventListener("keydown", onKeyDown, true)
  }
}
