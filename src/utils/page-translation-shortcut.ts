import type { HotkeyPlatform } from "./hotkeys"
import { detectPlatform, formatForDisplay, formatHotkey, keyFromEvent, parseHotkey } from "./hotkeys"

export type { HotkeyPlatform }

export function isPageTranslationShortcutEmpty(hotkey: string | null | undefined): boolean {
  return !hotkey?.trim()
}

export function formatPageTranslationShortcut(hotkey: string | null | undefined, platform?: HotkeyPlatform): string {
  if (isPageTranslationShortcutEmpty(hotkey)) {
    return ""
  }
  return formatForDisplay(hotkey?.trim() ?? "", platform)
}

/** A usable page shortcut has at least one modifier and exactly one key. */
export function isValidConfiguredPageTranslationShortcut(hotkey: string, platform: HotkeyPlatform = detectPlatform()): boolean {
  const normalized = normalizePageTranslationShortcut(hotkey, platform)
  if (!normalized)
    return false
  const parsed = parseHotkey(normalized, platform)
  return !!parsed && !!parsed.key && (parsed.ctrl || parsed.alt || parsed.shift || parsed.meta)
}

/** "Ctrl+e" → "Mod+E" on Windows and Linux, "Meta+e" → "Mod+E" on macOS; null when the string is not a shortcut. */
export function normalizePageTranslationShortcut(hotkey: string, platform: HotkeyPlatform = detectPlatform()): string | null {
  if (isPageTranslationShortcutEmpty(hotkey)) {
    return ""
  }
  const parsed = parseHotkey(hotkey, platform)
  if (!parsed || !parsed.key)
    return null
  return formatHotkey(parsed, platform)
}

export function keyboardEventToPageTranslationShortcut(
  event: KeyboardEvent,
  platform: HotkeyPlatform = detectPlatform(),
): string | null {
  return formatHotkey({
    ctrl: event.ctrlKey,
    alt: event.altKey,
    shift: event.shiftKey,
    meta: event.metaKey,
    key: keyFromEvent(event),
  }, platform) || null
}
