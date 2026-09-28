/**
 * Keyboard shortcuts as portable strings such as "Mod+Shift+K": "Mod" is
 * Command on macOS and Control elsewhere, the key is a single uppercase
 * character or a named key ("Escape", "F5", "ArrowUp").
 */

export type HotkeyPlatform = "mac" | "windows" | "linux"

export interface ParsedHotkey {
  ctrl: boolean
  alt: boolean
  shift: boolean
  meta: boolean
  /** The primary key, normalized; empty when the string has none. */
  key: string
}

const MODIFIER_ALIASES: Record<string, keyof Omit<ParsedHotkey, "key">> = {
  control: "ctrl",
  ctrl: "ctrl",
  alt: "alt",
  option: "alt",
  shift: "shift",
  meta: "meta",
  cmd: "meta",
  command: "meta",
  super: "meta",
  win: "meta",
}

const MODIFIER_EVENT_KEYS = new Set(["Control", "Alt", "Shift", "Meta", "AltGraph", "OS", "Hyper", "Super", "Fn", "CapsLock", "NumLock", "ScrollLock"])

/** `event.code` → key for punctuation, used when `event.key` is a dead key or altered by Option on macOS. */
export const PUNCTUATION_CODE_MAP: Record<string, string> = {
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Backquote: "`",
  Comma: ",",
  Period: ".",
  Slash: "/",
}

export function detectPlatform(): HotkeyPlatform {
  if (typeof navigator === "undefined")
    return "linux"
  const platform = `${navigator.platform ?? ""} ${navigator.userAgent ?? ""}`
  if (/mac|iphone|ipad|ipod/i.test(platform))
    return "mac"
  if (/win/i.test(platform))
    return "windows"
  return "linux"
}

export function isModifierKey(key: string): boolean {
  return MODIFIER_EVENT_KEYS.has(key)
}

/** Single characters become uppercase, so "k" and "K" (with Shift) name the same key. */
export function normalizeKeyName(key: string): string {
  if (key === " ")
    return "Space"
  if (key === "Esc")
    return "Escape"
  if (key.length === 1)
    return key.toUpperCase()
  return key
}

/**
 * Splits "Ctrl+Shift+k" into flags and a key. "Mod" resolves to Command on
 * macOS and Control elsewhere; unknown or repeated parts make it invalid.
 */
export function parseHotkey(hotkey: string, platform: HotkeyPlatform = detectPlatform()): ParsedHotkey | null {
  const parts = hotkey.split("+").map(part => part.trim())
  if (parts.includes(""))
    return null
  const parsed: ParsedHotkey = { ctrl: false, alt: false, shift: false, meta: false, key: "" }
  for (const part of parts) {
    const lower = part.toLowerCase()
    const modifier = lower === "mod" ? (platform === "mac" ? "meta" : "ctrl") : MODIFIER_ALIASES[lower]
    if (modifier) {
      if (parsed[modifier])
        return null
      parsed[modifier] = true
      continue
    }
    if (parsed.key)
      return null
    parsed.key = normalizeKeyName(part)
  }
  return parsed
}

/** The canonical string: Mod, Control, Alt, Shift, Meta in that order, then the key. */
export function formatHotkey(parsed: ParsedHotkey, platform: HotkeyPlatform = detectPlatform()): string {
  const useMod = platform === "mac" ? parsed.meta && !parsed.ctrl : parsed.ctrl && !parsed.meta
  const parts: string[] = []
  if (useMod)
    parts.push("Mod")
  if (parsed.ctrl && !useMod)
    parts.push("Control")
  if (parsed.alt)
    parts.push("Alt")
  if (parsed.shift)
    parts.push("Shift")
  if (parsed.meta && !useMod)
    parts.push("Meta")
  if (parsed.key)
    parts.push(parsed.key)
  return parts.join("+")
}

const MAC_SYMBOLS: Record<string, string> = { Mod: "⌘", Control: "⌃", Alt: "⌥", Shift: "⇧", Meta: "⌘" }
const OTHER_NAMES: Record<string, string> = { Mod: "Ctrl", Control: "Ctrl", Alt: "Alt", Shift: "Shift", Meta: "Win" }

/** "Mod+Shift+K" → "⌘ ⇧ K" on macOS, "Ctrl+Shift+K" elsewhere. */
export function formatForDisplay(hotkey: string, platform: HotkeyPlatform = detectPlatform()): string {
  const parts = hotkey.split("+").map(part => part.trim()).filter(Boolean)
  if (platform === "mac")
    return parts.map(part => MAC_SYMBOLS[part] ?? part).join(" ")
  return parts.map(part => OTHER_NAMES[part] ?? part).join("+")
}

/** The key a keyboard event names, using the physical key when Option or a dead key changed `event.key`. */
export function keyFromEvent(event: Pick<KeyboardEvent, "key" | "code" | "altKey">): string {
  const normalized = normalizeKeyName(event.key)
  if (event.code && (normalized === "Dead" || event.altKey)) {
    if (/^Key[A-Z]$/.test(event.code))
      return event.code.slice(3)
    if (/^Digit\d$/.test(event.code))
      return event.code.slice(5)
    if (event.code in PUNCTUATION_CODE_MAP)
      return PUNCTUATION_CODE_MAP[event.code]
  }
  return normalized
}

/** Whether the event is exactly this shortcut: same modifiers, same key. */
export function eventMatchesHotkey(event: KeyboardEvent, hotkey: string, platform: HotkeyPlatform = detectPlatform()): boolean {
  const parsed = parseHotkey(hotkey, platform)
  if (!parsed || !parsed.key)
    return false
  return event.ctrlKey === parsed.ctrl
    && event.altKey === parsed.alt
    && event.shiftKey === parsed.shift
    && event.metaKey === parsed.meta
    && keyFromEvent(event) === parsed.key
}

const EDITABLE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"])

/** True when the event target takes typed text, so shortcuts should leave it alone. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element))
    return false
  const element = target instanceof HTMLElement ? target : null
  return EDITABLE_TAGS.has(target.tagName) || !!element?.isContentEditable
}
