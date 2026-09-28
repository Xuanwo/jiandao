import { browser } from "#imports"
import { logger } from "@/utils/logger"

/*
 * The toolbar icon is a page with two lines of text; on a tab that is
 * translated, the lower line becomes the vermilion translation strip
 * (design/Icon.dc.html, sources in design/assets/icon*.svg).
 */
const IDLE_ICON = { 16: "/icon/16.png", 32: "/icon/32.png" }
const TRANSLATED_ICON = { 16: "/icon/translated-16.png", 32: "/icon/translated-32.png" }

/**
 * Reflects a tab's page translation state on the toolbar icon so the reader
 * can see it without opening the popup.
 */
export async function updateActionIcon(tabId: number, active: boolean): Promise<void> {
  try {
    await browser.action.setIcon({ tabId, path: active ? TRANSLATED_ICON : IDLE_ICON })
  }
  catch (error) {
    // The tab may already be gone.
    logger.warn("Failed to update action icon", error)
  }
}
