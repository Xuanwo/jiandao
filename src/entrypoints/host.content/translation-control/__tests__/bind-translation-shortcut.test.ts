// @vitest-environment jsdom
import type { PageTranslationManager } from "../page-translation"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { bindTranslationShortcutKey } from "../bind-translation-shortcut"

const { mockGetLocalConfig } = vi.hoisted(() => ({
  mockGetLocalConfig: vi.fn(),
}))

vi.mock("@/utils/config/storage", () => ({
  getLocalConfig: mockGetLocalConfig,
}))

function createManager(isActive = false): PageTranslationManager {
  return {
    isActive,
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
  } as unknown as PageTranslationManager
}

function press(target: EventTarget, init: KeyboardEventInit) {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  return event
}

describe("bindTranslationShortcutKey", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetLocalConfig.mockResolvedValue({ translate: { page: { shortcut: "Alt+E" } } })
    document.body.innerHTML = ""
  })

  it("starts translation on the shortcut and swallows the key press", async () => {
    const manager = createManager(false)
    const cleanup = await bindTranslationShortcutKey(manager)

    const event = press(document.body, { key: "e", altKey: true })

    expect(manager.start).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)

    cleanup()
    press(document.body, { key: "e", altKey: true })
    expect(manager.start).toHaveBeenCalledTimes(1)
  })

  it("stops translation when it is active", async () => {
    const manager = createManager(true)
    await bindTranslationShortcutKey(manager)

    press(document.body, { key: "E", altKey: true })

    expect(manager.stop).toHaveBeenCalledTimes(1)
    expect(manager.start).not.toHaveBeenCalled()
  })

  it("ignores other keys, extra modifiers and presses inside inputs", async () => {
    const manager = createManager(false)
    await bindTranslationShortcutKey(manager)
    const input = document.createElement("input")
    document.body.append(input)

    press(document.body, { key: "e" })
    press(document.body, { key: "e", altKey: true, shiftKey: true })
    press(input, { key: "e", altKey: true })

    expect(manager.start).not.toHaveBeenCalled()
  })

  it("does nothing when the shortcut is empty", async () => {
    mockGetLocalConfig.mockResolvedValue({ translate: { page: { shortcut: "" } } })
    const manager = createManager(false)
    const cleanup = await bindTranslationShortcutKey(manager)

    press(document.body, { key: "e", altKey: true })

    expect(manager.start).not.toHaveBeenCalled()
    cleanup()
  })
})
